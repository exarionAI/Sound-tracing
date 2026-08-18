import { AlertTriangle, Palette, Pause, Play, Radio, RotateCcw, Ruler, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  formatBackendMode,
  formatQualityPreset,
  loadSoundTracingRuntime,
  type ShoeboxFrame,
  type SoundTracingBackendMode,
  type SoundTracingQualityPreset,
} from '../../integration/soundTracingRuntime';
import { publicAssetUrl } from '../../integration/publicAssetUrl';
import {
  type AudioRenderMode,
  createShoeboxSdkAudioSession,
  type RoomMaterialName,
  type ShoeboxSdkAudioSession,
} from '../audio/soundTraceSdkAudio';
import { BackendSelect, QualityPresetSelect } from '../shared/BackendSelect';

const ROOM_W = 8;
const ROOM_H = 4;
const ROOM_D = 8;
const SRC_RADIUS = 2.5;
const SRC_Y = 0;
const ROOM_FLOOR_Y = -ROOM_H / 2;
const FLOOR_VISUAL_Y = ROOM_FLOOR_Y + 0.012;
const GRID_VISUAL_Y = ROOM_FLOOR_Y + 0.032;
const FLOOR_GRID_SIZE = ROOM_W - 0.24;
const LISTENER_POSITION = new THREE.Vector3(0, 0, 0);

type RoomMaterialId = 'fabric' | 'concrete' | 'snow' | 'waterSurface';

interface RoomMaterialPreset {
  label: string;
  sdkMaterial: RoomMaterialName;
  color: number;
  floorColor: number;
  edgeColor: number;
  gridColor: number;
  opacity: number;
  floorOpacity: number;
  roughness: number;
  metalness: number;
  absorption: number;
}

const defaultRoomScale = 1;

const roomMaterialPresets: Record<RoomMaterialId, RoomMaterialPreset> = {
  fabric: {
    label: 'Fabric',
    sdkMaterial: 'fabric',
    color: 0x6b477a,
    floorColor: 0x4e345a,
    edgeColor: 0xd7a8e6,
    gridColor: 0x8b65a1,
    opacity: 0.5,
    floorOpacity: 0.72,
    roughness: 0.96,
    metalness: 0,
    absorption: 0.72,
  },
  concrete: {
    label: 'Concrete',
    sdkMaterial: 'concrete',
    color: 0x2d3a42,
    floorColor: 0x253137,
    edgeColor: 0x6aa0aa,
    gridColor: 0x38545e,
    opacity: 0.36,
    floorOpacity: 0.62,
    roughness: 0.86,
    metalness: 0,
    absorption: 0.32,
  },
  snow: {
    label: 'Snow',
    sdkMaterial: 'sand',
    color: 0xf4fbff,
    floorColor: 0xe7f3f8,
    edgeColor: 0xd5f1fb,
    gridColor: 0x9ec5d2,
    opacity: 0.58,
    floorOpacity: 0.82,
    roughness: 0.68,
    metalness: 0,
    absorption: 0.56,
  },
  waterSurface: {
    label: 'Water Surface',
    sdkMaterial: 'water',
    color: 0x2d90a5,
    floorColor: 0x1d5f72,
    edgeColor: 0x8ff5ff,
    gridColor: 0x61dce9,
    opacity: 0.52,
    floorOpacity: 0.76,
    roughness: 0.16,
    metalness: 0,
    absorption: 0.08,
  },
};

