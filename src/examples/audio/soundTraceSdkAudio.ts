import {
  loadSoundTraceSdkConstructor,
  SOUND_TRACING_BACKEND_OPTIONS,
  type MultiroomMix,
  type RoomId,
  type SoundTraceFacadeLike,
  type SoundTraceMeshLike,
  type SoundTraceSourceLike,
  type SoundTracingBackendMode,
  type SoundTracingQualityPreset,
} from '../../integration/soundTracingRuntime';

type Vec3 = [number, number, number];
type AudioContextCtor = {
  new(contextOptions?: AudioContextOptions): AudioContext;
};
type NavigatorWithAudioSession = Navigator & {
  audioSession?: {
    type: string;
  };
};

export type RoomMaterialName = 'fabric' | 'concrete' | 'sand' | 'water';
export type AudioRenderMode = 'sound-tracing' | 'web-audio';

const ROOM_W = 8;
const ROOM_H = 4;
const ROOM_D = 8;
const MULTIROOM_RENDER_CHANNELS = 2;
const MULTIROOM_SOURCE_CHANNELS = 1;
const WEB_AUDIO_COMPARE_GAIN = 0.5;
const INWARD_TRIS = [
  0, 4, 2, 4, 6, 2,
  5, 1, 3, 5, 3, 7,
  0, 1, 4, 1, 5, 4,
  2, 6, 3, 6, 7, 3,
  0, 2, 1, 2, 3, 1,
  4, 5, 6, 5, 7, 6,
];

export interface ShoeboxSdkAudioSession {
  readonly workerHostedControl: boolean;
  setRenderMode(mode: AudioRenderMode): void;
  update(input: {
    source: Vec3;
    listener: Vec3;
    roomSize: Vec3;
    material: RoomMaterialName;
    dt: number;
  }): Promise<number>;
  dispose(): void;
}

export interface MultiroomSdkAudioSession {
  readonly workerHostedControl: boolean;
  setRenderMode(mode: AudioRenderMode): void;
  update(mix: MultiroomMix, dt: number): Promise<number>;
  dispose(): void;
}

interface ShoeboxPlaybackGraph {
  readonly bufferSource: AudioBufferSourceNode;
  readonly worklet: AudioWorkletNode;
  readonly sdkGain: GainNode;
  readonly webAudioGain: GainNode;
}

interface MultiroomPlaybackGraph {
  readonly starts: AudioBufferSourceNode[];
  readonly gains: Map<string, GainNode>;
  readonly filters: Map<string, BiquadFilterNode>;
  readonly worklets: AudioWorkletNode[];
  readonly sdkGain: GainNode;
  readonly webAudioGain: GainNode;
}

