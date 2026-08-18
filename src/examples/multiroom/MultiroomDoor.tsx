import { AlertTriangle, DoorClosed, DoorOpen, Radio, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  type DoorId,
  estimateMultiroomMix,
  formatBackendMode,
  formatQualityPreset,
  loadSoundTracingRuntime,
  type MultiroomMix,
  type RoomId,
  type SoundTracingBackendMode,
  type SoundTracingQualityPreset,
} from '../../integration/soundTracingRuntime';
import { publicAssetUrl } from '../../integration/publicAssetUrl';
import {
  type AudioRenderMode,
  createMultiroomSdkAudioSession,
  type MultiroomSdkAudioSession,
} from '../audio/soundTraceSdkAudio';
import { BackendSelect, QualityPresetSelect } from '../shared/BackendSelect';

const roomIds: RoomId[] = ['north', 'east', 'south', 'west'];

const doorLabels: Record<DoorId, string> = {
  north: 'North Door - Synd',
  east: 'East Door - Guitar',
  south: 'South Door - Drum',
  west: 'West Door - Bass',
};

const sourceLabels: Record<RoomId, string> = {
  north: 'North',
  east: 'East',
  south: 'South',
  west: 'West',
};

const roomVisuals: Record<RoomId, {
  color: number;
  sourceColor: number;
  sourcePosition: [number, number];
  frequencyHz: number;
}> = {
  north: { color: 0x286978, sourceColor: 0x2dd4bf, sourcePosition: [0, -3.35], frequencyHz: 262 },
  east: { color: 0x8a7334, sourceColor: 0xf0b44c, sourcePosition: [3.35, 0], frequencyHz: 330 },
  south: { color: 0x884846, sourceColor: 0xe65f5c, sourcePosition: [0, 3.35], frequencyHz: 392 },
  west: { color: 0x5c5094, sourceColor: 0x8b7cf6, sourcePosition: [-3.35, 0], frequencyHz: 494 },
};

const sources = roomIds.map((room) => ({
  id: `source-${room}`,
  room,
  frequencyHz: roomVisuals[room].frequencyHz,
}));

const sourceTracks: Record<string, string> = {
  'source-north': publicAssetUrl('BlackStair_Synd.mp3'),
  'source-east': publicAssetUrl('BlackStair_Guitar.mp3'),
  'source-south': publicAssetUrl('BlackStair_drum.mp3'),
  'source-west': publicAssetUrl('BlackStair_bass.mp3'),
};

const sourcePositions = roomIds.reduce((positions, room) => {
  const [x, z] = roomVisuals[room].sourcePosition;
  positions[room] = [x, 0.24, z];
  return positions;
}, {} as Record<RoomId, [number, number, number]>);

const initialDoors: Record<DoorId, boolean> = {
  north: false,
  east: false,
  south: false,
  west: false,
};

