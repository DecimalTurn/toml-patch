/**
 * Shared gates for the benchmark harnesses.
 *
 * The performance gate compares the current build with a reference
 * implementation on every fixture of an operation and reports a failure when
 * the current build is more than `maxSlowdown` times slower than the reference.
 * The bundle size gate compares a measured bundle against an absolute budget.
 *
 * Suites and their budgets live together in benchmark/thresholds.toml:
 *
 *   reference = "smol-toml"
 *
 *   [fixtures.parse]
 *   maxSlowdown = 8
 *
 *   [bundle.patch-lite]
 *   maxMinified = 48
 *   maxGzipped = 14
 *
 * The `reference` key is optional and defaults to smol-toml.
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseToml } from 'smol-toml';

export const DEFAULT_REFERENCE = 'smol-toml';
export const DEFAULT_THRESHOLDS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'thresholds.toml'
);

/**
 * @param {string} thresholdsPath Path of the thresholds TOML file.
 * @returns {object | null} Parsed thresholds, or `null` when the file is absent.
 */
function readThresholds(thresholdsPath) {
  if (!existsSync(thresholdsPath)) return null;
  return parseToml(readFileSync(thresholdsPath, 'utf8'));
}

/**
 * Resolves a suite name against the parsed thresholds. Dots walk into nested
 * tables, so a section written as `[bundle.patch-lite]` is addressed as
 * `bundle.patch-lite` just as `[fixtures]` is addressed as `fixtures`.
 *
 * @param {object | null} thresholds Parsed thresholds file.
 * @param {string} suite Suite name.
 * @returns {object} The suite table, or an empty object when it is absent.
 */
function readSuite(thresholds, suite) {
  if (!thresholds) return {};
  return suite.split('.').reduce((table, key) => table?.[key], thresholds) ?? {};
}

/**
 * @param {object} options
 * @param {string} options.suite Benchmark suite, matching a table in the thresholds file.
 * @param {string} options.currentName Implementation name of the current build.
 * @param {Array<{
 *   name: string,
 *   fixtures: string[],
 *   hzFor: (impl: string, fixture: string) => number | undefined
 * }>} options.operations Operations to check, in report order.
 * @param {string} [options.thresholdsPath] Path of the thresholds TOML file.
 * @returns {boolean} `true` when at least one threshold was crossed.
 */
export function checkThresholds({
  suite,
  currentName,
  operations,
  thresholdsPath = DEFAULT_THRESHOLDS_PATH,
}) {
  const thresholds = readThresholds(thresholdsPath);
  if (!thresholds) {
    console.log(`\nNo thresholds file at ${thresholdsPath}; skipping the performance gate.`);
    return false;
  }
  const referenceName =
    typeof thresholds.reference === 'string' ? thresholds.reference : DEFAULT_REFERENCE;
  const suiteThresholds = readSuite(thresholds, suite);

  console.log(`\nPerformance thresholds for ${suite} fixtures (max slowdown vs ${referenceName}):`);

  let failed = false;

  for (const { name, fixtures, hzFor } of operations) {
    const maxSlowdown = suiteThresholds[name]?.maxSlowdown;
    if (typeof maxSlowdown !== 'number') continue;

    // Runs restricted to a subset of implementations have no reference to
    // compare against, so the gate has to sit that operation out.
    if (!fixtures.some((fixture) => hzFor(referenceName, fixture) > 0)) {
      console.warn(`  ⚠️  ${referenceName} was not benchmarked for ${name}; skipping`);
      continue;
    }

    for (const fixture of fixtures) {
      const current = hzFor(currentName, fixture);
      const reference = hzFor(referenceName, fixture);

      if (!current || !reference) {
        console.warn(
          `  ⚠️  Missing ${currentName} or ${referenceName} result for ${name} ${fixture}; skipping`
        );
        continue;
      }

      const slowdown = reference / current;
      const ok = slowdown <= maxSlowdown;
      if (!ok) failed = true;

      console.log(
        `  ${ok ? '✅' : '❌'} ${name} ${fixture}: ${slowdown.toFixed(1)}x slower than ${referenceName} (max ${maxSlowdown}x)`
      );
    }
  }

  if (failed) {
    console.error('\n❌ Performance threshold crossed. See output above.');
  } else {
    console.log('\n✅ All performance thresholds met.');
  }

  return failed;
}

/**
 * Bundle size gate for the bundle measurement scripts.
 *
 * Each bundle has a budget in the thresholds file, in kB (1 kB = 1024 bytes):
 *
 *   [bundle.patch-lite]
 *   maxMinified = 48
 *   maxGzipped = 14
 *
 * A budget key that is left out is not gated, and a bundle with no budget at all
 * is measured without failing.
 *
 * @param {object} options
 * @param {string} options.suite Bundle, addressing its table in the thresholds
 *   file, for example `bundle.patch-lite`.
 * @param {number} options.minifiedBytes Minified bundle size, in bytes.
 * @param {number} options.gzippedBytes Minified and gzipped bundle size, in bytes.
 * @param {string} [options.thresholdsPath] Path of the thresholds TOML file.
 * @returns {boolean} `true` when a budget was exceeded.
 */
export function checkBundleThresholds({
  suite,
  minifiedBytes,
  gzippedBytes,
  thresholdsPath = DEFAULT_THRESHOLDS_PATH,
}) {
  const suiteThresholds = readSuite(readThresholds(thresholdsPath), suite);
  const metrics = [
    ['Minified', minifiedBytes, suiteThresholds.maxMinified],
    ['Min + Gzipped', gzippedBytes, suiteThresholds.maxGzipped],
  ].filter(([, , maxKb]) => typeof maxKb === 'number');

  if (metrics.length === 0) {
    console.log(`\nNo bundle budget for ${suite}; skipping the bundle size gate.`);
    return false;
  }

  console.log(`\nBundle size budget for ${suite}:`);

  let failed = false;

  for (const [label, bytes, maxKb] of metrics) {
    const kb = bytes / 1024;
    const ok = kb <= maxKb;
    if (!ok) failed = true;

    console.log(`  ${ok ? '✅' : '❌'} ${label}: ${kb.toFixed(1)} kB (max ${maxKb} kB)`);
  }

  if (failed) {
    console.error(`\n❌ ${suite} exceeded its size budget. See output above.`);
  } else {
    console.log(`\n✅ ${suite} is within its size budget.`);
  }

  return failed;
}