export async function createShoeboxSdkAudioSession(options: {
  backendMode: SoundTracingBackendMode;
  qualityPreset: SoundTracingQualityPreset;
  audioUrl: string;
  source: Vec3;
  listener: Vec3;
  roomSize: Vec3;
  material: RoomMaterialName;
  renderMode: AudioRenderMode;
}): Promise<ShoeboxSdkAudioSession> {
  const { sound, audioContext } = await createSoundTraceWorld(options.backendMode, options.qualityPreset);
  let source: SoundTraceSourceLike | null = null;
  let room: SoundTraceMeshLike | null = null;
  let graph: ShoeboxPlaybackGraph | null = null;

  try {
    room = sound.addMesh({
      vertices: boxVertices(0, 0, 0, ROOM_W, ROOM_H, ROOM_D),
      indices: INWARD_TRIS,
      material: options.material,
      updateType: 'static',
    });
    source = sound.addSource({
      position: options.source,
      gain: 1,
      paths: {
        direct: true,
        reflection: true,
        reverberation: true,
        diffraction: true,
      },
    });
    sound.listener.setPose({
      position: options.listener,
      orientation: { x: 0, y: 0, z: -1, w: 0 },
    });
    sound.setAudioOption({ inputSampleCount: 128, outputChannels: 2 });
    graph = await playLoopingTrack(audioContext, sound, source, options.audioUrl, options.renderMode);
    await sound.update(0);
  } catch (error) {
    try {
      graph?.bufferSource.stop();
    } catch {
      // Already stopped or not started.
    }
    sound.dispose();
    void audioContext.close().catch(() => undefined);
    throw error;
  }

  if (!room || !source) throw new Error('SoundTrace shoebox scene was not initialized.');
  const activeRoom = room;
  const activeSource = source;
  let currentMaterial = options.material;
  updateRoom(activeRoom, options.roomSize);

  return {
    workerHostedControl: sound.workerHostedControl,
    setRenderMode: (mode) => {
      if (graph) setOutputRenderMode(audioContext, graph, mode);
    },
    update: async (input) => {
      activeSource.setPose({ position: input.source });
      sound.listener.setPose({ position: input.listener });
      updateRoom(activeRoom, input.roomSize);
      if (input.material !== currentMaterial) {
        activeRoom.setMaterial?.(input.material);
        currentMaterial = input.material;
      }
      return sound.update(input.dt);
    },
    dispose: () => {
      if (graph) {
        try {
          graph.bufferSource.stop();
        } catch {
          // Already stopped.
        }
        graph.bufferSource.disconnect();
        graph.worklet.disconnect();
        graph.sdkGain.disconnect();
        graph.webAudioGain.disconnect();
      }
      void audioContext.close().catch(() => undefined);
      sound.dispose();
    },
  };
}

export async function createMultiroomSdkAudioSession(options: {
  backendMode: SoundTracingBackendMode;
  qualityPreset: SoundTracingQualityPreset;
  mix: MultiroomMix;
  tracks: Record<string, string>;
  positions: Record<RoomId, Vec3>;
  renderMode: AudioRenderMode;
}): Promise<MultiroomSdkAudioSession> {
  const { sound, audioContext } = await createSoundTraceWorld(options.backendMode, options.qualityPreset);
  const sources = new Map<string, SoundTraceSourceLike>();
  let graph: MultiroomPlaybackGraph | null = null;

  try {
    sound.listener.setPose({
      position: [0, 0.24, 0],
      orientation: { x: 0, y: 0, z: -1, w: 0 },
    });
    sound.setAudioOption({ inputSampleCount: 128, outputChannels: 2 });

    for (const item of options.mix.sources) {
      const source = sound.addSource({
        position: options.positions[item.room],
        gain: 1,
        paths: {
          direct: true,
          reflection: true,
          reverberation: true,
          diffraction: true,
        },
      });
      sources.set(item.id, source);
    }

    graph = await playMultiroomTracks(
      audioContext,
      sound,
      sources,
      options.mix,
      options.tracks,
      options.renderMode,
    );
    await withTimeout(sound.update(0), 6000, 'Sound-tracing.js initial multiroom update timed out.');
  } catch (error) {
    graph?.starts.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Already stopped or never started.
      }
    });
    sound.dispose();
    void audioContext.close().catch(() => undefined);
    throw error;
  }

  return {
    workerHostedControl: sound.workerHostedControl,
    setRenderMode: (mode) => {
      if (graph) setOutputRenderMode(audioContext, graph, mode);
    },
    update: async (mix, dt) => {
      for (const item of mix.sources) {
        sources.get(item.id)?.setPose({ position: options.positions[item.room] });
        sources.get(item.id)?.setGain?.(1);
        graph?.gains.get(item.id)?.gain.setTargetAtTime(
          item.gain * 0.9,
          audioContext.currentTime,
          0.04,
        );
        graph?.filters.get(item.id)?.frequency.setTargetAtTime(
          item.lowpassHz,
          audioContext.currentTime,
          0.04,
        );
      }
      return withTimeout(sound.update(dt), 6000, 'Sound-tracing.js multiroom update timed out.');
    },
    dispose: () => {
      graph?.starts.forEach((source) => {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
        source.disconnect();
      });
      graph?.worklets.forEach((worklet) => worklet.disconnect());
      graph?.sdkGain.disconnect();
      graph?.webAudioGain.disconnect();
      for (const gain of graph?.gains.values() ?? []) gain.disconnect();
      for (const filter of graph?.filters.values() ?? []) filter.disconnect();
      void audioContext.close().catch(() => undefined);
      sound.dispose();
    },
  };
}

