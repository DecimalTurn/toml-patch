// Structure-first fuzz runner for repeated and nested arrays-of-tables.
//
// Run a range:
//   npx -y tsx scripts/fuzz-run5.ts --seed 0 --to 9999 --mutations 1
// Report progress every 100 seeds:
//   npx -y tsx scripts/fuzz-run5.ts --seed 0 --to 9999 --mutations 1 --progress 100
// Stop at the first failure:
//   npx -y tsx scripts/fuzz-run5.ts --seed 0 --to 9999 --mutations 1 --fast-fail
import { fuzzOne5 } from '../src/__tests__/fuzz-patch5';

const args = process.argv.slice(2);
const param = (name: string, fallback: number) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const seed = param('seed', 0);
const to = param('to', seed);
const mutations = param('mutations', 1);
const progress = param('progress', 0);
const fastFail = hasFlag('fast-fail');
const failures: string[] = [];
let scanned = 0;

if (!Number.isInteger(progress) || progress < 0) {
  throw new Error('--progress must be a non-negative integer.');
}

for (let current = seed; current <= to; current++) {
  scanned++;
  const result = fuzzOne5(current, mutations);
  if (progress > 0 && scanned % progress === 0) {
    console.log(`PROGRESS: scanned ${scanned} seeds (${seed}..${current})`);
  }
  if (result.status !== 'ok') {
    const line = `SEED ${current} : ${result.status}${result.error ? ` | ${result.error}` : ''}`;
    failures.push(line);
    console.log(line);
    if (fastFail) break;
  }
}

const end = seed + scanned - 1;
console.log(`FAILURES: ${failures.length} (scanned ${scanned} seeds: ${seed}..${end})`);
if (failures.length > 0) process.exit(1);
