// Fuzz-runner variant for TOML with spaces around dotted-key separators.
//
// Run a single seed:
//   npx -y tsx scripts/fuzz-run2.ts --seed 103 --mutations 3
// Run an inclusive range:
//   npx -y tsx scripts/fuzz-run2.ts --seed 0 --to 100000 --mutations 3
// Stop at the first failure:
//   npx -y tsx scripts/fuzz-run2.ts --seed 0 --to 100000 --mutations 3 --fast-fail
import { fuzzOne2 } from '../src/__tests__/fuzz-patch2';

const args = process.argv.slice(2);
const param = (name: string, def: number) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? parseInt(args[index + 1], 10) : def;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const seed = param('seed', 0);
const to = param('to', seed);
const mutations = param('mutations', 3);
const fastFail = hasFlag('fast-fail');
const failures: string[] = [];
let scanned = 0;

for (let current = seed; current <= to; current++) {
  scanned++;
  const result = fuzzOne2(current, mutations);
  if (result.status !== 'ok') {
    const line = `SEED ${current} : ${result.status}${result.error ? ' | ' + result.error.split('\n')[0] : ''}`;
    failures.push(line);
    console.log(line);
    if (fastFail) break;
  }
}

const end = seed + scanned - 1;
console.log(`FAILURES: ${failures.length} (scanned ${scanned} seeds: ${seed}..${end})`);