// One native AudioWorklet per source. The SDK used to expose a single packed
// mixer node for this (`createMixerWorkletNode`), which took every source's
// audio on one discrete-channel merger; it was removed in SDK 0.7.0 with no
// replacement, and the per-source `play()` path already reuses the session's
// single worklet bootstrap, so the extra nodes are cheap.
async function playMultiroomTracks(
  audioContext: AudioContext,
  sound: SoundTraceFacadeLike,
  sources: Map<string, SoundTraceSourceLike>,
  mix: MultiroomMix,
  tracks: Record<string, string>,
  renderMode: AudioRenderMode,
): Promise<MultiroomPlaybackGraph> {
  const orderedSources = mix.sources.map((item) => {
    const source = sources.get(item.id);
    if (!source) throw new Error(`SDK source missing: ${item.id}`);
    return { item, source };
  });
  const buffers = await Promise.all(orderedSources.map(({ item }) => decodeMixerInputTrack(
    audioContext,
    tracks[item.id],
  )));
  const starts: AudioBufferSourceNode[] = [];
  const gains = new Map<string, GainNode>();
  const filters = new Map<string, BiquadFilterNode>();
  const worklets: AudioWorkletNode[] = [];
  const sdkGain = audioContext.createGain();
  const webAudioGain = audioContext.createGain();
  setOutputRenderMode(audioContext, { sdkGain, webAudioGain }, renderMode, true);

  for (const [sourceIndex, { item, source }] of orderedSources.entries()) {
    const bufferSource = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();

    bufferSource.buffer = buffers[sourceIndex];
    bufferSource.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = item.lowpassHz;
    filter.channelCount = MULTIROOM_SOURCE_CHANNELS;
    filter.channelCountMode = 'explicit';
    filter.channelInterpretation = 'discrete';
    gain.gain.value = item.gain * 0.9;
    gain.channelCount = MULTIROOM_SOURCE_CHANNELS;
    gain.channelCountMode = 'explicit';
    gain.channelInterpretation = 'discrete';

    bufferSource.connect(filter).connect(gain);
    gain.connect(webAudioGain);

    // play() wires gain -> worklet itself; the output side stays ours.
    const worklet = await withTimeout(
      source.play(gain, MULTIROOM_RENDER_CHANNELS),
      6000,
      `Sound-tracing.js worklet creation timed out for ${item.id}.`,
    );
    worklet.connect(sound.output);

    worklets.push(worklet);
    starts.push(bufferSource);
    gains.set(item.id, gain);
    filters.set(item.id, filter);
  }

  sound.output.connect(sdkGain).connect(audioContext.destination);
  webAudioGain.connect(audioContext.destination);

  const startTime = audioContext.currentTime + 0.05;
  starts.forEach((source) => source.start(startTime));

  return {
    starts,
    gains,
    filters,
    worklets,
    sdkGain,
    webAudioGain,
  };
}

async function decodeMixerInputTrack(
  audioContext: AudioContext,
  audioUrl: string,
): Promise<AudioBuffer> {
  const sourceBuffer = await decodeTrack(audioContext, audioUrl);
  const inputBuffer = audioContext.createBuffer(
    MULTIROOM_SOURCE_CHANNELS,
    sourceBuffer.length,
    sourceBuffer.sampleRate,
  );
  const mono = inputBuffer.getChannelData(0);

  if (sourceBuffer.numberOfChannels === 1) {
    mono.set(sourceBuffer.getChannelData(0));
    normalizeBufferChannels([mono]);
    return inputBuffer;
  }

  const sourceChannelCount = sourceBuffer.numberOfChannels;
  const sourceRms: number[] = [];
  for (let channelIndex = 0; channelIndex < sourceChannelCount; channelIndex += 1) {
    const channel = sourceBuffer.getChannelData(channelIndex);
    sourceRms.push(measureRms(channel));
    for (let sampleIndex = 0; sampleIndex < mono.length; sampleIndex += 1) {
      mono[sampleIndex] += channel[sampleIndex] / sourceChannelCount;
    }
  }
  const monoRmsBeforeNormalize = measureRms(mono);
  const strongestRms = Math.max(...sourceRms);
  if (strongestRms > 0 && monoRmsBeforeNormalize < strongestRms * 0.25) {
    const strongestIndex = sourceRms.indexOf(strongestRms);
    mono.set(sourceBuffer.getChannelData(strongestIndex));
  }
  normalizeBufferChannels([mono]);
  return inputBuffer;
}