export function MultiroomDoor(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const backendModeRef = useRef<SoundTracingBackendMode>('st');
  const qualityPresetRef = useRef<SoundTracingQualityPreset>('middle');
  const audioSessionRef = useRef<MultiroomSdkAudioSession | null>(null);
  const audioRenderModeRef = useRef<AudioRenderMode>('sound-tracing');
  const doorRef = useRef(initialDoors);
  const mixRef = useRef<MultiroomMix>(estimateMultiroomMix({
    backendMode: 'st',
    qualityPreset: 'middle',
    listenerRoom: 'center',
    doors: initialDoors,
    sources,
  }));
  const [backendMode, setBackendMode] = useState<SoundTracingBackendMode>('st');
  const [qualityPreset, setQualityPreset] = useState<SoundTracingQualityPreset>('middle');
  const [doors, setDoors] = useState(initialDoors);
  const [mix, setMix] = useState(mixRef.current);
  const [runtimeMode, setRuntimeMode] = useState('loading');
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [audioRenderMode, setAudioRenderMode] = useState<AudioRenderMode>('sound-tracing');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [sdkPathCount, setSdkPathCount] = useState<number | null>(null);
  const audioEnabled = audioState === 'running';
  const audioLoading = audioState === 'loading';

  const sourceMix = useMemo(() => new Map(mix.sources.map((item) => [item.id, item])), [mix]);

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
      const session = await createMultiroomSdkAudioSession({
        backendMode: backendModeRef.current,
        qualityPreset: qualityPresetRef.current,
        mix: mixRef.current,
        tracks: sourceTracks,
        positions: sourcePositions,
        renderMode: audioRenderModeRef.current,
      });
      const validPathCount = await session.update(mixRef.current, 0);
      audioSessionRef.current = session;
      setSdkPathCount(validPathCount);
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
    doorRef.current = doors;
    backendModeRef.current = backendMode;
    qualityPresetRef.current = qualityPreset;
    let active = true;
    loadSoundTracingRuntime()
      .then(async (runtime) => {
        setRuntimeMode(runtime.mode);
        return runtime.updateMultiroom({ backendMode, qualityPreset, listenerRoom: 'center', doors, sources });
      })
      .then((nextMix) => {
        if (!active) return;
        mixRef.current = nextMix;
        setMix(nextMix);
      })
      .catch(() => {
        const nextMix = estimateMultiroomMix({ backendMode, qualityPreset, listenerRoom: 'center', doors, sources });
        mixRef.current = nextMix;
        setMix(nextMix);
        setRuntimeMode('stub');
      });

    return () => {
      active = false;
    };
  }, [backendMode, doors, qualityPreset]);

  useEffect(() => {
    const session = audioSessionRef.current;
    if (!session) return undefined;
    let active = true;
    session.update(mix, 0)
      .then((validPathCount) => {
        if (active) setSdkPathCount(validPathCount);
      })
      .catch((error) => {
        if (active) handleSdkAudioError(error);
      });

    return () => {
      active = false;
    };
  }, [mix]);

  useEffect(() => () => {
    audioSessionRef.current?.dispose();
    audioSessionRef.current = null;
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101417);

    const camera = new THREE.OrthographicCamera(-5.8, 5.8, 5.8, -5.8, 0.1, 40);
    camera.position.set(0, 12, 0.001);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xf4fffb, 0x203038, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2, 8, 5);
    scene.add(key);

    addCrossLayout(scene);

    const doorMeshes = createDoorMeshes(scene);
    const pathLines = createPathLines(scene);

    const listener = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 32, 18),
      new THREE.MeshStandardMaterial({
        color: 0xff8b2c,
        emissive: 0x4a1a04,
        emissiveIntensity: 0.34,
        roughness: 0.38,
      }),
    );
    listener.position.set(0, 0.42, 0);
    scene.add(listener);

    const sourceMeshes = new Map<string, THREE.Mesh>();
    for (const source of sources) {
      const visual = roomVisuals[source.room];
      const [x, z] = visual.sourcePosition;
      sourceMeshes.set(source.id, addSource(scene, x, z, visual.sourceColor));
    }

    const resize = (): void => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const aspect = width / height;
      const span = 5.8;
      camera.left = -span * Math.max(1, aspect);
      camera.right = span * Math.max(1, aspect);
      camera.top = span / Math.min(1, aspect);
      camera.bottom = -span / Math.min(1, aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frameId = 0;
    const animate = (now: number): void => {
      frameId = requestAnimationFrame(animate);
      updateDoorMeshes(doorMeshes, doorRef.current);
      updatePathLines(pathLines, mixRef.current);
      listener.position.y = 0.42 + Math.sin(now * 0.004) * 0.04;
      for (const mesh of sourceMeshes.values()) {
        mesh.rotation.y += 0.018;
        mesh.position.y = 0.36 + Math.sin(now * 0.003 + mesh.position.x + mesh.position.z) * 0.025;
      }
      renderer.render(scene, camera);
    };
    animate(performance.now());

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
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
    };
  }, []);

  const toggleDoor = (door: DoorId): void => {
    setDoors((current) => ({ ...current, [door]: !current[door] }));
  };

  return (
    <section className="scene-page" data-route="multiroom">
      <div className="scene-stage">
        <div ref={hostRef} className="three-host" data-testid="multiroom-canvas" />
        <div className="stage-title">
          <DoorOpen aria-hidden="true" />
          <div>
            <h1>Multiroom Door</h1>
            <p>Cross-room occlusion</p>
          </div>
        </div>
      </div>

      <aside className="side-panel" aria-label="Multiroom controls">
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
            data-testid="multiroom-audio"
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
            data-testid="multiroom-audio-render-mode"
          >
            <Volume2 aria-hidden="true" />
            <span>{audioRenderMode === 'sound-tracing' ? 'Sound-tracing' : 'Web Audio'}</span>
          </button>
          {audioError && (
            <p className="inline-alert" data-testid="multiroom-audio-error">
              <AlertTriangle aria-hidden="true" />
              <span>{audioError}</span>
            </p>
          )}
        </section>

        <BackendSelect
          value={backendMode}
          onChange={updateBackendMode}
          testId="multiroom-backend-mode"
        />

        <QualityPresetSelect
          value={qualityPreset}
          onChange={updateQualityPreset}
          testId="multiroom-quality-preset"
        />

        <section className="panel-section">
          <div className="panel-heading">
            <DoorClosed aria-hidden="true" />
            <h2>Doors</h2>
          </div>
          <div className="door-grid">
            {roomIds.map((door) => {
              const open = doors[door];
              return (
                <button
                  key={door}
                  type="button"
                  className={`tool-button door-button ${open ? 'active' : ''}`}
                  onClick={() => toggleDoor(door)}
                  aria-pressed={open}
                  data-testid={`door-${door}`}
                >
                  {open ? <DoorOpen aria-hidden="true" /> : <DoorClosed aria-hidden="true" />}
                  <span>{doorLabels[door]}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel-section">
          <div className="panel-heading">
            <Radio aria-hidden="true" />
            <h2>Sources</h2>
          </div>
          <dl className="metric-list">
            <Metric label="Runtime" value={runtimeMode} tone={runtimeMode === 'stub' ? 'warn' : 'ok'} />
            <Metric label="Backend" value={formatBackendMode(backendMode)} testId="multiroom-backend-metric" />
            <Metric label="Preset" value={formatQualityPreset(qualityPreset)} testId="multiroom-quality-metric" />
            <Metric
              label="SDK paths"
              value={audioEnabled ? (sdkPathCount !== null ? String(sdkPathCount) : 'Running') : 'Idle'}
              tone={audioEnabled ? 'ok' : audioState === 'error' ? 'warn' : undefined}
            />
            {sources.map((source) => {
              const item = sourceMix.get(source.id);
              return (
                <Metric
                  key={source.id}
                  label={sourceLabels[source.room]}
                  value={item ? `${item.gain.toFixed(2)} / ${item.lowpassHz} Hz` : 'Pending'}
                  tone={item?.blocked ? 'warn' : 'ok'}
                  testId={`gain-${source.room}`}
                />
              );
            })}
          </dl>
        </section>
      </aside>
    </section>
  );
}

function addCrossLayout(scene: THREE.Scene): void {
  addFloor(scene, 0, 0, 2.1, 2.1, 0x3b4a52, 0.72);
  addFloor(scene, 0, -1.95, 1.05, 1.7, 0x35464d, 0.58);
  addFloor(scene, 1.95, 0, 1.7, 1.05, 0x35464d, 0.58);
  addFloor(scene, 0, 1.95, 1.05, 1.7, 0x35464d, 0.58);
  addFloor(scene, -1.95, 0, 1.7, 1.05, 0x35464d, 0.58);

  addFloor(scene, 0, -3.35, 2.15, 2.15, roomVisuals.north.color, 0.6);
  addFloor(scene, 3.35, 0, 2.15, 2.15, roomVisuals.east.color, 0.6);
  addFloor(scene, 0, 3.35, 2.15, 2.15, roomVisuals.south.color, 0.6);
  addFloor(scene, -3.35, 0, 2.15, 2.15, roomVisuals.west.color, 0.6);
}

function addFloor(
  scene: THREE.Scene,
  x: number,
  z: number,
  width: number,
  depth: number,
  color: number,
  opacity: number,
): void {
  const geometry = new THREE.BoxGeometry(width, 0.08, depth);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, transparent: true, opacity }),
  );
  mesh.position.set(x, -0.04, z);
  scene.add(mesh);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xdce4e8, transparent: true, opacity: 0.82 }),
  );
  outline.position.copy(mesh.position);
  scene.add(outline);
}

