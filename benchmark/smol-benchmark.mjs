/**
 * Benchmark parse and stringify using smol-toml's benchmark fixtures.
 *
 * Compares toml-patch (the current build) against smol-toml and @iarna/toml
 * on the fixtures in submodules/smol-toml/bench/testfiles.
 *
 * Usage:
 *   pnpm run bench:smol
 *   pnpm run bench:smol -- --versions 3.0.2
 *
 * Options:
 *   --versions <list>  Comma-separated published toml-patch versions to also
 *                      benchmark (installed to .bench-cache on first use).
 */

import { readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync } from 'child_process';
import Benchmark from 'benchmark';
import mri from 'mri';
import { parse as parseToml } from 'smol-toml';

const { Suite, formatNumber } = Benchmark;
const __dirname = dirname(fileURLToPath(import.meta.url));

const THRESHOLDS_PATH = join(__dirname, 'smol-benchmark.thresholds.toml');
const CURRENT_IMPL = 'toml-patch (current)';

const FIXTURES_DIR = join(__dirname, '../submodules/smol-toml/bench/testfiles');
const FIXTURES = [
  { name: 'toml-spec-example', data: readFileSync(join(FIXTURES_DIR, 'toml-spec-example.toml'), 'utf8') },
  { name: '5mb-mixed', data: readFileSync(join(FIXTURES_DIR, '5mb-mixed.toml'), 'utf8') },
];

const IMPLEMENTATIONS = [
  { name: CURRENT_IMPL, path: join(__dirname, '../dist/toml-patch.js') },
  { name: 'smol-toml', path: join(__dirname, '../node_modules/smol-toml') },
  { name: '@iarna/toml', path: join(__dirname, '../submodules/iarna-toml/toml.js') },
];

/** Installs a published version of @decimalturn/toml-patch to a cache directory. */
function installPackageToCache(packageName, version) {
  const cacheDir = join(__dirname, '../.bench-cache');
  const cacheKey = version ? `${packageName.replace(/[/@ ]/g, '-')}-${version}` : packageName.replace(/[/@ ]/g, '-');
  const versionDir = join(cacheDir, cacheKey);
  const modulePath = join(versionDir, 'node_modules', packageName);
  const spec = version ? `${packageName}@${version}` : packageName;

  if (version !== 'latest' && existsSync(modulePath)) {
    return modulePath;
  }
  if (version === 'latest' && existsSync(versionDir)) {
    rmSync(versionDir, { recursive: true, force: true });
  }
  if (!existsSync(versionDir)) {
    mkdirSync(versionDir, { recursive: true });
  }
  console.log(`  Installing ${spec} to cache...`);
  try {
    execSync(
      `npm install --prefix "${versionDir}" --no-save --no-package-lock ${spec}`,
      { stdio: 'pipe' }
    );
    if (existsSync(modulePath)) {
      console.log(`  Cached ${spec}`);
      return modulePath;
    }
    throw new Error('Installation completed but module not found');
  } catch (error) {
    console.error(`  Failed to install ${spec}: ${error.message}`);
    return null;
  }
}

const { versions } = mri(process.argv.slice(2).filter((arg) => arg !== '--'), {
  string: ['versions'],
});

// Prepend published versions requested via --versions (e.g. "3.0.5").
if (versions) {
  const versionImpls = [];
  for (const version of versions.split(',').map((v) => v.trim())) {
    const modulePath = installPackageToCache('@decimalturn/toml-patch', version);
    if (modulePath) {
      const pkgPath = join(modulePath, 'package.json');
      const resolvedVersion = existsSync(pkgPath)
        ? JSON.parse(readFileSync(pkgPath, 'utf8')).version || version
        : version;
      versionImpls.push({ name: `toml-patch (v${resolvedVersion})`, path: modulePath });
    }
  }
  IMPLEMENTATIONS.unshift(...versionImpls);
}

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

/** Runs a Benchmark.js suite to completion and returns a Map of name -> hz. */
async function runSuite(suite) {
  const hzByName = new Map();
  await new Promise((done) => {
    suite
      .on('cycle', (event) => hzByName.set(event.target.name, event.target.hz))
      .on('complete', () => done())
      .run({ async: true });
  });
  return hzByName;
}

const parseResults = [];
const stringifyResults = [];

// Pre-parse the fixtures with the current build so every implementation
// stringifies the same object, mirroring the parse benchmark's inputs.
const currentToml = await loadModule(join(__dirname, '../dist/toml-patch.js'));
const parsedFixtures = FIXTURES.map(({ name, data }) => ({
  name,
  data,
  value: currentToml.parse(data)
}));