function normalizeBufferChannels(channels: Float32Array[]): void {
  let sumSquares = 0;
  let peak = 0;
  let sampleCount = 0;

  for (const channel of channels) {
    sampleCount += channel.length;
    for (let index = 0; index < channel.length; index += 1) {
      const value = channel[index];
      sumSquares += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  if (rms <= 0 || peak <= 0) return;

  const targetRms = 0.16;
  const gain = Math.min(4, targetRms / rms, 0.95 / peak);
  if (Math.abs(gain - 1) < 0.01) return;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] *= gain;
    }
  }
}

function measureRms(samples: Float32Array): number {
  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / Math.max(1, samples.length));
}

async function decodeTrack(audioContext: AudioContext, audioUrl: string): Promise<AudioBuffer> {
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error(`failed to fetch ${audioUrl}: HTTP ${response.status}`);
  return audioContext.decodeAudioData(await response.arrayBuffer());
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

async function createSoundTraceWorld(
  backendMode: SoundTracingBackendMode,
  qualityPreset: SoundTracingQualityPreset,
): Promise<{
  sound: SoundTraceFacadeLike;
  audioContext: AudioContext;
}> {
  const option = SOUND_TRACING_BACKEND_OPTIONS.find((item) => item.value === backendMode);
  if (!option) throw new Error(`Unsupported backend mode: ${backendMode}`);
  assertBackendCanStart(backendMode);

  const { audioContext, resumePromise } = createInteractiveAudioContext();
  let sound: SoundTraceFacadeLike | null = null;
  try {
    const sdk = await loadSoundTraceSdkConstructor();
    if (!sdk) throw new Error('Licensed SoundTrace SDK constructor is unavailable.');

    const executionMode = backendMode === 'mt' ? undefined : option.sdkMode;
    sound = await sdk.SoundTrace.create(audioContext, {
      ...(executionMode === undefined ? {} : { mode: executionMode }),
      thread: backendMode === 'mt' ? 'mt' : undefined,
      coordinateBasis: {
        right: [-1, 0, 0],
        up: [0, 1, 0],
        forward: [0, 0, -1],
      },
      quality: qualityPreset,
    });

    await withTimeout(
      resumePromise,
      3000,
      'AudioContext could not start. Tap Play SDK Audio again from a direct user gesture.',
    );
    return { sound, audioContext };
  } catch (error) {
    sound?.dispose();
    void resumePromise.catch(() => undefined);
    void audioContext.close().catch(() => undefined);
    throw normalizeSdkStartupError(error, backendMode);
  }
}

function createInteractiveAudioContext(): {
  audioContext: AudioContext;
  resumePromise: Promise<void>;
} {
  configurePlaybackAudioSession();

  const AudioContextConstructor = window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error('Web Audio API is unavailable in this browser.');
  }

  let audioContext: AudioContext;
  try {
    audioContext = new AudioContextConstructor({ latencyHint: 'interactive' });
  } catch {
    audioContext = new AudioContextConstructor();
  }

  return {
    audioContext,
    resumePromise: audioContext.resume(),
  };
}

function configurePlaybackAudioSession(): void {
  const audioSession = (navigator as NavigatorWithAudioSession).audioSession;
  if (!audioSession) return;

  try {
    audioSession.type = 'playback';
  } catch {
    // Safari may expose audioSession but reject writes in some contexts.
  }
}

