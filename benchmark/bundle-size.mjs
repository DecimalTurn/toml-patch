/**
 * Compare bundle sizes between smol-toml and @decimalturn/toml-patch.
 *
 * Usage:
 *   node benchmark/bundle-size.mjs
 *
 * Prerequisites:
 *   pnpm run build   (so dist/index.js exists)
 *
 * The script:
 *   1. Resolves smol-toml from the workspace node_modules
 *   2. Resolves the ESM entry for each library
 *   3. Bundles each with esbuild (minified, no external deps)
 *   4. Measures raw minified size and gzipped size
 *   5. Prints a comparison table to the console
 *   6. Updates the bundle size section in promo.md
 */

import { join, dirname } from 'path';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { gzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────────

function formatKB(bytes) {
  return (bytes / 1024).toFixed(1);
}

// ── Ensure esbuild is available ────────────────────────────────────
const cacheDir = join(rootDir, '.bench-cache');

function ensureEsbuild() {
  const esbuildDir = join(cacheDir, 'esbuild');
  const esbuildBin = join(esbuildDir, 'node_modules', '.bin', 'esbuild');
  // On Windows, .cmd shim will exist
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

// ── Bundle a package entry point with esbuild and return minified code ──
function bundleMinified(esbuildCmd, entryPoint, label) {
  const outfile = join(cacheDir, `${label}-bundle.mjs`);
  execSync(
    `"${esbuildCmd}" "${entryPoint}" --bundle --format=esm --minify --outfile="${outfile}"`,
    { stdio: 'pipe' }
  );
  return readFileSync(outfile, 'utf8');
}

// ── Load smol-toml from workspace dependencies ─────────────────────
function getSmolTomlEntry() {
  const smolDir = join(rootDir, 'node_modules', 'smol-toml');
  if (!existsSync(smolDir)) {
    console.error('node_modules/smol-toml not found. Run `pnpm install` first.');
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(join(smolDir, 'package.json'), 'utf8'));
  const entry = pkg.exports?.import ?? pkg.exports?.['.']?.import ?? pkg.module ?? pkg.main;
  return join(smolDir, entry);
}

// ── Get toml-patch entry ───────────────────────────────────────────
function getTomlPatchEntry() {
  const distFile = join(rootDir, 'dist', 'index.js');
  if (!existsSync(distFile)) {
    console.error('dist/index.js not found. Run `pnpm run build` first.');
    process.exit(1);
  }
  return distFile;
}

// ── Measure bundle size ────────────────────────────────────────────
function measure(esbuildCmd, entryPoint, label) {
  const code = bundleMinified(esbuildCmd, entryPoint, label);
  const minifiedBytes = Buffer.byteLength(code, 'utf8');
  const gzippedBytes = gzipSync(code).length;
  return { minifiedBytes, gzippedBytes };
}

// ── Main ───────────────────────────────────────────────────────────

const esbuildCmd = ensureEsbuild();

console.log('Bundling smol-toml...');
const smolEntry = getSmolTomlEntry();
const smol = measure(esbuildCmd, smolEntry, 'smol-toml');

console.log('Bundling @decimalturn/toml-patch...');
const patchEntry = getTomlPatchEntry();
const patch = measure(esbuildCmd, patchEntry, 'toml-patch');

// ── Print results ──────────────────────────────────────────────────

const diffMin = patch.minifiedBytes - smol.minifiedBytes;
const diffGz = patch.gzippedBytes - smol.gzippedBytes;

console.log();
console.log('═'.repeat(70));
console.log('  Bundle Size Comparison: smol-toml vs @decimalturn/toml-patch');
console.log('═'.repeat(70));
console.log();
console.log(`  ${'Metric'.padEnd(18)} ${'smol-toml'.padEnd(16)} ${'toml-patch'.padEnd(16)} Difference`);
console.log(`  ${'─'.repeat(18)} ${'─'.repeat(16)} ${'─'.repeat(16)} ${'─'.repeat(12)}`);
console.log(`  ${'Minified'.padEnd(18)} ~${formatKB(smol.minifiedBytes).padStart(6)} kB     ~${formatKB(patch.minifiedBytes).padStart(6)} kB     +${formatKB(diffMin)} kB`);
console.log(`  ${'Min + Gzipped'.padEnd(18)} ~${formatKB(smol.gzippedBytes).padStart(6)} kB     ~${formatKB(patch.gzippedBytes).padStart(6)} kB     +${formatKB(diffGz)} kB`);
console.log(`  ${'Dependencies'.padEnd(18)} ${'0'.padStart(7)}        ${'0'.padStart(7)}        —`);
console.log();

// ── Write markdown report ──────────────────────────────────────────

const smolMin = `~${formatKB(smol.minifiedBytes)} kB`;
const smolGz = `~${formatKB(smol.gzippedBytes)} kB`;
const patchMin = `~${formatKB(patch.minifiedBytes)} kB`;
const patchGz = `~${formatKB(patch.gzippedBytes)} kB`;
const diffMinStr = `+${formatKB(diffMin)} kB`;
const diffGzStr = `+${formatKB(diffGz)} kB`;

const mdTable = [
  `| Metric | smol-toml | @decimalturn/toml-patch | Difference |`,
  `|--------|-----------|-------------------------|------------|`,
  `| Minified | ${smolMin} | ${patchMin} | ${diffMinStr} |`,
  `| Min + Gzipped | ${smolGz} | ${patchGz} | ${diffGzStr} |`,
  `| Dependencies | 0 | 0 | — |`,
].join('\n');

let md = `# Bundle Size Comparison: smol-toml vs @decimalturn/toml-patch\n\n`;
md += `## How to generate this report\n\n`;
md += `From the repository root:\n\n`;
md += `1. Build the package (required so \`dist/index.js\` exists):\n`;
md += `   \`pnpm run build\`\n`;
md += `2. Run the comparison script:\n`;
md += `   \`node benchmark/bundle-size.mjs\`\n\n`;
md += `The script writes this file (\`benchmark/bundle-size.md\`) directly.\n\n`;
md += `## Results\n\n`;
md += `${mdTable}\n\n`;
md += `The increase would be around **${diffMinStr} minified** / **${diffGzStr} gzipped**.\n\n`;
md += `Both libraries have **0** runtime dependencies.\n`;

writeFileSync(join(rootDir, 'benchmark', 'bundle-size.md'), md);
console.log('📝 Full comparison written to benchmark/bundle-size.md');

// ── Update promo.md ────────────────────────────────────────────────

const promoPath = join(rootDir, 'promo.md');
if (existsSync(promoPath)) {
  let promo = readFileSync(promoPath, 'utf8');

  // Match the existing table (from header row through the Dependencies row)
  const tableRegex = /\| Metric \| smol-toml \| @decimalturn\/toml-patch \| Difference \|[\s\S]*?\| Dependencies \| 0 \| 0 \| — \|/;

  if (tableRegex.test(promo)) {
    promo = promo.replace(tableRegex, mdTable);

    // Also update the summary sentence
    const summaryRegex = /So the increase would be around \*\*\+[\d.]+ kB minified\*\* \/ \*\*\+[\d.]+ kB gzipped\*\*/;
    const newSummary = `So the increase would be around **${diffMinStr} minified** / **${diffGzStr} gzipped**`;
    promo = promo.replace(summaryRegex, newSummary);

    writeFileSync(promoPath, promo);
    console.log('✅ Updated bundle size table in promo.md');
  } else {
    console.log('⚠️  Could not find the bundle size table in promo.md — skipping update.');
  }
} else {
  console.log('ℹ️  promo.md not found — skipping update.');
}
