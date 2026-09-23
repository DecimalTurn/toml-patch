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
import { Temporal } from '@js-temporal/polyfill';
import { checkThresholds } from './check-thresholds.mjs';

const { Suite } = Benchmark;
const __dirname = dirname(fileURLToPath(import.meta.url));

const CURRENT_IMPL = 'toml-patch (current)';
const BASELINE_IMPL = 'toml-patch (baseline)';
const SMOL_TEMPORAL = 'smol-toml (Temporal)';
const CURRENT_TEMPORAL = 'toml-patch (current, Temporal)';
const MARKDOWN_PATH = join(__dirname, '..', 'benchmark-smol.md');

globalThis.Temporal ??= Temporal;

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

// Match the smol-toml README: every implementation stringifies the same
// object parsed by smol-toml with legacy Date values.
const referenceToml = await loadModule(join(__dirname, '../node_modules/smol-toml'));
const parsedFixtures = FIXTURES.map(({ name, data }) => ({
  name,
  data,
  value: referenceToml.parse(data, { useLegacyDate: true, maxDepth: 1010 })
}));

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

  let markdown = '# smol-toml Fixture Benchmark Results\n\n';
  markdown += '*Time per iteration. Lower is better.*\n\n';

  for (const [label, results] of [
    ['Parse', parseResults],
    ['Stringify', stringifyResults],
  ]) {
    for (const fixture of FIXTURES) {
      const names = [...new Set([...IMPLEMENTATIONS.map(({ name }) => name),
        ...(label === 'Parse' ? [SMOL_TEMPORAL, CURRENT_TEMPORAL] : [])])];
      const rows = names.map((name) => ({
        name,
        hz: results.find((result) => result.fixture === fixture.name && result.impl === name)?.hz,
      })).sort((left, right) => (right.hz ?? 0) - (left.hz ?? 0));
      const fastest = rows[0]?.hz;
      const baselineHz = rows.find(({ name }) => name === BASELINE_IMPL)?.hz;
      const currentHz = rows.find(({ name }) => name === CURRENT_IMPL)?.hz;
      const fixtureName = fixture.name === 'toml-spec-example'
        ? 'spec example'
        : '5MB randomly generated file';

      markdown += `#### ${label}, ${fixtureName}\n\n`;
      markdown += '|    | Library | Performance | Slowdown | Notes |';
      if (comparisonName) markdown += ' Ratio |';
      markdown += '\n|:--:|---|---|---|---|';
      if (comparisonName) markdown += '---|';
      markdown += '\n';

      for (const [index, { name, hz }] of rows.entries()) {
        const rank = hz ? (index < 3 ? ['\u{1F947}', '\u{1F948}', '\u{1F949}'][index] : index + 1) : '-';
        const milliseconds = hz ? 1000 / hz : 0;
        const performance = hz
          ? milliseconds < 1 ? `${(milliseconds * 1000).toFixed(2)} \u00b5s/iter` : `${milliseconds.toFixed(2)} ms/iter`
          : '**DNF**';
        const slowdown = hz && fastest
          ? `${(fastest / hz).toFixed(2).replace(/\.00$/, '')}x`
          : '**DNF**';
        const library = versions[name] ?? name;
        const suffix = name === CURRENT_IMPL
          ? label === 'Parse' ? ' (Date, current)' : ' (current)'
          : name === 'smol-toml' && label === 'Parse' ? ' (Date)' : '';
        const row = [rank, library + suffix, performance, slowdown, ''];
        if (comparisonName) {
          row.push(name === CURRENT_IMPL && baselineHz && currentHz
            ? (currentHz / baselineHz).toFixed(2)
            : '');
        }
        markdown += '| ' + row.join(' | ') + ' |\n';
      }
      markdown += '\n';
    }
  }

  writeFileSync(MARKDOWN_PATH, markdown, 'utf8');
  console.log(`\n${markdown}`);
  console.log(`\nBenchmark results written to ${MARKDOWN_PATH}`);
}

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
