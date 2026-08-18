import { AlertTriangle, CheckCircle2, Cpu, Gauge, Info, PackageCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CapabilityPreview } from './CapabilityPreview';
import {
  detectBackendAvailability,
  loadSoundTracingRuntime,
  type BrowserCapabilities,
  type RuntimeValidation,
  SOUND_TRACING_DISPLAY_NAME,
  SOUND_TRACING_PACKAGE_NAME,
} from '../../integration/soundTracingRuntime';

const capabilityLabels: Array<[keyof BrowserCapabilities, string]> = [
  ['audioContext', 'AudioContext'],
  ['audioWorklet', 'AudioWorklet'],
  ['webAssembly', 'WebAssembly'],
  ['wasmSimd', 'WASM SIMD'],
  ['sharedArrayBuffer', 'SharedArrayBuffer'],
  ['webgl2', 'WebGL2'],
  ['webgpu', 'WebGPU'],
  ['crossOriginIsolated', 'Cross-origin isolated'],
];

export function CapabilityCheck(): JSX.Element {
  const [validation, setValidation] = useState<RuntimeValidation | null>(null);
  const backendAvailability = validation ? detectBackendAvailability(validation.capabilities) : null;

  useEffect(() => {
    let active = true;
    loadSoundTracingRuntime()
      .then((runtime) => runtime.validate())
      .then((result) => {
        if (active) setValidation(result);
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        if (active) {
          setValidation({
            packageName: SOUND_TRACING_PACKAGE_NAME,
            displayName: SOUND_TRACING_DISPLAY_NAME,
            mode: 'stub',
            version: 'unavailable',
            sourceUrl: null,
            capabilities: {
              audioContext: false,
              audioWorklet: false,
              sharedArrayBuffer: false,
              webAssembly: false,
              wasmSimd: false,
              webgl2: false,
              webgpu: false,
              crossOriginIsolated: false,
              sampleRate: null,
              estimatedLatencyMs: null,
            },
            warnings: [],
            errors: [reason],
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="scene-page capability-page" data-route="capability">
      <div className="scene-stage capability-stage">
        <CapabilityPreview />
        <div className="stage-title">
          <Gauge aria-hidden="true" />
          <div>
            <h1>{SOUND_TRACING_DISPLAY_NAME}</h1>
            <p>Runtime validation</p>
          </div>
        </div>
      </div>

      <aside className="side-panel" aria-label="Runtime status">
        <section className="panel-section">
          <div className="panel-heading">
            <PackageCheck aria-hidden="true" />
            <h2>Runtime</h2>
          </div>
          <dl className="metric-list">
            <Metric label="Package" value={validation?.packageName ?? 'Checking'} />
            <Metric label="Mode" value={validation?.mode ?? 'Checking'} tone={validation?.mode === 'stub' ? 'warn' : 'ok'} />
            <Metric label="Version" value={validation?.version ?? 'Checking'} />
            <Metric label="Source" value={validation?.sourceUrl ?? 'Stub fallback'} />
          </dl>
        </section>

        <section className="panel-section">
          <div className="panel-heading">
            <Cpu aria-hidden="true" />
            <h2>Browser</h2>
          </div>
          <div className="capability-grid">
            {capabilityLabels.map(([key, label]) => (
              <CapabilityPill
                key={key}
                label={label}
                enabled={Boolean(validation?.capabilities[key])}
              />
            ))}
          </div>
          <dl className="metric-list compact">
            <Metric
              label="Sample rate"
              value={validation?.capabilities.sampleRate ? `${validation.capabilities.sampleRate} Hz` : 'Unavailable'}
            />
            <Metric
              label="Latency"
              value={
                validation?.capabilities.estimatedLatencyMs !== null &&
                validation?.capabilities.estimatedLatencyMs !== undefined
                  ? `${validation.capabilities.estimatedLatencyMs} ms`
                  : 'Unavailable'
              }
            />
          </dl>
        </section>

        <section className="panel-section">
          <div className="panel-heading">
            <Cpu aria-hidden="true" />
            <h2>SDK Backends</h2>
          </div>
          <div className="capability-grid">
            <CapabilityPill
              label="Single Thread"
              enabled={Boolean(backendAvailability?.singleThread)}
            />
            <CapabilityPill
              label="Multi Thread"
              enabled={Boolean(backendAvailability?.multiThread)}
            />
            <CapabilityPill
              label="WebGPU"
              enabled={Boolean(backendAvailability?.webgpu)}
            />
          </div>
          <dl className="metric-list compact">
            <Metric
              label="MT requirements"
              value={backendAvailability ? formatMtRequirements(backendAvailability) : 'Checking'}
              tone={backendAvailability?.multiThread ? 'ok' : 'warn'}
            />
            <Metric
              label="WebGPU API"
              value={validation?.capabilities.webgpu ? 'navigator.gpu available' : 'navigator.gpu unavailable'}
              tone={validation?.capabilities.webgpu ? 'ok' : 'warn'}
            />
          </dl>
        </section>

        {validation && validation.warnings.length > 0 && (
          <section className="panel-section notice-list" aria-label="Warnings">
            <div className="panel-heading">
              <Info aria-hidden="true" />
              <h2>Warnings</h2>
            </div>
            {validation.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </section>
        )}

        {validation && validation.errors.length > 0 && (
          <section className="panel-section notice-list error-list" aria-label="Errors">
            <div className="panel-heading">
              <AlertTriangle aria-hidden="true" />
              <h2>Errors</h2>
            </div>
            {validation.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </section>
        )}
      </aside>
    </section>
  );
}

function formatMtRequirements(availability: ReturnType<typeof detectBackendAvailability>): string {
  const requirements = availability.multiThreadRequirements;
  if (availability.multiThread) return 'SharedArrayBuffer + COI + AudioWorklet';

  const missing: string[] = [];
  if (!requirements.sharedArrayBuffer) missing.push('SharedArrayBuffer');
  if (!requirements.crossOriginIsolated) missing.push('COI');
  if (!requirements.audioWorklet) missing.push('AudioWorklet');
  return missing.length > 0 ? `Missing ${missing.join(', ')}` : 'Unavailable';
}

function CapabilityPill({ label, enabled }: { label: string; enabled: boolean }): JSX.Element {
  return (
    <div className={`capability-pill ${enabled ? 'ok' : 'warn'}`}>
      <CheckCircle2 aria-hidden="true" />
      <span>{label}</span>
      <strong>{enabled ? 'OK' : 'N/A'}</strong>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}): JSX.Element {
  return (
    <div className={`metric-row ${tone ?? ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
