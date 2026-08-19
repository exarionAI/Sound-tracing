import { publicAssetUrl } from './publicAssetUrl';

export const SOUND_TRACING_PACKAGE_NAME = '@exarionai/soundtrace.js';
export const SOUND_TRACING_DISPLAY_NAME = 'Sound-tracing.js';

export type RuntimeMode = 'licensed' | 'stub';
export type SoundTracingBackendMode = 'st' | 'mt';
export type SoundTracingQualityPreset = 'fast' | 'middle' | 'quality';
export type RoomId = 'north' | 'east' | 'south' | 'west';
export type DoorId = RoomId;

export const SOUND_TRACING_BACKEND_OPTIONS: Array<{
  value: SoundTracingBackendMode;
  label: string;
  sdkMode: 'single_thread' | 'multi_thread';
  sdkThread: 'st' | 'mt';
}> = [
  { value: 'st', label: 'Single Thread', sdkMode: 'single_thread', sdkThread: 'st' },
  { value: 'mt', label: 'Multi Thread', sdkMode: 'multi_thread', sdkThread: 'mt' },
];

export const SOUND_TRACING_QUALITY_OPTIONS: Array<{
  value: SoundTracingQualityPreset;
  label: string;
}> = [
  { value: 'fast', label: 'Fast' },
  { value: 'middle', label: 'Middle' },
  { value: 'quality', label: 'Quality' },
];

export interface BrowserCapabilities {
  audioContext: boolean;
  audioWorklet: boolean;
  sharedArrayBuffer: boolean;
  webAssembly: boolean;
  wasmSimd: boolean;
  webgl2: boolean;
  webgpu: boolean;
  crossOriginIsolated: boolean;
  sampleRate: number | null;
  estimatedLatencyMs: number | null;
}

export interface RuntimeValidation {
  packageName: string;
  displayName: string;
  mode: RuntimeMode;
  version: string;
  sourceUrl: string | null;
  capabilities: BrowserCapabilities;
  warnings: string[];
  errors: string[];
}

export interface BackendAvailability {
  singleThread: boolean;
  multiThread: boolean;
  multiThreadRequirements: {
    sharedArrayBuffer: boolean;
    crossOriginIsolated: boolean;
    audioWorklet: boolean;
  };
}

export interface ShoeboxFrame {
  backendMode: SoundTracingBackendMode;
  qualityPreset: SoundTracingQualityPreset;
  distanceMeters: number;
  attenuation: number;
  lowpassHz: number;
  materialAbsorption: number;
  reflectionEnergy: number;
  validPathCount: number;
  directPath: [number, number, number][];
  reflectionPath: [number, number, number][];
}

export interface ShoeboxInput {
  backendMode?: SoundTracingBackendMode;
  qualityPreset?: SoundTracingQualityPreset;
  source: [number, number, number];
  listener: [number, number, number];
  roomSize?: [number, number, number];
  surfaceAbsorption?: number;
}

export interface MultiroomInput {
  backendMode?: SoundTracingBackendMode;
  qualityPreset?: SoundTracingQualityPreset;
  listenerRoom: 'center';
  doors: Record<DoorId, boolean>;
  sources: Array<{
    id: string;
    room: RoomId;
    frequencyHz: number;
  }>;
}

export interface MultiroomSourceMix {
  id: string;
  room: RoomId;
  gain: number;
  lowpassHz: number;
  blocked: boolean;
  path: DoorId[];
}

export interface MultiroomMix {
  backendMode: SoundTracingBackendMode;
  qualityPreset: SoundTracingQualityPreset;
  sources: MultiroomSourceMix[];
}

export interface SoundTracingRuntime {
  readonly packageName: string;
  readonly displayName: string;
  readonly mode: RuntimeMode;
  readonly version: string;
  readonly sourceUrl: string | null;
  validate(): Promise<RuntimeValidation>;
  updateShoebox(input: ShoeboxInput): Promise<ShoeboxFrame>;
  updateMultiroom(input: MultiroomInput): Promise<MultiroomMix>;
  dispose(): void;
}