function createDoorMeshes(scene: THREE.Scene): Map<DoorId, THREE.Mesh> {
  const doors = new Map<DoorId, THREE.Mesh>();
  const configs: Array<[DoorId, THREE.Vector3, THREE.Vector3]> = [
    ['north', new THREE.Vector3(0, 0.34, -1.1), new THREE.Vector3(1.05, 0.55, 0.14)],
    ['east', new THREE.Vector3(1.1, 0.34, 0), new THREE.Vector3(0.14, 0.55, 1.05)],
    ['south', new THREE.Vector3(0, 0.34, 1.1), new THREE.Vector3(1.05, 0.55, 0.14)],
    ['west', new THREE.Vector3(-1.1, 0.34, 0), new THREE.Vector3(0.14, 0.55, 1.05)],
  ];

  for (const [id, position, size] of configs) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({
        color: 0xff2e35,
        emissive: 0x4b0508,
        emissiveIntensity: 0.42,
        roughness: 0.42,
      }),
    );
    mesh.position.copy(position);
    scene.add(mesh);
    doors.set(id, mesh);
  }

  return doors;
}

function addSource(scene: THREE.Scene, x: number, z: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.3, 1),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, roughness: 0.4 }),
  );
  mesh.position.set(x, 0.36, z);
  scene.add(mesh);
  return mesh;
}