async function playLoopingTrack(
  audioContext: AudioContext,
  sound: SoundTraceFacadeLike,
  source: SoundTraceSourceLike,
  audioUrl: string,
  renderMode: AudioRenderMode,
): Promise<ShoeboxPlaybackGraph> {
  const audioBuffer = await decodeTrack(audioContext, audioUrl);
  const bufferSource = audioContext.createBufferSource();
  const sdkGain = audioContext.createGain();
  const webAudioGain = audioContext.createGain();
  setOutputRenderMode(audioContext, { sdkGain, webAudioGain }, renderMode, true);

  bufferSource.buffer = audioBuffer;
  bufferSource.loop = true;
  const worklet = await source.play(bufferSource, 2);
  worklet.connect(sound.output);
  sound.output.connect(sdkGain).connect(audioContext.destination);
  bufferSource.connect(webAudioGain).connect(audioContext.destination);
  bufferSource.start();

  return {
    bufferSource,
    worklet,
    sdkGain,
    webAudioGain,
  };
}

function setOutputRenderMode(
  audioContext: AudioContext,
  output: Pick<ShoeboxPlaybackGraph, 'sdkGain' | 'webAudioGain'>,
  mode: AudioRenderMode,
  immediate = false,
): void {
  const sdkValue = mode === 'sound-tracing' ? 1 : 0;
  const webAudioValue = mode === 'web-audio' ? WEB_AUDIO_COMPARE_GAIN : 0;
  const now = audioContext.currentTime;

  for (const [gain, value] of [
    [output.sdkGain, sdkValue],
    [output.webAudioGain, webAudioValue],
  ] as const) {
    gain.gain.cancelScheduledValues(now);
    if (immediate) {
      gain.gain.value = value;
    } else {
      gain.gain.setTargetAtTime(value, now, 0.012);
    }
  }
}

function assertBackendCanStart(backendMode: SoundTracingBackendMode): void {
  if (backendMode !== 'mt') return;

  const missing: string[] = [];
  if (typeof SharedArrayBuffer === 'undefined') missing.push('SharedArrayBuffer');
  if (globalThis.crossOriginIsolated !== true) missing.push('crossOriginIsolated');
  if (typeof AudioWorkletNode === 'undefined') missing.push('AudioWorklet');
  if (missing.length === 0) return;

  throw new Error(multiThreadHostingMessage(missing));
}

function normalizeSdkStartupError(error: unknown, backendMode: SoundTracingBackendMode): Error {
  if (backendMode !== 'mt') return error instanceof Error ? error : new Error(String(error));

  const reason = error instanceof Error ? error.message : String(error);
  if (
    reason.includes('SharedArrayBuffer') ||
    reason.includes('crossOriginIsolated') ||
    reason.includes('control worker error') ||
    reason.includes('[object Event]')
  ) {
    return new Error(multiThreadHostingMessage([]));
  }
  return error instanceof Error ? error : new Error(reason);
}

function multiThreadHostingMessage(missing: string[]): string {
  const requirement = missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '';
  return `Multi Thread backend requires SharedArrayBuffer hosting.${requirement} Serve this demo with COOP/COEP headers: Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp, then reload the page.`;
}

function updateRoom(room: SoundTraceMeshLike, roomSize: Vec3): void {
  room.setPose?.({
    position: [0, 0, 0],
    scale: [
      roomSize[0] / ROOM_W,
      roomSize[1] / ROOM_H,
      roomSize[2] / ROOM_D,
    ],
  });
}

function boxVertices(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
): Float32Array {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  return new Float32Array([
    cx - hx, cy - hy, cz - hz, cx + hx, cy - hy, cz - hz,
    cx - hx, cy + hy, cz - hz, cx + hx, cy + hy, cz - hz,
    cx - hx, cy - hy, cz + hz, cx + hx, cy - hy, cz + hz,
    cx - hx, cy + hy, cz + hz, cx + hx, cy + hy, cz + hz,
  ]);
}
