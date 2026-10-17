/**
 * Patch fuzz harness variant 1: the general baseline corpus and mutations.
 *
 * This is the numbered entry point for the original unnumbered fuzz-patch
 * harness. The implementation remains in fuzz-patch.ts because variants 2-4
 * reuse its shared helpers.
 */
import { fuzzOne, type PatchFuzzResult } from './fuzz-patch';

export function fuzzOne1(seed: number, mutationCount: number): PatchFuzzResult {
  return fuzzOne(seed, mutationCount);
}

function main(): void {
  const args = process.argv.slice(2);
  const param = (name: string, fallback: number) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? Number(args[index + 1]) : fallback;
  };
  const count = param('count', 200);
  const startSeed = param('seed', 0);
  const mutations = param('mutations', 3);

  console.log(`Patch fuzzing general baseline: ${count} seeds (${mutations} mutations each)...`);

  let tested = 0;
  let skipped = 0;
  let failures = 0;
  for (let index = 0; index < count; index++) {
    const seed = startSeed + index;
    const result = fuzzOne1(seed, mutations);
    if (result.status === 'ok' && result.mutationDescs && result.mutationDescs.length > 0) {
      tested++;
    } else if (result.status === 'ok') {
      skipped++;
    } else {
      tested++;
      failures++;
      console.log(`FAIL [seed=${seed}]: ${result.status} - ${result.error}`);
    }

    if ((index + 1) % 50 === 0) {
      console.log(`  Progress: ${index + 1}/${count}, tested: ${tested}, failures: ${failures}`);
    }
  }

  console.log(`Patch fuzz complete: ${tested} tested, ${skipped} skipped, ${failures} failures`);
  if (failures > 0) process.exit(1);
}

if (import.meta.main) {
  main();
}
