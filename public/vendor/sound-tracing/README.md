# Local SDK Runtime

This directory only tracks this README and `runtime-manifest.json`.

Put licensed SDK files in:

```text
vendor/sound-tracing/
```

Expected local layout:

```text
vendor/sound-tracing/sdk/index.js
vendor/sound-tracing/sdk/core/
vendor/sound-tracing/sdk/assets/
```

During local development, Vite serves that ignored folder at:

```text
/vendor-runtime/sound-tracing/sdk/index.js
```

The app probes this entry automatically. No `.env.local` file is required.
