/**
 * Patch fuzz harness variant with randomized indentation and multiline formats,
 * while retaining the generator's normal compact dotted-key syntax.
 *
 * Usage: npx -y tsx src/__tests__/fuzz-patch3.ts [--count N] [--seed SEED] [--mutations M]
 */
import { fuzzOne, type PatchFuzzResult } from './fuzz-patch';

// Fuzz harness variant with randomized indentation and multiline formats
export function fuzzOne3(seed: number, mutationCount: number): PatchFuzzResult {
  return fuzzOne(seed, mutationCount, undefined, true, true);
}

function main(): void {
  const args = process.argv.slice(2);
  const param = (name: string, def: number) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? parseInt(args[index + 1], 10) : def;
  };
  const count = param('count', 200);
  const startSeed = param('seed', 0);
  const mutations = param('mutations', 3);

  console.log(`Patch fuzzing compact dotted keys: ${count} seeds (${mutations} mutations each)...`);

  let tested = 0;
  let skipped = 0;
  const failures: PatchFuzzResult[] = [];
  for (let index = 0; index < count; index++) {
    const seed = startSeed + index;
    const result = fuzzOne3(seed, mutations);
    if (result.status === 'ok' && result.mutationDescs && result.mutationDescs.length > 0) {
      tested++;
    } else if (result.status === 'ok') {
      skipped++;
    } else {
      tested++;
      failures.push(result);
      console.log(`FAIL [seed=${seed}]: ${result.status} - ${result.error}`);
    }

    if ((index + 1) % 50 === 0) {
      console.log(`  Progress: ${index + 1}/${count}, tested: ${tested}, failures: ${failures.length}`);
    }
  }

  console.log(`Patch fuzz complete: ${tested} tested, ${skipped} skipped, ${failures.length} failures`);
  if (failures.length > 0) process.exit(1);
}

if (import.meta.main) {
  main();
}
