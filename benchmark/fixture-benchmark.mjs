/**
 * Benchmark parse and stringify on every fixture the project tracks.
 *
 * Compares toml-patch (the current build) against smol-toml and @iarna/toml on
 * smol-toml's two benchmark documents plus three representative small documents
 * from the iarna corpus.
 *
 * Usage:
 *   pnpm run bench
 *   pnpm run bench -- --versions 3.0.2
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
import { Temporal } from '@js-temporal/polyfill';
import { checkThresholds } from './check-thresholds.mjs';
import { buildRankedTable, buildReport } from './ranked-tables.mjs';

const { Suite } = Benchmark;
const __dirname = dirname(fileURLToPath(import.meta.url));

const CURRENT_IMPL = 'toml-patch (current)';
const BASELINE_IMPL = 'toml-patch (baseline)';
const SMOL_TEMPORAL = 'smol-toml (Temporal)';
const CURRENT_TEMPORAL = 'toml-patch (current, Temporal)';
const MARKDOWN_PATH = join(__dirname, '..', 'benchmark-fixtures.md');

globalThis.Temporal ??= Temporal;

const SMOL_FIXTURES_DIR = join(__dirname, '../submodules/smol-toml/bench/testfiles');
const IARNA_FIXTURES_DIR = join(__dirname, '../submodules/iarna-toml/benchmark');

// The two smol-toml documents plus the small representative documents from the
// iarna corpus. The remaining iarna fixtures are single-type or scaling
// documents that these already cover.
const FIXTURES = [
  { dir: SMOL_FIXTURES_DIR, name: 'toml-spec-example', label: 'smol-toml spec example' },
  { dir: SMOL_FIXTURES_DIR, name: '5mb-mixed', label: 'smol-toml 5MB mixed' },
  { dir: IARNA_FIXTURES_DIR, name: '0A-spec-01-example-v0.4.0', label: 'iarna spec example v0.4.0' },
].map(({ dir, name, label }) => ({
  name,
  label,
  file: `${name}.toml`,
  data: readFileSync(join(dir, `${name}.toml`), 'utf8'),
}));

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
  if (name === 'smol-toml') return (toml) => TOML.parse(toml, { useLegacyDate: true, maxDepth: 1010 });
  if (name === SMOL_TEMPORAL) return (toml) => TOML.parse(toml, { useLegacyDate: false, maxDepth: 1010 });
  if (name === CURRENT_IMPL) return (toml) => TOML.parse(toml, { temporal: false });
  if (name === CURRENT_TEMPORAL) return (toml) => TOML.parse(toml, { temporal: true });
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

// Match the smol-toml README: every implementation stringifies the same object,
// parsed by smol-toml with legacy Date values. A fixture smol-toml cannot parse
// has no shared input, so it stays parse-only.
const referenceToml = await loadModule(join(__dirname, '../node_modules/smol-toml'));
const parsedFixtures = [];
for (const fixture of FIXTURES) {
  try {
    parsedFixtures.push({
      ...fixture,
      value: referenceToml.parse(fixture.data, { useLegacyDate: true, maxDepth: 1010 }),
    });
  } catch (error) {
    console.warn(`Skipping ${fixture.name} stringify: smol-toml could not parse it (${error.message})`);
  }
}

for (const impl of IMPLEMENTATIONS) {
  let TOML;
  try {
    TOML = await loadModule(impl.path);
  } catch (error) {
    console.error(`Skipping ${impl.name}: could not load (${error.message})`);
    continue;
  }

  // Parse Date and Temporal variants separately, as in the upstream README.
  const parseNames = [impl.name];
  if (impl.name === 'smol-toml') parseNames.push(SMOL_TEMPORAL);
  if (impl.name === CURRENT_IMPL) parseNames.push(CURRENT_TEMPORAL);
  for (const parseName of parseNames) {
    const parseFn = createParseRunner(TOML, parseName);
    const runnable = FIXTURES.filter(({ name, data }) => {
      try {
        parseFn(data);
        return true;
      } catch {
        console.warn(`Skipping ${parseName} parse on ${name}: failed`);
        return false;
      }
    });

    if (runnable.length > 0) {
      for (const { data } of runnable) {
        const iterations = data.length > 1_000_000 ? 3 : 50;
        for (let i = 0; i < iterations; i++) parseFn(data);
      }
      const suite = new Suite(`${parseName} parse`);
      for (const { name, data } of runnable) suite.add(name, () => parseFn(data));
      const hzByName = await runSuite(suite);
      for (const { name } of runnable) {
        parseResults.push({ fixture: name, impl: parseName, hz: hzByName.get(name) });
      }
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

/**
 * Writes per-fixture ranked tables like the smol-toml README. A baseline run
 * keeps the CI Ratio column comparing the current build with the baseline.
 */