export function ShoeboxRoom(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const movingRef = useRef(true);
  const backendModeRef = useRef<SoundTracingBackendMode>('st');
  const qualityPresetRef = useRef<SoundTracingQualityPreset>('middle');
  const audioSessionRef = useRef<ShoeboxSdkAudioSession | null>(null);
  const audioRenderModeRef = useRef<AudioRenderMode>('sound-tracing');
  const sourcePositionRef = useRef<[number, number, number]>([SRC_RADIUS, SRC_Y, 0]);
  const roomScaleRef = useRef(defaultRoomScale);
  const roomMaterialRef = useRef<RoomMaterialId>('concrete');
  const resetRef = useRef<(() => void) | null>(null);
  const [moving, setMoving] = useState(true);
  const [frame, setFrame] = useState<ShoeboxFrame | null>(null);
  const [runtimeMode, setRuntimeMode] = useState('loading');
  const [backendMode, setBackendMode] = useState<SoundTracingBackendMode>('st');
  const [qualityPreset, setQualityPreset] = useState<SoundTracingQualityPreset>('middle');
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [audioRenderMode, setAudioRenderMode] = useState<AudioRenderMode>('sound-tracing');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [sdkPathCount, setSdkPathCount] = useState<number | null>(null);
  const [roomScale, setRoomScale] = useState(defaultRoomScale);
  const [roomMaterial, setRoomMaterial] = useState<RoomMaterialId>('concrete');
  const activeMaterial = roomMaterialPresets[roomMaterial];
  const audioLowpassHz = frame?.lowpassHz ?? getMaterialLowpass(activeMaterial.absorption);
  const audioEnabled = audioState === 'running';
  const audioLoading = audioState === 'loading';

  const updateMoving = (enabled: boolean): void => {
    movingRef.current = enabled;
    setMoving(enabled);
  };

  const updateRoomScale = (value: string): void => {
    const nextValue = Number(value);
    setRoomScale(nextValue);
  };

  const stopSdkAudio = (nextState: 'idle' | 'error' = 'idle'): void => {
    audioSessionRef.current?.dispose();
    audioSessionRef.current = null;
    setAudioState(nextState);
    setSdkPathCount(null);
    if (nextState === 'idle') setAudioError(null);
  };

  const handleSdkAudioError = (error: unknown): void => {
    const reason = error instanceof Error ? error.message : String(error);
    audioSessionRef.current?.dispose();
    audioSessionRef.current = null;
    setSdkPathCount(null);
    setAudioError(`SDK audio failed: ${reason}`);
    setAudioState('error');
  };

  const toggleAudioRenderMode = (): void => {
    const nextMode: AudioRenderMode = audioRenderModeRef.current === 'sound-tracing'
      ? 'web-audio'
      : 'sound-tracing';
    audioRenderModeRef.current = nextMode;
    setAudioRenderMode(nextMode);
    audioSessionRef.current?.setRenderMode(nextMode);
  };

  const toggleAudio = async (): Promise<void> => {
    if (audioLoading) return;
    if (audioSessionRef.current) {
      stopSdkAudio();
      return;
    }

    setAudioState('loading');
    setAudioError(null);
    setSdkPathCount(null);

    try {
      const material = roomMaterialRef.current;
      const session = await createShoeboxSdkAudioSession({
        backendMode: backendModeRef.current,
        qualityPreset: qualityPresetRef.current,
        audioUrl: publicAssetUrl('PinkDawn.mp3'),
        source: sourcePositionRef.current,
        listener: [LISTENER_POSITION.x, LISTENER_POSITION.y, LISTENER_POSITION.z],
        roomSize: getRoomSize(roomScaleRef.current),
        material: roomMaterialPresets[material].sdkMaterial,
        renderMode: audioRenderModeRef.current,
      });
      audioSessionRef.current = session;
      setAudioState('running');
    } catch (error) {
      handleSdkAudioError(error);
    }
  };

  const updateBackendMode = (value: SoundTracingBackendMode): void => {
    if (audioSessionRef.current) stopSdkAudio();
    backendModeRef.current = value;
    setBackendMode(value);
  };

  const updateQualityPreset = (value: SoundTracingQualityPreset): void => {
    if (audioSessionRef.current) stopSdkAudio();
    qualityPresetRef.current = value;
    setQualityPreset(value);
  };

  useEffect(() => {
    backendModeRef.current = backendMode;
  }, [backendMode]);

  useEffect(() => {
    qualityPresetRef.current = qualityPreset;
  }, [qualityPreset]);

  useEffect(() => () => {
    audioSessionRef.current?.dispose();
    audioSessionRef.current = null;
  }, []);

  useEffect(() => {
    roomScaleRef.current = roomScale;
  }, [roomScale]);

  useEffect(() => {
    roomMaterialRef.current = roomMaterial;
  }, [roomMaterial]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let disposed = false;
    let frameId = 0;
    let angle = 0;
    let lastTime = performance.now();
    let lastReport = 0;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101417);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(ROOM_W * 0.9, ROOM_H * 0.95, ROOM_D * 1.35);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0, 0);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.minDistance = 2;
    orbit.maxDistance = 32;
    orbit.maxPolarAngle = Math.PI * 0.495;

    scene.add(new THREE.HemisphereLight(0xd7fcff, 0x1d2730, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(5, 10, 7);
    key.castShadow = true;
    scene.add(key);

    const roomGroup = new THREE.Group();
    scene.add(roomGroup);
    const roomGeometry = new THREE.BoxGeometry(ROOM_W, ROOM_H, ROOM_D);
    const roomMaterialObject = new THREE.MeshStandardMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const roomMesh = new THREE.Mesh(
      roomGeometry,
      roomMaterialObject,
    );
    roomGroup.add(roomMesh);
    const floorMaterial = new THREE.MeshStandardMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = FLOOR_VISUAL_Y;
    floorMesh.renderOrder = 1;
    roomGroup.add(floorMesh);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x6aa0aa,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
    });
    const roomEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(roomGeometry),
      edgeMaterial,
    );
    roomEdges.renderOrder = 4;
    roomGroup.add(roomEdges);
    const grid = new THREE.GridHelper(FLOOR_GRID_SIZE, 8, 0x4c6f74, 0x233036);
    grid.position.y = GRID_VISUAL_Y;
    grid.renderOrder = 3;
    const initialGridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    initialGridMaterials.forEach((material) => {
      if (material instanceof THREE.LineBasicMaterial) {
        material.transparent = true;
        material.opacity = 0.68;
        material.depthWrite = false;
      }
    });
    roomGroup.add(grid);
    let appliedMaterial: RoomMaterialId | null = null;

    const sourceMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 32, 20),
      new THREE.MeshStandardMaterial({ color: 0xe54b4b, emissive: 0x481212, roughness: 0.38 }),
    );
    sourceMesh.castShadow = true;
    scene.add(sourceMesh);

    const listenerGroup = new THREE.Group();
    listenerGroup.position.copy(LISTENER_POSITION);
    listenerGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 28, 18),
      new THREE.MeshStandardMaterial({ color: 0x3578e5, emissive: 0x0f2d63, roughness: 0.42 }),
    ));
    const listenerDirection = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.55, 24),
      new THREE.MeshStandardMaterial({ color: 0x8bb8ff, emissive: 0x112c55 }),
    );
    listenerDirection.rotation.x = -Math.PI / 2;
    listenerDirection.position.z = -0.48;
    listenerGroup.add(listenerDirection);
    scene.add(listenerGroup);

    const directLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xf1d363, transparent: true, opacity: 0.84 }),
    );
    const reflectionLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x49d49d, transparent: true, opacity: 0.58 }),
    );
    scene.add(directLine, reflectionLine);

    let runtimePromise = loadSoundTracingRuntime().then((runtime) => {
      setRuntimeMode(runtime.mode);
      return runtime;
    });

    resetRef.current = () => {
      angle = 0;
      updateMoving(true);
    };

    const resize = (): void => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const animate = async (now: number): Promise<void> => {
      if (disposed) return;
      frameId = requestAnimationFrame((time) => void animate(time));
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (movingRef.current) angle += dt * 0.72;
      const selectedBackend = backendModeRef.current;
      const selectedQuality = qualityPresetRef.current;
      const scale = roomScaleRef.current;
      const material = roomMaterialRef.current;
      const roomSize = getRoomSize(scale);
      const sourceOrbit = getSourceOrbit(scale);
      const x = Math.cos(angle) * sourceOrbit.x;
      const z = Math.sin(angle) * sourceOrbit.z;
      const sourcePosition: [number, number, number] = [x, SRC_Y, z];
      sourcePositionRef.current = sourcePosition;
      roomGroup.scale.setScalar(scale);
      if (material !== appliedMaterial) {
        applyRoomMaterial(roomMaterialObject, floorMaterial, edgeMaterial, grid, roomMaterialPresets[material]);
        appliedMaterial = material;
      }
      sourceMesh.position.set(...sourcePosition);
      sourceMesh.rotation.z -= dt * 3.2;

      orbit.update();
      renderer.render(scene, camera);

      if (now - lastReport > 180) {
        lastReport = now;
        const runtime = await runtimePromise;
        const sdkSession = audioSessionRef.current;
        let nextSdkPathCount: number | null = null;
        if (sdkSession) {
          try {
            nextSdkPathCount = await sdkSession.update({
              source: sourcePosition,
              listener: [LISTENER_POSITION.x, LISTENER_POSITION.y, LISTENER_POSITION.z],
              roomSize,
              material: roomMaterialPresets[material].sdkMaterial,
              dt,
            });
          } catch (error) {
            if (!disposed) handleSdkAudioError(error);
          }
        }
        const report = await runtime.updateShoebox({
          backendMode: selectedBackend,
          qualityPreset: selectedQuality,
          source: sourcePosition,
          listener: [LISTENER_POSITION.x, LISTENER_POSITION.y, LISTENER_POSITION.z],
          roomSize,
          surfaceAbsorption: roomMaterialPresets[material].absorption,
        });
        if (!disposed) {
          directLine.geometry.dispose();
          directLine.geometry = new THREE.BufferGeometry().setFromPoints(
            report.directPath.map((point) => new THREE.Vector3(point[0], point[1], point[2])),
          );
          reflectionLine.geometry.dispose();
          reflectionLine.geometry = new THREE.BufferGeometry().setFromPoints(
            report.reflectionPath.map((point) => new THREE.Vector3(point[0], point[1], point[2])),
          );
          setFrame(report);
          if (nextSdkPathCount !== null) setSdkPathCount(nextSdkPathCount);
        }
      }
    };
    frameId = requestAnimationFrame((time) => void animate(time));

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      runtimePromise.then((runtime) => runtime.dispose()).catch(() => undefined);
      resetRef.current = null;
      host.removeChild(renderer.domElement);
      scene.traverse((object) => {
        if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) object.geometry.dispose();
        if ('material' in object) {
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else if (material instanceof THREE.Material) material.dispose();
        }
      });
      renderer.dispose();
      runtimePromise = Promise.reject(new Error('disposed'));
      runtimePromise.catch(() => undefined);
    };
  }, []);

  return (
    <section className="scene-page" data-route="shoebox">
      <div className="scene-stage">
        <div ref={hostRef} className="three-host" data-testid="shoebox-canvas" />
        <div className="stage-title">
          <Radio aria-hidden="true" />
          <div>
            <h1>Shoebox Room</h1>
            <p>Rolling source scene</p>
          </div>
        </div>
      </div>

      <aside className="side-panel" aria-label="Shoebox controls">
        <section className="panel-section">
          <div className="panel-heading">
            <Volume2 aria-hidden="true" />
            <h2>Audio</h2>
          </div>
          <button
            type="button"
            className={`tool-button primary ${audioEnabled ? 'active' : ''}`}
            onClick={() => void toggleAudio()}
            aria-pressed={audioEnabled}
            disabled={audioLoading}
            data-testid="shoebox-audio"
          >
            <Volume2 aria-hidden="true" />
            <span>{audioLoading ? 'Loading Audio' : audioEnabled ? 'Stop Audio' : 'Play Audio'}</span>
          </button>
          <button
            type="button"
            className={`tool-button audio-mode-button ${audioRenderMode === 'sound-tracing' ? 'active' : ''}`}
            onClick={toggleAudioRenderMode}
            aria-pressed={audioRenderMode === 'sound-tracing'}
            disabled={audioLoading}
            data-testid="shoebox-audio-render-mode"
          >
            <Volume2 aria-hidden="true" />
            <span>{audioRenderMode === 'sound-tracing' ? 'Sound-tracing' : 'Web Audio'}</span>
          </button>
          {audioError && (
            <p className="inline-alert" data-testid="shoebox-audio-error">
              <AlertTriangle aria-hidden="true" />
              <span>{audioError}</span>
            </p>
          )}
        </section>

        <BackendSelect
          value={backendMode}
          onChange={updateBackendMode}
          testId="shoebox-backend-mode"
        />

        <QualityPresetSelect
          value={qualityPreset}
          onChange={updateQualityPreset}
          testId="shoebox-quality-preset"
        />

        <section className="panel-section">
          <div className="panel-heading">
            <Radio aria-hidden="true" />
            <h2>Source</h2>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="tool-button primary"
              onClick={() => updateMoving(!moving)}
              aria-pressed={moving}
            >
              {moving ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              <span>{moving ? 'Pause' : 'Move'}</span>
            </button>
            <button type="button" className="tool-button" onClick={() => resetRef.current?.()}>
              <RotateCcw aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>
        </section>

        <section className="panel-section">
          <div className="panel-heading">
            <Ruler aria-hidden="true" />
            <h2>Room Scale</h2>
          </div>
          <div className="control-stack">
            <ScaleSlider
              label="XYZ"
              value={roomScale}
              testId="room-scale"
              onChange={updateRoomScale}
            />
          </div>
        </section>

        <section className="panel-section">
          <div className="panel-heading">
            <Palette aria-hidden="true" />
            <h2>Material</h2>
          </div>
          <div className="material-grid">
            {(Object.keys(roomMaterialPresets) as RoomMaterialId[]).map((presetId) => (
              <button
                key={presetId}
                type="button"
                className={`tool-button material-button ${roomMaterial === presetId ? 'active' : ''}`}
                onClick={() => setRoomMaterial(presetId)}
                aria-pressed={roomMaterial === presetId}
                data-testid={`room-material-${presetId}`}
              >
                <span
                  className="material-swatch"
                  style={{ backgroundColor: `#${roomMaterialPresets[presetId].floorColor.toString(16).padStart(6, '0')}` }}
                  aria-hidden="true"
                />
                <span>{roomMaterialPresets[presetId].label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <div className="panel-heading">
            <Radio aria-hidden="true" />
            <h2>Propagation</h2>
          </div>
          <dl className="metric-list">
            <Metric label="Runtime" value={runtimeMode} tone={runtimeMode === 'stub' ? 'warn' : 'ok'} />
            <Metric label="Backend" value={formatBackendMode(backendMode)} testId="shoebox-backend-metric" />
            <Metric label="Preset" value={formatQualityPreset(qualityPreset)} testId="shoebox-quality-metric" />
            <Metric
              label="SDK paths"
              value={audioEnabled ? (sdkPathCount !== null ? String(sdkPathCount) : 'Running') : 'Idle'}
              tone={audioEnabled ? 'ok' : audioState === 'error' ? 'warn' : undefined}
            />
            <Metric label="Distance" value={frame ? `${frame.distanceMeters.toFixed(2)} m` : 'Measuring'} />
            <Metric label="Attenuation" value={frame ? frame.attenuation.toFixed(2) : 'Measuring'} />
            <Metric label="Low-pass" value={frame ? `${frame.lowpassHz} Hz` : `${audioLowpassHz} Hz`} />
            <Metric label="Surface" value={`${activeMaterial.label} / ${Math.round(activeMaterial.absorption * 100)}%`} />
            <Metric label="Reflection" value={frame ? frame.reflectionEnergy.toFixed(2) : 'Measuring'} />
            <Metric label="Valid paths" value={frame ? String(frame.validPathCount) : 'Measuring'} />
          </dl>
        </section>
      </aside>
    </section>
  );
}

function getRoomSize(scale: number): [number, number, number] {
  return [ROOM_W * scale, ROOM_H * scale, ROOM_D * scale];
}

function getSourceOrbit(scale: number): { x: number; z: number } {
  const [width, , depth] = getRoomSize(scale);
  return {
    x: Math.max(0.72, Math.min(SRC_RADIUS * scale, width / 2 - 0.6)),
    z: Math.max(0.72, Math.min(SRC_RADIUS * scale, depth / 2 - 0.6)),
  };
}

function applyRoomMaterial(
  roomMaterial: THREE.MeshStandardMaterial,
  floorMaterial: THREE.MeshStandardMaterial,
  edgeMaterial: THREE.LineBasicMaterial,
  grid: THREE.GridHelper,
  preset: RoomMaterialPreset,
): void {
  roomMaterial.color.setHex(preset.color);
  roomMaterial.opacity = preset.opacity;
  roomMaterial.roughness = preset.roughness;
  roomMaterial.metalness = preset.metalness;
  roomMaterial.needsUpdate = true;
  floorMaterial.color.setHex(preset.floorColor);
  floorMaterial.opacity = preset.floorOpacity;
  floorMaterial.roughness = preset.roughness;
  floorMaterial.metalness = preset.metalness;
  floorMaterial.needsUpdate = true;
  edgeMaterial.color.setHex(preset.edgeColor);
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMaterials.forEach((material) => {
    if (material instanceof THREE.LineBasicMaterial) {
      material.color.setHex(preset.gridColor);
    }
  });
}

function getMaterialLowpass(absorption: number): number {
  return Math.round(Math.min(18000, Math.max(2600, 18000 - absorption * 11800)));
}

function ScaleSlider({
  label,
  value,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  testId: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className="slider-row">
      <span>
        {label}
        <output data-testid={`${testId}-value`}>{value.toFixed(2)}x</output>
      </span>
      <input
        type="range"
        min="0.65"
        max="1.55"
        step="0.05"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        data-testid={testId}
      />
    </label>
  );
}

function Metric({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
  testId?: string;
}): JSX.Element {
  return (
    <div className={`metric-row ${tone ?? ''}`} data-testid={testId}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
