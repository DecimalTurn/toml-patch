/**
 * Compare TOML editing workflows across a registry of patch scenarios.
 * Add a scenario by defining its fixtures, update function, and optional gate
 * alongside the existing entries below.
 *
 * Usage:
 *   pnpm run build
 *   pnpm run bench:patch
 *   node benchmark/patch-benchmark.mjs --verify-only
 *
 * BENCH_BASELINE may point to a built toml-patch.js for same-run comparison.
 * The report is written to benchmark/patch-benchmark.md.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Benchmark from 'benchmark';
import { parse as parseSmol, stringify as stringifySmol } from 'smol-toml';
import { buildRankedTable } from './ranked-tables.mjs';
import { checkThresholds } from './check-thresholds.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const currentName = '@decimalturn/toml-patch (current)';
const liteName = 'toml-patch-lite';
const smolName = 'smol-toml';
const baselineName = 'toml-patch (baseline)';
const baselineLiteName = 'toml-patch-lite (baseline)';
const defaultImplementations = ['full', 'lite', 'smol', 'baseline', 'baseline-lite'];
const baselineVersion = process.env.BENCH_BASELINE_VERSION;
const smolVersion = JSON.parse(readFileSync(join(rootDir, 'node_modules/smol-toml/package.json'), 'utf8')).version;

const importDist = (file) => import(pathToFileURL(join(rootDir, 'dist', file)).href);
const current = await importDist('toml-patch.js');
const lite = await importDist('patch-lite.js');

const baselinePath = process.env.BENCH_BASELINE
  ? resolve(rootDir, process.env.BENCH_BASELINE)
  : undefined;
if (baselinePath && !existsSync(baselinePath)) {
  throw new Error(`Baseline build not found: ${baselinePath}`);
}
const baselineLitePath = baselinePath ? join(dirname(baselinePath), 'patch-lite.js') : undefined;
if (baselineLitePath && !existsSync(baselineLitePath)) {
  throw new Error(`Baseline lite build not found: ${baselineLitePath}`);
}
const baseline = baselinePath
  ? await import(pathToFileURL(baselinePath).href)
  : undefined;
const baselineLite = baselineLitePath
  ? await import(pathToFileURL(baselineLitePath).href)
  : undefined;

const representativeSource = [
  'title = "TOML Example"',
  'description = "A representative document for benchmarking"',
  'version = "1.0.0"',
  'enabled = true',
  'port = 8080',
  'threshold = 0.75',
  '',
  '[server]',
  'host = "localhost"',
  'ports = [8000, 8001, 8002]',
  '',
  '[owner]',
  'name = "Tom Preston-Werner"',
  'dob = 1979-05-27',
  '',
].join('\n');

function makeAotSource(familyCount) {
  const lines = ['unrelated_value = 0', ''];
  for (let family = 0; family < familyCount; family++) {
    const key = `scope_${String(family).padStart(4, '0')}`;
    lines.push(
      `[[${key}.entries]]`,
      `id = ${family}`,
      '',
      `[${key}.entries.options]`,
      'enabled = true',
      ''
    );
  }
  return `${lines.join('\n')}\n`;
}

// Each scenario owns its fixture generation and mutation. Implementations and
// reporting are shared, so adding a new workload does not require new runners.
const scenarios = [
  {
    id: 'in-place-edit',
    title: 'Edit existing scalar values',
    description: 'Change several existing root and nested scalar values.',
    implementations: defaultImplementations,
    maxTime: 2,
    thresholds: [{
      suite: 'fixtures.patch',
      operation: 'in-place-edit',
    }],
    fixtures: [{
      name: 'representative-document',
      source: representativeSource,
      update(document) {
        document.version = '1.0.1';
        document.port = 9090;
        document.enabled = false;
        document.server.host = '127.0.0.1';
      },
    }],
  },
  {
    id: 'aot-unrelated-scalar-edit',
    title: 'Edit an unrelated scalar with many top-level AOT scopes',
    description: 'Change one root value while each named AOT owns a nested subtable.',
    implementations: defaultImplementations,
    maxTime: 1,
    thresholds: [
      {
        suite: 'fixtures.patch',
        operation: 'aot-unrelated-scalar-edit',
      },
      {
        suite: 'fixtures.patch',
        operation: 'aot-unrelated-scalar-edit.lite',
        currentName: liteName,
      },
    ],
    fixtures: [64, 256, 1024].map((familyCount) => ({
      name: `aot-scopes-${familyCount}`,
      source: makeAotSource(familyCount),
      update(document) {
        document.unrelated_value = 1;
      },
    })),
  },
];

const adapters = {
  full: {
    name: currentName,
    run: (fixture) => current.patch(fixture.source, fixture.updated),
  },
  lite: {
    name: liteName,
    run: (fixture) => lite.patch(fixture.source, fixture.updated),
  },
  smol: {
    name: smolName,
    run(fixture) {
      const document = parseSmol(fixture.source);
      fixture.update(document);
      return stringifySmol(document);
    },
  },
  baseline: baseline && {
    name: baselineName,
    run: (fixture) => baseline.patch(fixture.source, fixture.updated),
  },
  'baseline-lite': baselineLite && {
    name: baselineLiteName,
    run: (fixture) => baselineLite.patch(fixture.source, fixture.updated),
  },
};

const fixtures = scenarios.flatMap((scenario) => scenario.fixtures.map((fixture) => ({
  ...fixture,
  scenario,
  key: `${scenario.id}:${fixture.name}`,
  updated: (() => {
    const document = current.parse(fixture.source);
    fixture.update(document);
    return document;
  })(),
})));

function adaptersFor(scenario) {
  return scenario.implementations
    .map((key) => {
      const adapter = adapters[key];
      if (key.startsWith('baseline') && !baseline) return undefined;
      if (!adapter) throw new Error(`Unknown implementation adapter "${key}" in scenario "${scenario.id}"`);
      return adapter;
    })
    .filter(Boolean);
}

function verifyFixture(fixture) {
  for (const adapter of adaptersFor(fixture.scenario)) {
    const output = adapter.run(fixture);
    const actual = current.parse(output);
    if (!isDeepStrictEqual(actual, fixture.updated)) {
      throw new Error(`${adapter.name} failed semantic validation for ${fixture.key}`);
    }
  }
}

for (const fixture of fixtures) verifyFixture(fixture);

if (process.argv.includes('--verify-only')) {
  console.log(`Verified ${fixtures.length} fixtures across ${scenarios.length} scenarios without timing.`);
  process.exit(0);
}

const rates = new Map();
for (const fixture of fixtures) {
  const suite = new Benchmark.Suite(`${fixture.scenario.id} ${fixture.name}`);
  for (const adapter of adaptersFor(fixture.scenario)) {
    suite.add(adapter.name, () => adapter.run(fixture), { maxTime: fixture.scenario.maxTime });
  }

  await new Promise((resolveSuite) => {
    suite
      .on('cycle', (event) => {
        console.log(String(event.target));
        rates.set(`${adapterKeyForName(event.target.name)}:${fixture.key}`, event.target.hz);
      })
      .on('complete', resolveSuite)
      .run({ async: true });
  });
}

function adapterKeyForName(name) {
  return Object.entries(adapters).find(([, adapter]) => adapter?.name === name)?.[0];
}

let thresholdFailed = false;
for (const scenario of scenarios.filter((item) => item.thresholds)) {
  for (const { suite, operation, currentName: thresholdCurrentName = currentName } of scenario.thresholds) {
    const failed = checkThresholds({
      suite,
      currentName: thresholdCurrentName,
      operations: [{
        name: operation,
        fixtures: scenario.fixtures.map((fixture) => fixture.name),
        hzFor: (implementation, fixtureName) => {
          const key = Object.entries(adapters).find(([, adapter]) => adapter?.name === implementation)?.[0];
          return rates.get(`${key}:${scenario.id}:${fixtureName}`);
        },
      }],
    });
    thresholdFailed = failed || thresholdFailed;
  }
}

const reportLines = [
  '# 🧩 Patch benchmarks',
  '',
  'Full and lite patching are compared with smol-toml. The smol-toml method parses the document, updates the object, and stringifies it. Timings include each implementation’s complete operation; fixture creation and correctness checks are outside the timed section.',
  '',
  baseline
    ? 'Current and base-branch full and lite patch builds are compared in the same run.'
    : 'No base build was supplied; the current-versus-baseline performance gate is skipped.',
  '',
];

/** @param {string | undefined} version */
const packageLabel = (version) => version
  ? `@decimalturn/toml-patch@${version}`
  : '@decimalturn/toml-patch';
