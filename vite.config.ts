import { createReadStream } from 'node:fs';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const localVendorRoot = fileURLToPath(new URL('./vendor/sound-tracing/', import.meta.url));
const localVendorSdkRoot = fileURLToPath(new URL('./vendor/sound-tracing/sdk/', import.meta.url));
const distVendorSdkRoot = fileURLToPath(new URL('./dist/vendor/sound-tracing/sdk/', import.meta.url));

function serveLocalSoundTracingVendor() {
  return {
    name: 'serve-local-sound-tracing-vendor',
    configureServer(server: any) {
      server.middlewares.use('/vendor-runtime/sound-tracing', serveVendorFile);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use('/vendor-runtime/sound-tracing', serveVendorFile);
    },
  };
}

function copyLocalSoundTracingVendorToDist() {
  return {
    name: 'copy-local-sound-tracing-vendor-to-dist',
    apply: 'build' as const,
    async closeBundle() {
      const info = await stat(path.join(localVendorSdkRoot, 'index.js')).catch(() => null);
      if (!info?.isFile()) return;

      await rm(distVendorSdkRoot, { recursive: true, force: true });
      await mkdir(path.dirname(distVendorSdkRoot), { recursive: true });
      await cp(localVendorSdkRoot, distVendorSdkRoot, { recursive: true });
    },
  };
}

async function serveVendorFile(req: any, res: any, next: any): Promise<void> {
  const requestPath = decodeURIComponent((req.url ?? '').split('?')[0] ?? '/');
  const relativePath = requestPath
    .replace(/^\/vendor-runtime\/sound-tracing\//, '')
    .replace(/^\/+/, '');
  const targetPath = path.resolve(localVendorRoot, relativePath);

  if (!targetPath.startsWith(localVendorRoot)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const info = await stat(targetPath).catch(() => null);
  if (!info?.isFile()) {
    next();
    return;
  }

  const contentType = contentTypeFor(targetPath);
  if (contentType) res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(info.size));
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.end();
    return;
  }

  createReadStream(targetPath).pipe(res);
}

function contentTypeFor(filePath: string): string | null {
  switch (path.extname(filePath)) {
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
    case '.map':
      return 'application/json; charset=utf-8';
    case '.wasm':
      return 'application/wasm';
    case '.bin':
      return 'application/octet-stream';
    case '.mp3':
      return 'audio/mpeg';
    default:
      return null;
  }
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    serveLocalSoundTracingVendor(),
    ...(mode === 'pages' ? [] : [copyLocalSoundTracingVendorToDist()]),
    react(),
  ],
  server: {
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
}));