interface VendorRuntimeModule {
  createSoundTracingRuntime?: () => Promise<SoundTracingRuntime> | SoundTracingRuntime;
  default?: {
    createSoundTracingRuntime?: () => Promise<SoundTracingRuntime> | SoundTracingRuntime;
  };
  SoundTrace?: SoundTraceConstructorLike;
  version?: string;
}

export interface SoundTraceConstructorLike {
  create(audioContext: AudioContext, options?: Record<string, unknown>): Promise<SoundTraceFacadeLike>;
}

export interface SoundTraceFacadeLike {
  readonly output: AudioNode;
  readonly workerHostedControl: boolean;
  readonly listener: SoundTraceListenerLike;
  setAudioOption(options?: { inputSampleCount?: number; outputChannels?: number }): unknown;
  addMesh(options: {
    vertices: ArrayLike<number>;
    indices?: ArrayLike<number>;
    material?: string | number;
    updateType?: string;
  }): SoundTraceMeshLike;
  addSource(options: {
    position: [number, number, number];
    gain?: number;
    paths?: Record<string, boolean>;
  }): SoundTraceSourceLike;
  update(dt?: number): Promise<number>;
  dispose(): void;
}

export interface SoundTraceListenerLike {
  readonly id?: number;
  readonly native?: unknown;
  setPose(pose: { position?: [number, number, number]; orientation?: { x: number; y: number; z: number; w: number } }): unknown;
}

export interface SoundTraceMeshLike {
  setPose?(pose: { position?: [number, number, number]; scale?: [number, number, number] }): unknown;
  setMaterial?(material: string | number): unknown;
}

export interface SoundTraceSourceLike {
  readonly id?: number;
  readonly native?: unknown;
  setPose(pose: { position?: [number, number, number] }): unknown;
  setGain?(gain: number): unknown;
  play(input: AudioNode, channels?: number): Promise<AudioWorkletNode>;
}

const DEFAULT_VENDOR_MANIFEST = 'vendor/sound-tracing/runtime-manifest.json';

interface VendorManifest {
  entry?: string | null;
}

export async function loadSoundTracingRuntime(): Promise<SoundTracingRuntime> {
  if (typeof window === 'undefined') return createStubSoundTracingRuntime(null);

  const sourceUrl = await resolveVendorSourceUrl();
  if (!sourceUrl) return createStubSoundTracingRuntime(null);

  try {
    const vendorModule = await import(/* @vite-ignore */ sourceUrl) as VendorRuntimeModule;
    const runtime = await coerceVendorRuntime(vendorModule, sourceUrl);
    if (runtime) return runtime;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return createStubSoundTracingRuntime(sourceUrl, [`Licensed runtime load failed: ${reason}`]);
  }

  return createStubSoundTracingRuntime(sourceUrl, ['Licensed runtime entry did not expose a supported adapter.']);
}

export async function loadSoundTraceSdkConstructor(): Promise<{
  SoundTrace: SoundTraceConstructorLike;
  sourceUrl: string;
} | null> {
  if (typeof window === 'undefined') return null;

  const sourceUrl = await resolveVendorSourceUrl();
  if (!sourceUrl) return null;

  const vendorModule = await import(/* @vite-ignore */ sourceUrl) as VendorRuntimeModule;
  if (!vendorModule.SoundTrace) return null;

  return {
    SoundTrace: vendorModule.SoundTrace,
    sourceUrl,
  };
}

export function createStubSoundTracingRuntime(
  attemptedSourceUrl: string | null,
  extraWarnings: string[] = [],
): SoundTracingRuntime {
  return new StubSoundTracingRuntime(attemptedSourceUrl, extraWarnings);
}

async function coerceVendorRuntime(
  vendorModule: VendorRuntimeModule,
  sourceUrl: string,
): Promise<SoundTracingRuntime | null> {
  const createRuntime =
    vendorModule.createSoundTracingRuntime ?? vendorModule.default?.createSoundTracingRuntime;

  if (createRuntime) {
    const runtime = await createRuntime();
    return {
      ...runtime,
      sourceUrl: runtime.sourceUrl ?? sourceUrl,
    };
  }

  if (vendorModule.SoundTrace) {
    return new LicensedModuleRuntime(sourceUrl, vendorModule.version ?? 'licensed');
  }

  return null;
}