const implementationLabels = new Map([
  [currentName, '@decimalturn/toml-patch (full, current)'],
  [liteName, '@decimalturn/toml-patch (lite, current)'],
  [smolName, `smol-toml@${smolVersion}`],
  [baselineName, `${packageLabel(baselineVersion)} (full, baseline)`],
  [baselineLiteName, `${packageLabel(baselineVersion)} (lite, baseline)`],
]);

for (const scenario of scenarios) {
  const scenarioAdapters = adaptersFor(scenario);
  reportLines.push(`## ${scenario.title}`, '', scenario.description, '');

  for (const fixture of scenario.fixtures) {
    const key = `${scenario.id}:${fixture.name}`;
    reportLines.push(buildRankedTable({
      heading: `🧩 ${scenario.title}, ${fixture.name}`,
      rows: scenarioAdapters.map((adapter) => ({
        id: adapterKeyForName(adapter.name),
        label: implementationLabels.get(adapter.name) ?? adapter.name,
        hz: rates.get(`${adapterKeyForName(adapter.name)}:${key}`),
      })),
      includeRank: true,
      changes: baseline ? [
        { compareId: 'baseline', currentId: 'full' },
        { compareId: 'baseline-lite', currentId: 'lite' },
      ] : [],
    }));
  }
}

const reportPath = join(__dirname, 'patch-benchmark.md');
writeFileSync(reportPath, `${reportLines.join('\n')}\n`);
console.log(`Report written to ${reportPath}`);
if (thresholdFailed) process.exitCode = 1;
