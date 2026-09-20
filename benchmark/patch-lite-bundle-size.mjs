/**
 * Compare bundle sizes between the full toml-patch bundle and the patch-lite subpath export.
 *
 * Usage:
 *   node benchmark/patch-lite-bundle-size.mjs
 *
 * Prerequisites:
 *   pnpm run build   (so dist/toml-patch.js and dist/patch-lite.js exist)
 */

import { join, dirname } from 'path';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { gzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const cacheDir = join(rootDir, '.bench-cache');

// Hard size budget for the lite distribution. It must stay well under the
// full patch bundle while reserving headroom for the edit-only engine.
const BUDGET_MINIFIED = 48 * 1024;
const BUDGET_GZIPPED = 14 * 1024;

function formatKB(bytes) {
  return (bytes / 1024).toFixed(1);
}

function ensureEsbuild() {
  const esbuildDir = join(cacheDir, 'esbuild');
  const esbuildBin = join(esbuildDir, 'node_modules', '.bin', 'esbuild');
  const esbuildCmd = process.platform === 'win32'
    ? join(esbuildDir, 'node_modules', '.bin', 'esbuild.cmd')
    : esbuildBin;

  if (!existsSync(esbuildCmd) && !existsSync(esbuildBin)) {
    console.log('Installing esbuild to benchmark cache...');
    mkdirSync(esbuildDir, { recursive: true });
    execSync(`npm install --prefix "${esbuildDir}" --no-save --no-package-lock esbuild`, { stdio: 'pipe' });
  }
  return esbuildCmd;
}

function bundleMinified(esbuildCmd, entryPoint, label) {
  const outfile = join(cacheDir, `${label}-bundle.mjs`);
  execSync(
    `"${esbuildCmd}" "${entryPoint}" --bundle --format=esm --minify --outfile="${outfile}"`,
    { stdio: 'pipe' }
  );
  return readFileSync(outfile, 'utf8');
}

function measure(esbuildCmd, entryPoint, label) {
  const code = bundleMinified(esbuildCmd, entryPoint, label);
  const minifiedBytes = Buffer.byteLength(code, 'utf8');
  const gzippedBytes = gzipSync(code).length;
  return { minifiedBytes, gzippedBytes };
}

function getFullEntry() {
  const distFile = join(rootDir, 'dist', 'toml-patch.js');
  if (!existsSync(distFile)) {
    console.error('dist/toml-patch.js not found. Run `pnpm run build` first.');
    process.exit(1);
  }
  return distFile;
}

function getPatchLiteEntry() {
  const distFile = join(rootDir, 'dist', 'patch-lite.js');
  if (!existsSync(distFile)) {
    console.error('dist/patch-lite.js not found. Run `pnpm run build` first.');
    process.exit(1);
  }
  return distFile;
}

const esbuildCmd = ensureEsbuild();

console.log('Bundling toml-patch...');
const full = measure(esbuildCmd, getFullEntry(), 'toml-patch');

console.log('Bundling patch-lite...');
const patchLite = measure(esbuildCmd, getPatchLiteEntry(), 'patch-lite');

const diffMin = patchLite.minifiedBytes - full.minifiedBytes;
const diffGz = patchLite.gzippedBytes - full.gzippedBytes;

console.log();
console.log('======================================================================');
console.log('  Bundle Size Comparison: toml-patch vs patch-lite');
console.log('======================================================================');
console.log();
console.log(`  ${'Metric'.padEnd(18)} ${'toml-patch'.padEnd(16)} ${'patch-lite'.padEnd(16)} Difference`);
console.log(`  ${'-'.repeat(18)} ${'-'.repeat(16)} ${'-'.repeat(16)} ${'-'.repeat(12)}`);
console.log(`  ${'Minified'.padEnd(18)} ~${formatKB(full.minifiedBytes).padStart(6)} kB     ~${formatKB(patchLite.minifiedBytes).padStart(6)} kB     ${diffMin >= 0 ? '+' : ''}${formatKB(diffMin)} kB`);
console.log(`  ${'Min + Gzipped'.padEnd(18)} ~${formatKB(full.gzippedBytes).padStart(6)} kB     ~${formatKB(patchLite.gzippedBytes).padStart(6)} kB     ${diffGz >= 0 ? '+' : ''}${formatKB(diffGz)} kB`);
console.log(`  ${'Dependencies'.padEnd(18)} ${'0'.padStart(7)}        ${'0'.padStart(7)}        -`);
console.log();

const fullMin = `~${formatKB(full.minifiedBytes)} kB`;
const fullGz = `~${formatKB(full.gzippedBytes)} kB`;
const patchLiteMin = `~${formatKB(patchLite.minifiedBytes)} kB`;
const patchLiteGz = `~${formatKB(patchLite.gzippedBytes)} kB`;
const diffMinStr = `${diffMin >= 0 ? '+' : ''}${formatKB(diffMin)} kB`;
const diffGzStr = `${diffGz >= 0 ? '+' : ''}${formatKB(diffGz)} kB`;

const mdTable = [
  '| Metric | toml-patch | patch-lite | Difference |',
  '|--------|------------|------------|------------|',
  `| Minified | ${fullMin} | ${patchLiteMin} | ${diffMinStr} |`,
  `| Min + Gzipped | ${fullGz} | ${patchLiteGz} | ${diffGzStr} |`,
  '| Dependencies | 0 | 0 | - |'
].join('\n');

let md = '# Bundle Size Comparison: toml-patch vs patch-lite\n\n';
md += '## How to generate this report\n\n';
md += 'From the repository root:\n\n';
md += '1. Build the package (required so `dist/toml-patch.js` and `dist/patch-lite.js` exist):\n';
md += '   `pnpm run build`\n';
md += '2. Run the comparison script:\n';
md += '   `node benchmark/patch-lite-bundle-size.mjs`\n\n';
md += 'The script writes this file (`benchmark/patch-lite-bundle-size.md`) directly.\n\n';
md += '## Results\n\n';
md += `${mdTable}\n\n`;
md += `patch-lite difference is **${diffMinStr} minified** / **${diffGzStr} gzipped** versus toml-patch.\n`;

writeFileSync(join(rootDir, 'benchmark', 'patch-lite-bundle-size.md'), md);
console.log('Report written to benchmark/patch-lite-bundle-size.md');

if (patchLite.minifiedBytes > BUDGET_MINIFIED || patchLite.gzippedBytes > BUDGET_GZIPPED) {
  console.error(
    `patch-lite exceeded its size budget ` +
    `(minified ${patchLite.minifiedBytes} > ${BUDGET_MINIFIED}, ` +
    `gzipped ${patchLite.gzippedBytes} > ${BUDGET_GZIPPED}).`
  );
  process.exitCode = 1;
}
