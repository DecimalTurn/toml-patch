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

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync } from 'child_process';
import Benchmark from 'benchmark';
import mri from 'mri';
import { checkThresholds } from './check-thresholds.mjs';

const { Suite, formatNumber } = Benchmark;
const __dirname = dirname(fileURLToPath(import.meta.url));

const CURRENT_IMPL = 'toml-patch (current)';
const BASELINE_IMPL = 'toml-patch (baseline)';
const MARKDOWN_PATH = join(__dirname, '..', 'benchmark-smol.md');

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

const { versions, baseline } = mri(process.argv.slice(2).filter((arg) => arg !== '--'), {
  string: ['versions', 'baseline'],
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

// Add the build to compare against. CI points this at the base branch, so the
// Ratio column reports the branch against branch comparison. Relative paths are
// resolved from the repository root.
const baselinePath = baseline ?? process.env.BENCH_BASELINE;
if (baselinePath) {
  const resolvedBaseline = resolve(join(__dirname, '..'), baselinePath);
  if (!existsSync(resolvedBaseline)) {
    throw new Error(`Baseline build not found: ${resolvedBaseline}`);
  }
  IMPLEMENTATIONS.push({ name: BASELINE_IMPL, path: resolvedBaseline });
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

/**
 * Writes a markdown summary of both operations. When a baseline build was
 * benchmarked, the tables gain a Ratio column comparing the current build with
 * it, which is what the CI report posts on pull requests.
 */
function writeMarkdown(parseResults, stringifyResults) {
  const comparisonName = parseResults.some((result) => result.impl === BASELINE_IMPL)
    ? BASELINE_IMPL
    : null;
  const implNames = IMPLEMENTATIONS.map(({ name }) => name).reverse();

  let markdown = '# smol-toml Fixture Benchmark Results\n\n';
  markdown += '*All measurements in operations per second (ops/sec). Higher is better.*\n\n';

  for (const [label, results] of [
    ['Parse', parseResults],
    ['Stringify', stringifyResults],
  ]) {
    const headers = ['Benchmark', ...implNames];
    if (comparisonName) headers.push('Ratio');

    markdown += `## ${label}\n\n`;
    markdown += '| ' + headers.join(' | ') + ' |\n';
    markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    for (const fixture of FIXTURES) {
      const hzFor = (impl) =>
        results.find((result) => result.fixture === fixture.name && result.impl === impl)?.hz;
      const sizeKB = (fixture.data.length / 1024).toFixed(1);
      const row = [`${fixture.name} (${sizeKB} KB)`];

      for (const impl of implNames) {
        const hz = hzFor(impl);
        row.push(hz != null ? hz.toFixed(hz < 100 ? 2 : 0) : 'N/A');
      }

      if (comparisonName) {
        const baselineHz = hzFor(comparisonName);
        const currentHz = hzFor(CURRENT_IMPL);
        row.push(
          baselineHz && currentHz && baselineHz > 0 ? (currentHz / baselineHz).toFixed(2) : 'N/A'
        );
      }

      markdown += '| ' + row.join(' | ') + ' |\n';
    }

    markdown += '\n';
  }

  writeFileSync(MARKDOWN_PATH, markdown, 'utf8');
  console.log(`\nBenchmark results written to ${MARKDOWN_PATH}`);
}

report('Parse:', parseResults);
report('Stringify:', stringifyResults);
writeMarkdown(parseResults, stringifyResults);

// CI gate: fail when the current build's throughput drops below the budgets
// configured for the smol suite in thresholds.toml.
const fixtures = FIXTURES.map(({ name }) => name);
const hzFor = (results) => (impl, fixture) =>
  results.find((result) => result.fixture === fixture && result.impl === impl)?.hz;

const thresholdFailed = checkThresholds({
  suite: 'smol',
  currentName: CURRENT_IMPL,
  operations: [
    { name: 'parse', fixtures, hzFor: hzFor(parseResults) },
    { name: 'stringify', fixtures, hzFor: hzFor(stringifyResults) },
  ],
});

if (thresholdFailed) process.exitCode = 1;