function writeMarkdown(parseResults, stringifyResults) {
  const comparisonName = parseResults.some((result) => result.impl === BASELINE_IMPL)
    ? BASELINE_IMPL
    : null;
  const tomlPatchVersion = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')).version;
  const smolVersion = JSON.parse(readFileSync(join(__dirname, '../node_modules/smol-toml/package.json'), 'utf8')).version;
  const versions = {
    [CURRENT_IMPL]: `@decimalturn/toml-patch@${tomlPatchVersion}`,
    [CURRENT_TEMPORAL]: `@decimalturn/toml-patch@${tomlPatchVersion} (Temporal, current)`,
    'smol-toml': `smol-toml@${smolVersion}`,
    [SMOL_TEMPORAL]: `smol-toml@${smolVersion} (Temporal)`,
    '@iarna/toml': `@iarna/toml@${JSON.parse(readFileSync(join(__dirname, '../submodules/iarna-toml/package.json'), 'utf8')).version}`,
  };

  /** Reader-facing implementation name, e.g. `smol-toml@1.9.0 (Date)`. */
  const implementationLabel = (name, benchmarkType) => {
    const suffix = name === CURRENT_IMPL
      ? benchmarkType === 'Parse' ? ' (Date, current)' : ' (current)'
      : name === 'smol-toml' && benchmarkType === 'Parse' ? ' (Date)' : '';
    return (versions[name] ?? name) + suffix;
  };

  /** One ranked table per fixture, with the parse Date/Temporal variants. */
  const tablesFor = (benchmarkType, results, tableFixtures) => {
    const ids = [...new Set([
      ...IMPLEMENTATIONS.map(({ name }) => name),
      ...(benchmarkType === 'Parse' ? [SMOL_TEMPORAL, CURRENT_TEMPORAL] : []),
    ])];
    return tableFixtures.map((fixture) => buildRankedTable({
      heading: `${benchmarkType}, ${fixture.label} (${fixture.file})`,
      rows: ids.map((id) => ({
        id,
        label: implementationLabel(id, benchmarkType),
        hz: results.find((result) => result.fixture === fixture.name && result.impl === id)?.hz,
      })),
      includeRank: true,
      ratio: comparisonName ? { compareId: comparisonName, currentId: CURRENT_IMPL } : undefined,
    }));
  };

  const markdown = buildReport({
    title: 'Fixture Benchmark Results',
    tables: [
      ...tablesFor('Parse', parseResults, FIXTURES),
      ...tablesFor('Stringify', stringifyResults, parsedFixtures),
    ],
  });

  writeFileSync(MARKDOWN_PATH, markdown, 'utf8');
  console.log(`\n${markdown}`);
  console.log(`\nBenchmark results written to ${MARKDOWN_PATH}`);
}

writeMarkdown(parseResults, stringifyResults);

// CI gate: fail when the current build's throughput drops below the budgets
// configured for the fixture suite in thresholds.toml.
const parseFixtures = FIXTURES.map(({ name }) => name);
const stringifyFixtures = parsedFixtures.map(({ name }) => name);
const hzFor = (results) => (impl, fixture) =>
  results.find((result) => result.fixture === fixture && result.impl === impl)?.hz;

const thresholdFailed = checkThresholds({
  suite: 'fixtures',
  currentName: CURRENT_IMPL,
  operations: [
    { name: 'parse', fixtures: parseFixtures, hzFor: hzFor(parseResults) },
    { name: 'stringify', fixtures: stringifyFixtures, hzFor: hzFor(stringifyResults) },
  ],
});

if (thresholdFailed) process.exitCode = 1;
