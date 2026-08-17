// Fuzz-runner script: sweep a deterministic seed range through `patch()`
// and report any round-trip / apply failures.
//
// Run a single seed:
//   npx -y tsx scripts/fuzz-run.ts --seed 103 --mutations 3
// Run a range (inclusive):
//   npx -y tsx scripts/fuzz-run.ts --seed 0 --to 100000 --mutations 3
// Stop at the first failure (useful when you expect zero failures):
//   npx -y tsx scripts/fuzz-run.ts --seed 0 --to 100000 --mutations 3 --fast-fail
// Print progress every N seeds (to stderr):
//   npx -y tsx scripts/fuzz-run.ts --seed 0 --to 999999 --progress 25000

import { fuzzOne } from '../src/__tests__/fuzz-patch';

const args = process.argv.slice(2);
const param = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? parseInt(args[i + 1], 10) : def;
};
// A boolean flag (no value): `--fast-fail` stops on the first failure instead
// of scanning the whole range. Useful when we expect zero failures — the run
// short-circuits immediately rather than reporting every seed in a regressed
// range.
const hasFlag = (name: string) => args.includes(`--${name}`);

const seed = param('seed', 0);
const to = param('to', seed);
const mutations = param('mutations', 3);
const fastFail = hasFlag('fast-fail');
// Print a progress line every `progress` seeds (0 = disabled).  The line is
// written to stderr so it never mixes with the machine-readable stdout report.
const progress = param('progress', 0);

const failures: string[] = [];
let scanned = 0;
for (let s = seed; s <= to; s++) {
  scanned++;
  if (progress > 0 && s % progress === 0) {
    console.error(`progress: seed ${s} (${scanned} scanned)`);
  }
  const result = fuzzOne(s, mutations);
  if (result.status !== 'ok') {
    const line = `SEED ${s} : ${result.status}${result.error ? ' | ' + result.error.split('\n')[0] : ''}`;
    failures.push(line);
    console.log(line);
    if (fastFail) break;
  }
}
// When --fast-fail stops early, report the range actually scanned rather than
// the full requested range.
const range = scanned < to - seed + 1 ? `${seed}..${seed + scanned - 1}` : `${seed}..${to}`;
console.log(`FAILURES: ${failures.length} (scanned ${scanned} seeds: ${range})`);