for (const impl of IMPLEMENTATIONS) {
  let TOML;
  try {
    TOML = await loadModule(impl.path);
  } catch (error) {
    console.error(`Skipping ${impl.name}: could not load (${error.message})`);
    continue;
  }

  // Parse.
  const parseFn = createParseRunner(TOML, impl.name);
  const runnable = FIXTURES.filter(({ name, data }) => {
    try {
      parseFn(data);
      return true;
    } catch {
      console.warn(`Skipping ${impl.name} parse on ${name}: failed`);
      return false;
    }
  });

  if (runnable.length > 0) {
    for (const { data } of runnable) {
      const iterations = data.length > 1_000_000 ? 3 : 50;
      for (let i = 0; i < iterations; i++) parseFn(data);
    }
    const suite = new Suite(`${impl.name} parse`);
    for (const { name, data } of runnable) suite.add(name, () => parseFn(data));
    const hzByName = await runSuite(suite);
    for (const { name } of runnable) {
      parseResults.push({ fixture: name, impl: impl.name, hz: hzByName.get(name) });
    }
  }

  // Stringify.
  if (typeof TOML.stringify === 'function') {
    const stringifyFn = (value) => TOML.stringify(value);
    const stringifiable = parsedFixtures.filter(({ name, value }) => {
      try {
        stringifyFn(value);
        return true;
      } catch {
        console.warn(`Skipping ${impl.name} stringify on ${name}: failed`);
        return false;
      }
    });

    if (stringifiable.length > 0) {
      for (const { data, value } of stringifiable) {
        const iterations = data.length > 1_000_000 ? 3 : 50;
        for (let i = 0; i < iterations; i++) stringifyFn(value);
      }
      const suite = new Suite(`${impl.name} stringify`);
      for (const { name, value } of stringifiable) suite.add(name, () => stringifyFn(value));
      const hzByName = await runSuite(suite);
      for (const { name } of stringifiable) {
        stringifyResults.push({ fixture: name, impl: impl.name, hz: hzByName.get(name) });
      }
    }
  }
}

// Report.
function report(label, results) {
  for (const fixture of FIXTURES) {
    console.log(`\n${label} ${fixture.name} (${(fixture.data.length / 1024).toFixed(1)} KB)`);
    const rows = results.filter((r) => r.fixture === fixture.name);
    const smolHz = rows.find((r) => r.impl === 'smol-toml')?.hz;
    for (const { impl, hz } of rows) {
      const opsPerSec = hz < 1 ? hz.toFixed(3) : formatNumber(hz.toFixed(hz < 100 ? 2 : 0));
      const note = impl === 'smol-toml'
        ? ' (reference)'
        : smolHz ? ` (${formatFactor(smolHz / hz)} than smol-toml)` : '';
      console.log(`  ${impl}: ${opsPerSec} ops/sec${note}`);
    }
  }
}

/** Formats a slowdown factor as `Nx slower` or `Nx faster`. */
function formatFactor(factor) {
  return factor < 1 ? `${(1 / factor).toFixed(1)}x faster` : `${factor.toFixed(1)}x slower`;
}

report('Parse:', parseResults);
report('Stringify:', stringifyResults);

// CI gate: fail when the current build's throughput drops below a configured
// minimum. Thresholds live in smol-benchmark.thresholds.toml.
checkThresholds(parseResults, stringifyResults);

/**
 * Reads the thresholds TOML file and sets a non-zero exit code when the
 * current build is more than `maxSlowdown` times slower than smol-toml on any
 * fixture. Factors are keyed by operation (`parse` / `stringify`).
 */
function checkThresholds(parseResults, stringifyResults) {
  if (!existsSync(THRESHOLDS_PATH)) {
    console.log('\nNo benchmark thresholds found; skipping the performance gate.');
    return;
  }

  const thresholds = parseToml(readFileSync(THRESHOLDS_PATH, 'utf8'));
  const byOperation = { parse: parseResults, stringify: stringifyResults };

  let failed = false;
  console.log('\nPerformance thresholds (max slowdown vs smol-toml):');
  for (const [operation, config] of Object.entries(thresholds)) {
    const results = byOperation[operation];
    const maxSlowdown = config?.maxSlowdown;
    if (!results || typeof maxSlowdown !== 'number') continue;

    for (const fixture of FIXTURES) {
      const current = results.find((r) => r.fixture === fixture.name && r.impl === CURRENT_IMPL);
      const smol = results.find((r) => r.fixture === fixture.name && r.impl === 'smol-toml');
      if (!current || !smol) {
        console.warn(`  ⚠️  Missing toml-patch or smol-toml result for ${operation} ${fixture.name}; skipping`);
        continue;
      }
      const slowdown = smol.hz / current.hz;
      const ok = slowdown <= maxSlowdown;
      if (!ok) failed = true;
      console.log(`  ${ok ? '✅' : '❌'} ${operation} ${fixture.name}: ${slowdown.toFixed(1)}x slower than smol-toml (max ${maxSlowdown}x)`);
    }
  }

  if (failed) {
    console.error('\n❌ Performance threshold crossed. See output above.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ All performance thresholds met.');
  }
}
