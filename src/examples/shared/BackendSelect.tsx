import { Cpu } from 'lucide-react';
import {
  SOUND_TRACING_BACKEND_OPTIONS,
  SOUND_TRACING_QUALITY_OPTIONS,
  type SoundTracingQualityPreset,
  type SoundTracingBackendMode,
} from '../../integration/soundTracingRuntime';

interface BackendSelectProps {
  value: SoundTracingBackendMode;
  testId: string;
  onChange: (value: SoundTracingBackendMode) => void;
}

export function BackendSelect({ value, testId, onChange }: BackendSelectProps): JSX.Element {
  return (
    <section className="panel-section">
      <div className="panel-heading">
        <Cpu aria-hidden="true" />
        <h2>SDK Backend</h2>
      </div>
      <label className="select-row">
        <span>Mode</span>
        <select
          value={value}
          onChange={(event) => onChange(event.currentTarget.value as SoundTracingBackendMode)}
          data-testid={testId}
        >
          {SOUND_TRACING_BACKEND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

interface QualityPresetSelectProps {
  value: SoundTracingQualityPreset;
  testId: string;
  onChange: (value: SoundTracingQualityPreset) => void;
}

export function QualityPresetSelect({ value, testId, onChange }: QualityPresetSelectProps): JSX.Element {
  return (
    <section className="panel-section">
      <div className="panel-heading">
        <Cpu aria-hidden="true" />
        <h2>SDK Preset</h2>
      </div>
      <label className="select-row">
        <span>Quality</span>
        <select
          value={value}
          onChange={(event) => onChange(event.currentTarget.value as SoundTracingQualityPreset)}
          data-testid={testId}
        >
          {SOUND_TRACING_QUALITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
