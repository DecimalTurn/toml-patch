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
// Full requested range (used as the denominator of the progress fraction) and
// the wall-clock start, for elapsed / ETA reporting.
const total = to - seed + 1;
const startTime = Date.now();

// Human-readable duration, e.g. "1h2m3s", "2m3s", "3s".
const formatDuration = (ms: number): string => {
  const sec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
};

const failures: string[] = [];
let scanned = 0;
for (let s = seed; s <= to; s++) {
  scanned++;
  if (progress > 0 && s % progress === 0) {
    const elapsed = Date.now() - startTime;
    const fraction = scanned / total;
    const remaining = fraction > 0 && elapsed > 0
      ? (elapsed / fraction) - elapsed
      : 0;
    const green = '\x1b[32m';
    const reset = '\x1b[0m';
    console.error(
      `${green}progress: ${scanned}/${total} (${(fraction * 100).toFixed(1)}%)` +
      ` | elapsed ${formatDuration(elapsed)} | ETA ${formatDuration(remaining)}${reset}`
    );
  }
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('toml-patch: updateOrder')) {
      originalWarn(`SEED ${s} : ${args[0]}`, ...args.slice(1));
      return;
    }
    originalWarn(...args);
  };

  let result;
  try {
    result = fuzzOne(s, mutations);
  } finally {
    console.warn = originalWarn;
  }
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
