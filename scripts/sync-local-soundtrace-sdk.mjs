import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSource = path.resolve(repoRoot, '..', 'soundtrace-three-basic', 'public');
const sourceRoot = path.resolve(process.env.SOUNDTRACE_THREE_BASIC_PUBLIC ?? defaultSource);
const targetRoot = path.join(repoRoot, 'vendor', 'sound-tracing');

async function requireDirectory(dir) {
  const info = await stat(dir).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(`missing SDK public directory: ${dir}`);
  }
}

await requireDirectory(sourceRoot);
await requireDirectory(path.join(sourceRoot, 'sdk'));

await mkdir(targetRoot, { recursive: true });
await Promise.all([
  rm(path.join(targetRoot, 'core'), { recursive: true, force: true }),
  rm(path.join(targetRoot, 'assets'), { recursive: true, force: true }),
]);

await cp(path.join(sourceRoot, 'sdk'), path.join(targetRoot, 'sdk'), {
  recursive: true,
  force: true,
  errorOnExist: false,
});

console.log(`[soundtrace-sdk] source: ${sourceRoot}`);
console.log(`[soundtrace-sdk] target: ${targetRoot}`);
console.log('[soundtrace-sdk] synced sdk');
