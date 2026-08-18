import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const blockedExtensions = new Set(['.wasm', '.dll', '.so', '.dylib', '.lib', '.a']);
const allowedVendorFiles = new Set([
  'public/vendor/sound-tracing/README.md',
  'public/vendor/sound-tracing/runtime-manifest.json',
]);

const trackedFiles = execFileSync('git', ['ls-files'], {
  encoding: 'utf8',
})
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean);

const offenders = trackedFiles.filter((file) => {
  const normalized = file.replace(/\\/g, '/');
  const extension = path.extname(normalized).toLowerCase();

  if (blockedExtensions.has(extension)) return true;

  if (
    normalized.startsWith('public/vendor/sound-tracing/') &&
    !allowedVendorFiles.has(normalized)
  ) {
    return true;
  }

  return false;
});

if (offenders.length > 0) {
  console.error('Private runtime artifacts must not be tracked in this public demo:');
  for (const file of offenders) console.error(`- ${file}`);
  process.exit(1);
}

if (process.argv.includes('--dist')) {
  const distRoot = path.resolve('dist');
  const distFiles = await listFiles(distRoot);
  const distOffenders = distFiles.filter((file) => {
    const relativePath = path.relative(distRoot, file).replace(/\\/g, '/');
    const extension = path.extname(relativePath).toLowerCase();

    if (blockedExtensions.has(extension)) return true;

    return relativePath.startsWith('vendor/sound-tracing/') &&
      relativePath !== 'vendor/sound-tracing/README.md' &&
      relativePath !== 'vendor/sound-tracing/runtime-manifest.json';
  });

  if (distOffenders.length > 0) {
    console.error('Private runtime artifacts must not be included in the Pages artifact:');
    for (const file of distOffenders) {
      console.error(`- ${path.relative(distRoot, file).replace(/\\/g, '/')}`);
    }
    process.exit(1);
  }
}

console.log('Private runtime guard passed.');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  }));
  return files.flat();
}