function createPathLines(scene: THREE.Scene): Map<string, THREE.Line> {
  const lines = new Map<string, THREE.Line>();
  for (const source of sources) {
    const line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: roomVisuals[source.room].sourceColor,
        transparent: true,
        opacity: 0.32,
      }),
    );
    scene.add(line);
    lines.set(source.id, line);
  }
  return lines;
}

function updateDoorMeshes(doorMeshes: Map<DoorId, THREE.Mesh>, doors: Record<DoorId, boolean>): void {
  for (const [id, mesh] of doorMeshes) {
    const open = doors[id];
    const horizontal = id === 'north' || id === 'south';
    if (horizontal) {
      mesh.scale.x += ((open ? 0.14 : 1) - mesh.scale.x) * 0.2;
    } else {
      mesh.scale.z += ((open ? 0.14 : 1) - mesh.scale.z) * 0.2;
    }
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.color.setHex(open ? 0x2dd4bf : 0xff2e35);
    material.emissive.setHex(open ? 0x063b35 : 0x4b0508);
  }
}

function updatePathLines(lines: Map<string, THREE.Line>, mix: MultiroomMix): void {
  const sourcePositions = new Map<string, THREE.Vector3>(
    sources.map((source) => {
      const [x, z] = roomVisuals[source.room].sourcePosition;
      return [source.id, new THREE.Vector3(x, 0.24, z)];
    }),
  );
  const doorPositions = new Map<DoorId, THREE.Vector3>([
    ['north', new THREE.Vector3(0, 0.24, -1.1)],
    ['east', new THREE.Vector3(1.1, 0.24, 0)],
    ['south', new THREE.Vector3(0, 0.24, 1.1)],
    ['west', new THREE.Vector3(-1.1, 0.24, 0)],
  ]);
  const listener = new THREE.Vector3(0, 0.24, 0);

  for (const item of mix.sources) {
    const line = lines.get(item.id);
    const source = sourcePositions.get(item.id);
    if (!line || !source) continue;
    const route = item.path.length > 0
      ? [source, ...item.path.map((door) => doorPositions.get(door) ?? listener), listener]
      : [source, listener];
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(route);
    const material = line.material as THREE.LineBasicMaterial;
    material.opacity = item.blocked ? 0.14 : 0.76;
  }
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
