import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStubSoundTracingRuntime,
  estimateMultiroomMix,
  loadSoundTracingRuntime,
  SOUND_TRACING_DISPLAY_NAME,
  SOUND_TRACING_PACKAGE_NAME,
} from './soundTracingRuntime';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Sound-tracing.js stub runtime', () => {
  it('reports the public package and display names', async () => {
    const runtime = createStubSoundTracingRuntime(null);
    const validation = await runtime.validate();

    expect(validation.packageName).toBe(SOUND_TRACING_PACKAGE_NAME);
    expect(validation.displayName).toBe(SOUND_TRACING_DISPLAY_NAME);
    expect(validation.mode).toBe('stub');
    expect(validation.warnings.join(' ')).toContain('Licensed runtime not found');
  });

  it('attenuates blocked multiroom sources and opens direct door paths', () => {
    const closed = estimateMultiroomMix({
      listenerRoom: 'center',
      doors: {
        north: false,
        east: false,
        south: false,
        west: false,
      },
      sources: [{ id: 'source-a', room: 'north', frequencyHz: 330 }],
    });
    const open = estimateMultiroomMix({
      listenerRoom: 'center',
      doors: {
        north: true,
        east: false,
        south: false,
        west: false,
      },
      sources: [{ id: 'source-a', room: 'north', frequencyHz: 330 }],
    });

    expect(closed.sources[0].blocked).toBe(true);
    expect(open.sources[0].blocked).toBe(false);
    expect(open.sources[0].gain).toBeGreaterThan(closed.sources[0].gain);
  });
});

describe('Sound-tracing.js vendor runtime discovery', () => {
  it('loads the manifest SDK entry without an environment override', async () => {
    const moduleUrl = 'data:text/javascript,export const SoundTrace = {}';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ entry: moduleUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'text/javascript' },
      }));

    vi.stubEnv('VITE_SOUND_TRACING_VENDOR_URL', '');
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
    vi.stubGlobal('document', { querySelectorAll: () => [] });
    vi.stubGlobal('fetch', fetchMock);

    const runtime = await loadSoundTracingRuntime();

    expect(runtime.mode).toBe('licensed');
    expect(fetchMock).toHaveBeenNthCalledWith(2, moduleUrl, {
      method: 'HEAD',
      cache: 'no-store',
    });
  });

  it('keeps the stub runtime when the manifest SDK entry is absent', async () => {
    const moduleUrl = 'http://localhost/vendor-runtime/sound-tracing/sdk/index.js';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ entry: moduleUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    vi.stubEnv('VITE_SOUND_TRACING_VENDOR_URL', '');
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
    vi.stubGlobal('document', { querySelectorAll: () => [] });
    vi.stubGlobal('fetch', fetchMock);

    const runtime = await loadSoundTracingRuntime();

    expect(runtime.mode).toBe('stub');
    expect(runtime.sourceUrl).toBeNull();
  });
});
