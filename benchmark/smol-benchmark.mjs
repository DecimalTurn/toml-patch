/**
 * Benchmark parsing using smol-toml's benchmark fixtures.
 *
 * Compares toml-patch (the current build) against smol-toml and @iarna/toml
 * on the fixtures in submodules/smol-toml/bench/testfiles.
 *
 * Usage:
 *   pnpm run benchmark:smol
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import Benchmark from 'benchmark';

const { Suite, formatNumber } = Benchmark;
const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURES_DIR = join(__dirname, '../submodules/smol-toml/bench/testfiles');
const FIXTURES = [
  { name: 'toml-spec-example', data: readFileSync(join(FIXTURES_DIR, 'toml-spec-example.toml'), 'utf8') },
  { name: '5mb-mixed', data: readFileSync(join(FIXTURES_DIR, '5mb-mixed.toml'), 'utf8') },
];

const IMPLEMENTATIONS = [
  { name: 'toml-patch (current)', path: join(__dirname, '../dist/toml-patch.js') },
  { name: 'smol-toml', path: join(__dirname, '../node_modules/smol-toml') },
  { name: '@iarna/toml', path: join(__dirname, '../submodules/iarna-toml/toml.js') },
];

/** Resolves a package directory to its entry point and imports it. */
async function loadModule(modulePath) {
  const absPath = resolve(__dirname, modulePath);
  let importPath = absPath;

  const pkgJsonPath = join(absPath, 'package.json');
  if (existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const entry =
      (pkg.exports && (typeof pkg.exports === 'string'
        ? pkg.exports
        : pkg.exports.import ||
          (pkg.exports['.'] && (typeof pkg.exports['.'] === 'string'
            ? pkg.exports['.']
            : pkg.exports['.'].import)))) ||
      pkg.module ||
      pkg.main;
    if (entry) importPath = join(absPath, entry);
  }

  return import(pathToFileURL(importPath).href);
}

function createParseRunner(TOML, name) {
  if (name === 'smol-toml') return (toml) => TOML.parse(toml, { maxDepth: 1010 });
  return (toml) => TOML.parse(toml);
}

const allResults = [];

for (const impl of IMPLEMENTATIONS) {
  let TOML;
  try {
    TOML = await loadModule(impl.path);
  } catch (error) {
    console.error(`Skipping ${impl.name}: could not load (${error.message})`);
    continue;
  }

  const parseFn = createParseRunner(TOML, impl.name);

  // Only benchmark fixtures this implementation can parse.
  const runnable = FIXTURES.filter(({ name, data }) => {
    try {
      parseFn(data);
      return true;
    } catch {
      console.warn(`Skipping ${impl.name} on ${name}: parse failed`);
      return false;
    }
  });
  if (runnable.length === 0) continue;

  // Warmup so V8 optimizes before measuring. Fewer passes for large fixtures.
  for (const { data } of runnable) {
    const iterations = data.length > 1_000_000 ? 3 : 50;
    for (let i = 0; i < iterations; i++) parseFn(data);
  }

  const suite = new Suite(`${impl.name} parse`);
  for (const { name, data } of runnable) {
    suite.add(name, () => parseFn(data));
  }

  const hzByName = new Map();
  await new Promise((done) => {
    suite
      .on('cycle', (event) => hzByName.set(event.target.name, event.target.hz))
      .on('complete', () => done())
      .run({ async: true });
  });

  for (const { name } of runnable) {
    allResults.push({ fixture: name, impl: impl.name, hz: hzByName.get(name) });
  }
}

// Report grouped by fixture.
for (const fixture of FIXTURES) {
  console.log(`\n${fixture.name} (${(fixture.data.length / 1024).toFixed(1)} KB)`);
  for (const { impl, hz } of allResults.filter((r) => r.fixture === fixture.name)) {
    const opsPerSec = hz < 1 ? hz.toFixed(3) : formatNumber(hz.toFixed(hz < 100 ? 2 : 0));
    console.log(`  ${impl}: ${opsPerSec} ops/sec`);
  }
}
