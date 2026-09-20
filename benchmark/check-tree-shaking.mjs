/**
 * Validate tree-shaking capability and effectiveness by bundling minimal consumers
 * with rolldown and measuring the output sizes.
 */
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const tmpDir = join(rootDir, '.tree-shake-test');

// Resolve the rolldown CLI (shipped as a dependency of tsdown).
const rolldownCmd = process.platform === 'win32'
  ? join(rootDir, 'node_modules', '.bin', 'rolldown.cmd')
  : join(rootDir, 'node_modules', '.bin', 'rolldown');

if (!existsSync(rolldownCmd)) {
  console.error('rolldown CLI not found in node_modules/.bin. Run `pnpm install` first.');
  process.exit(1);
}

function bundle(entryFile, outFile, { minify }) {
  const minifyFlag = minify ? ' --minify' : '';
  execSync(
    `"${rolldownCmd}" --input "${entryFile}" --format esm --platform neutral --file "${outFile}"${minifyFlag}`,
    { stdio: 'pipe' }
  );
  return readFileSync(outFile, 'utf8');
}

// Clean up and create temp dir
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

// Define test scenarios. `code` re-exports the API under test so the bundler can
// drop the rest; `minSavingsPct` is the minimum size reduction vs the full
// bundle; `test` is a tiny consumer that must run successfully after bundling.
const scenarios = [
  {
    name: 'Full (all exports)',
    code: `export { parse, stringify, patch, TomlFormat, TomlDocument } from '../dist/toml-patch.js';`,
    test: `
      import { parse, stringify, patch } from '../dist/toml-patch.js';
      if (parse('a = 1').a !== 1) throw new Error('parse() failed');
      if (!stringify({ a: 1 }).includes('a = 1')) throw new Error('stringify() failed');
      if (!patch('a = 1\\n', { b: 2 }).includes('b = 2')) throw new Error('patch() failed');
    `,
  },
  {
    name: 'parse from root',
    code: `export { parse } from '../dist/toml-patch.js';`,
    minSavingsPct: 50,
    test: `
      import { parse } from '../dist/toml-patch.js';
      if (parse('a = 1').a !== 1) throw new Error('parse() failed');
    `,
  },
  {
    name: 'stringify from root',
    code: `export { stringify } from '../dist/toml-patch.js';`,
    minSavingsPct: 30,
    test: `
      import { stringify } from '../dist/toml-patch.js';
      if (!stringify({ a: 1 }).includes('a = 1')) throw new Error('stringify() failed');
    `,
  },
  {
    name: 'patch from root',
    code: `export { patch } from '../dist/toml-patch.js';`,
    minSavingsPct: 1,
    test: `
      import { patch } from '../dist/toml-patch.js';
      if (!patch('a = 1\\n', { b: 2 }).includes('b = 2')) throw new Error('patch() failed');
    `,
  },
];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} kB`;
}

console.log('Tree-shaking validation\n');
console.log('Bundling each scenario with rolldown...\n');

const results = [];

for (const scenario of scenarios) {
  const slug = scenario.name.replace(/[^a-z0-9]/gi, '-');
  const entryFile = join(tmpDir, `entry-${slug}.js`);
  const outFile = join(tmpDir, `out-${slug}.js`);

  writeFileSync(entryFile, scenario.code);

  const entry = { ...scenario, raw: 0, min: 0, gz: 0, error: null, testPassed: false };
  results.push(entry);

  try {
    const rawCode = bundle(entryFile, outFile, { minify: false });
    entry.raw = Buffer.byteLength(rawCode, 'utf8');

    const minCode = bundle(entryFile, outFile, { minify: true });
    entry.min = Buffer.byteLength(minCode, 'utf8');
    entry.gz = gzipSync(minCode).length;

    // Smoke test: bundle a consumer that exercises the exports, then run it.
    const testEntryFile = join(tmpDir, `test-${slug}.js`);
    const testOutFile = join(tmpDir, `test-${slug}.out.js`);
    writeFileSync(testEntryFile, scenario.test);
    bundle(testEntryFile, testOutFile, { minify: true });
    execSync(`"${process.execPath}" "${testOutFile}"`, { stdio: 'pipe' });
    entry.testPassed = true;
  } catch (err) {
    entry.error = err.message;
  }
}

// Print results table
const fullResult = results.find((r) => r.name === 'Full (all exports)');
let failures = 0;

console.log('| Scenario | Raw | Minified | Gzipped | Savings vs Full |');
console.log('|----------|-----|----------|---------|-----------------|');
for (const r of results) {
  const savings = fullResult && fullResult.min > 0
    ? `${((1 - r.min / fullResult.min) * 100).toFixed(1)}%`
    : '-';
  console.log(`| ${r.name.padEnd(30)} | ${formatSize(r.raw).padStart(10)} | ${formatSize(r.min).padStart(10)} | ${formatSize(r.gz).padStart(9)} | ${savings.padStart(15)} |`);
}

if (fullResult && fullResult.min > 0) {
  console.log(`\nTotal bundle (all exports): ${formatSize(fullResult.min)} minified / ${formatSize(fullResult.gz)} gzipped`);
}

// Validate that each tree-shaken bundle actually shrank vs the full bundle.
console.log('\nSize checks:');
for (const r of results) {
  if (r.name === 'Full (all exports)') continue;

  const savingsPct = fullResult && fullResult.min > 0
    ? (1 - r.min / fullResult.min) * 100
    : -Infinity;
  const minPct = r.minSavingsPct ?? 0;
  const ok = r.error === null && savingsPct >= minPct;

  if (ok) {
    console.log(`  PASS ${r.name}: ${savingsPct.toFixed(1)}% savings (required >= ${minPct}%)`);
  } else {
    failures += 1;
    console.error(`  FAIL ${r.name}: expected >= ${minPct}% savings, got ${r.error ? `bundle error: ${r.error}` : `${savingsPct.toFixed(1)}%`}`);
  }
}

// Validate that each tree-shaken bundle actually works.
console.log('\nFunctional checks:');
for (const r of results) {
  if (r.testPassed) {
    console.log(`  PASS ${r.name}: bundle executed successfully`);
  } else {
    failures += 1;
    console.error(`  FAIL ${r.name}: ${r.error ?? 'bundle did not execute successfully'}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed.');
}

// Clean up
rmSync(tmpDir, { recursive: true, force: true });
