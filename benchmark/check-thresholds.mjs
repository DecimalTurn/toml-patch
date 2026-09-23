/**
 * Shared performance gate for the benchmark harnesses.
 *
 * A run compares the current build with a reference implementation on every
 * fixture of an operation and reports a failure when the current build is more
 * than `maxSlowdown` times slower than the reference.
 *
 * Suites and their budgets live together in benchmark/thresholds.toml:
 *
 *   reference = "smol-toml"
 *
 *   [smol.parse]
 *   maxSlowdown = 8
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
  if (!existsSync(thresholdsPath)) {
    console.log(`\nNo thresholds file at ${thresholdsPath}; skipping the performance gate.`);
    return false;
  }

  const thresholds = parseToml(readFileSync(thresholdsPath, 'utf8'));
  const referenceName =
    typeof thresholds.reference === 'string' ? thresholds.reference : DEFAULT_REFERENCE;
  const suiteThresholds = thresholds[suite] ?? {};

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