async function resolveManifestVendorEntry(): Promise<string | null> {
  try {
    const response = await fetch(publicAssetUrl(DEFAULT_VENDOR_MANIFEST), { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = await response.json() as VendorManifest;
    if (!manifest.entry) return null;

    const sourceUrl = resolvePublicVendorUrl(manifest.entry);
    return await vendorEntryExists(sourceUrl) ? sourceUrl : null;
  } catch {
    return null;
  }
}

async function vendorEntryExists(sourceUrl: string): Promise<boolean> {
  try {
    const response = await fetch(sourceUrl, { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) return false;

    // Reject SPA fallback pages that return index.html with a 200 status.
    return !response.headers.get('content-type')?.toLowerCase().includes('text/html');
  } catch {
    return false;
  }
}

async function resolveVendorSourceUrl(): Promise<string | null> {
  const configuredUrl = import.meta.env.VITE_SOUND_TRACING_VENDOR_URL?.trim();
  return configuredUrl ? resolvePublicVendorUrl(configuredUrl) : await resolveManifestVendorEntry();
}

function resolvePublicVendorUrl(url: string): string {
  if (import.meta.env.DEV) return url;

  if (url.startsWith('/vendor-runtime/sound-tracing/')) {
    return publicAssetUrl(url.replace('/vendor-runtime/sound-tracing/', 'vendor/sound-tracing/'));
  }

  if (url.startsWith('/vendor/sound-tracing/')) {
    return publicAssetUrl(url);
  }

  return url;
}

class LicensedModuleRuntime implements SoundTracingRuntime {
  readonly packageName = SOUND_TRACING_PACKAGE_NAME;
  readonly displayName = SOUND_TRACING_DISPLAY_NAME;
  readonly mode = 'licensed' as const;

  constructor(
    readonly sourceUrl: string,
    readonly version: string,
  ) {}

  async validate(): Promise<RuntimeValidation> {
    return {
      packageName: this.packageName,
      displayName: this.displayName,
      mode: this.mode,
      version: this.version,
      sourceUrl: this.sourceUrl,
      capabilities: detectBrowserCapabilities(),
      warnings: [],
      errors: [],
    };
  }

  async updateShoebox(input: ShoeboxInput): Promise<ShoeboxFrame> {
    return estimateShoeboxFrame(input);
  }

  async updateMultiroom(input: MultiroomInput): Promise<MultiroomMix> {
    return estimateMultiroomMix(input);
  }

  dispose(): void {}
}

class StubSoundTracingRuntime implements SoundTracingRuntime {
  readonly packageName = SOUND_TRACING_PACKAGE_NAME;
  readonly displayName = SOUND_TRACING_DISPLAY_NAME;
  readonly mode = 'stub' as const;
  readonly version = 'stub-0.1.0';

  constructor(
    readonly sourceUrl: string | null,
    private readonly extraWarnings: string[],
  ) {}

  async validate(): Promise<RuntimeValidation> {
    return {
      packageName: this.packageName,
      displayName: this.displayName,
      mode: this.mode,
      version: this.version,
      sourceUrl: this.sourceUrl,
      capabilities: detectBrowserCapabilities(),
      warnings: [
        'Licensed runtime not found. Public stub runtime is active.',
        ...this.extraWarnings,
      ],
      errors: [],
    };
  }

  async updateShoebox(input: ShoeboxInput): Promise<ShoeboxFrame> {
    return estimateShoeboxFrame(input);
  }

  async updateMultiroom(input: MultiroomInput): Promise<MultiroomMix> {
    return estimateMultiroomMix(input);
  }

  dispose(): void {}
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  if (typeof window === 'undefined') {
    return {
      audioContext: false,
      audioWorklet: false,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      webAssembly: typeof WebAssembly !== 'undefined',
      wasmSimd: supportsWasmSimd(),
      webgl2: false,
      webgpu: false,
      crossOriginIsolated: false,
      sampleRate: null,
      estimatedLatencyMs: null,
    };
  }

  const AudioContextConstructor = window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const tempAudioContext = AudioContextConstructor ? new AudioContextConstructor() : null;
  const sampleRate = tempAudioContext?.sampleRate ?? null;
  const estimatedLatencyMs = tempAudioContext?.baseLatency
    ? Math.round(tempAudioContext.baseLatency * 1000)
    : null;
  void tempAudioContext?.close().catch(() => undefined);

  const canvas = document.createElement('canvas');
  const webgl2 = Boolean(canvas.getContext('webgl2'));

  return {
    audioContext: Boolean(AudioContextConstructor),
    audioWorklet: Boolean(tempAudioContext?.audioWorklet),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webAssembly: typeof WebAssembly !== 'undefined',
    wasmSimd: supportsWasmSimd(),
    webgl2,
    webgpu: 'gpu' in navigator,
    crossOriginIsolated: window.crossOriginIsolated === true,
    sampleRate,
    estimatedLatencyMs,
  };
}

export function detectBackendAvailability(capabilities: BrowserCapabilities): BackendAvailability {
  const multiThreadRequirements = {
    sharedArrayBuffer: capabilities.sharedArrayBuffer,
    crossOriginIsolated: capabilities.crossOriginIsolated,
    audioWorklet: capabilities.audioWorklet,
  };

  return {
    singleThread: capabilities.webAssembly && capabilities.audioContext && capabilities.audioWorklet,
    multiThread: Object.values(multiThreadRequirements).every(Boolean),
    multiThreadRequirements,
  };
}

export function formatBackendMode(mode: SoundTracingBackendMode): string {
  return SOUND_TRACING_BACKEND_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

export function formatQualityPreset(preset: SoundTracingQualityPreset): string {
  return SOUND_TRACING_QUALITY_OPTIONS.find((option) => option.value === preset)?.label ?? preset;
}

function supportsWasmSimd(): boolean {
  if (typeof WebAssembly === 'undefined' || typeof WebAssembly.validate !== 'function') {
    return false;
  }

  return WebAssembly.validate(new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
    0x03, 0x02, 0x01, 0x00,
    0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x0b,
  ]));
}

function estimateShoeboxFrame(input: ShoeboxInput): ShoeboxFrame {
  const backendMode = input.backendMode ?? 'st';
  const qualityPreset = input.qualityPreset ?? 'middle';
  const distanceMeters = distance(input.source, input.listener);
  const materialAbsorption = clamp(input.surfaceAbsorption ?? 0.28, 0, 0.92);
  const distanceAttenuation = 1 / (1 + distanceMeters * distanceMeters * 0.18);
  const attenuation = distanceAttenuation * (1 - materialAbsorption * 0.48);
  const lowpassHz = Math.round(clamp(18000 - distanceMeters * 620 - materialAbsorption * 11800, 2600, 18000));
  const reflectionEnergy = Math.max(0.05, distanceAttenuation * (1 - materialAbsorption));
  const roomWidth = input.roomSize?.[0] ?? 8;
  const bounceX = input.source[0] >= 0 ? roomWidth / 2 : -roomWidth / 2;
  const reflectionPoint: [number, number, number] = [bounceX, input.source[1], input.listener[2]];

  return {
    backendMode,
    qualityPreset,
    distanceMeters,
    attenuation,
    lowpassHz,
    materialAbsorption,
    reflectionEnergy,
    validPathCount: 1 + Math.max(1, Math.round(6 * reflectionEnergy)),
    directPath: [input.source, input.listener],
    reflectionPath: [input.source, reflectionPoint, input.listener],
  };
}

export function estimateMultiroomMix(input: MultiroomInput): MultiroomMix {
  return {
    backendMode: input.backendMode ?? 'st',
    qualityPreset: input.qualityPreset ?? 'middle',
    sources: input.sources.map((source) => {
      const path = input.doors[source.room] ? [source.room] : [];
      const blocked = path.length === 0;
      const gain = blocked ? 0.16 : 0.86;
      const lowpassHz = blocked ? 1100 : 16000;

      return {
        id: source.id,
        room: source.room,
        gain,
        lowpassHz,
        blocked,
        path,
      };
    }),
  };
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
