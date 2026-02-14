/**
 * Profiling script — identifies hot paths in toml-patch parse/stringify.
 * Run: node benchmark/profile.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { Session } from 'node:inspector/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import individual pipeline stages from dist
const tomlPatch = await import('../dist/toml-patch.js');
const smolTomlPath = join(__dirname, '../.bench-cache/smol-toml/node_modules/smol-toml/dist/index.js');
const smolToml = await import(smolTomlPath);

const WARMUP = 100;
const ITERATIONS = 1000;
const benchDir = join(__dirname, '../submodules/iarna-toml/benchmark');

const files = [
  '01-small-doc-mixed-type-inline-array.toml',
  '0A-spec-01-example-v0.4.0.toml',
  '0C-scaling-array-inline-1000.toml',
  '0C-scaling-table-inline-1000.toml',
];

function timeIt(fn, iterations = ITERATIONS) {
  for (let i = 0; i < WARMUP; i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

// ── Phase 1: Comparison ─────────────────────────────────────────────────────
console.log('═'.repeat(80));
console.log('  PARSE: toml-patch vs smol-toml — ms per call');
console.log('═'.repeat(80));

for (const filename of files) {
  const data = readFileSync(join(benchDir, filename), 'utf8');
  const name = basename(filename, '.toml');
  
  console.log(`\n── ${name} (${data.length} chars) ──`);

  let smolTime;
  try {
    smolTime = timeIt(() => smolToml.parse(data));
    console.log(`  smol-toml:     ${smolTime.toFixed(4)} ms`);
  } catch { 
    console.log(`  smol-toml:     (error)`);
  }

  const tpTime = timeIt(() => tomlPatch.parse(data));
  console.log(`  toml-patch:    ${tpTime.toFixed(4)} ms`);

  if (smolTime) {
    console.log(`  ratio:         ${(tpTime / smolTime).toFixed(1)}x slower`);
  }
}

// ── Phase 2: V8 CPU profile ─────────────────────────────────────────────────
console.log('\n\n');
console.log('═'.repeat(80));
console.log('  V8 CPU PROFILE — capturing hot paths');
console.log('═'.repeat(80));

const specData = readFileSync(join(benchDir, '0A-spec-01-example-v0.4.0.toml'), 'utf8');
const inlineData = readFileSync(join(benchDir, '0C-scaling-array-inline-1000.toml'), 'utf8');

const session = new Session();
session.connect();

await session.post('Profiler.enable');
await session.post('Profiler.start');

console.log('\n  Profiling spec example (5000 iterations)...');
for (let i = 0; i < 5000; i++) tomlPatch.parse(specData);

console.log('  Profiling inline-array-1000 (2000 iterations)...');
for (let i = 0; i < 2000; i++) tomlPatch.parse(inlineData);

const { profile } = await session.post('Profiler.stop');

// Analyze: aggregate self-time by function
const functionTimes = new Map();
for (const node of profile.nodes) {
  const { functionName, url, lineNumber } = node.callFrame;
  if (!url.includes('toml-patch')) continue;
  
  const hitCount = node.hitCount || 0;
  if (hitCount === 0) continue;
  
  const fn = functionName || '(anonymous)';
  const key = `${fn} (${basename(url)}:${lineNumber + 1})`;
  functionTimes.set(key, (functionTimes.get(key) || 0) + hitCount);
}

const sorted = [...functionTimes.entries()].sort((a, b) => b[1] - a[1]);
const totalHits = sorted.reduce((sum, [, h]) => sum + h, 0);

console.log(`\n  Top functions by CPU self-time (${totalHits} total samples):\n`);

const nameW = 58;
const hdrFn = 'Function'.padEnd(nameW);
console.log(`  ${hdrFn} Samples      %`);
console.log('  ' + '─'.repeat(74));

for (const [fn, hits] of sorted.slice(0, 30)) {
  const pct = ((hits / totalHits) * 100).toFixed(1).padStart(5);
  console.log(`  ${fn.padEnd(nameW)} ${String(hits).padStart(7)}  ${pct}%`);
}

// Save full profile for DevTools
writeFileSync(join(__dirname, 'cpu-profile.cpuprofile'), JSON.stringify(profile));
console.log('\n  Full profile saved to benchmark/cpu-profile.cpuprofile');

// ── Phase 3: Stringify profiling ────────────────────────────────────────────
console.log('\n\n');
console.log('═'.repeat(80));
console.log('  STRINGIFY: toml-patch vs smol-toml — ms per call');
console.log('═'.repeat(80));

for (const filename of files) {
  const data = readFileSync(join(benchDir, filename), 'utf8');
  const name = basename(filename, '.toml');
  const parsed = smolToml.parse(data);
  
  console.log(`\n── ${name} ──`);

  const smolTime = timeIt(() => smolToml.stringify(parsed));
  console.log(`  smol-toml:     ${smolTime.toFixed(4)} ms`);

  const tpTime = timeIt(() => tomlPatch.stringify(parsed));
  console.log(`  toml-patch:    ${tpTime.toFixed(4)} ms`);
  console.log(`  ratio:         ${(tpTime / smolTime).toFixed(1)}x slower`);
}

session.disconnect();
console.log('\nDone.');
