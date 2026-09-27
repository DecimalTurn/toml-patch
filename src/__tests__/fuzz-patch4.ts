/**
 * Patch fuzz harness variant 4: date/time precision and the full TomlFormat
 * surface.
 *
 * The earlier variants replace date leaves with whole-second values and only
 * ever generate six-digit fractions in the source, so `fmtMs` was never asked
 * to write fewer fractional digits than a value needs. This variant:
 *
 * - rewrites the source fractions down to one or two digits, which is the state
 *   where a truncating edit changes the value;
 * - gives replacement dates a time of day and a random millisecond;
 * - randomizes the formatting options the earlier variants leave alone
 *   (`minimumTimeDecimals`, `escapeSequenceUpperCase`).
 *
 * Dates are compared by instant, so writing `09:15:30.7` where the value is
 * 750 ms fails the round trip instead of passing as a formatting difference.
 *
 * Usage: npx -y tsx src/__tests__/fuzz-patch4.ts [--count N] [--seed SEED] [--mutations M]
 */
import { fuzzOne, type FuzzOptions, type PatchFuzzResult } from './fuzz-patch';

const VARIANT_4: FuzzOptions = {
  subSecondDates: true,
  fullFormats: true,
  shortenFractions: true,
  dateFocus: true
};

export function fuzzOne4(seed: number, mutationCount: number): PatchFuzzResult {
  return fuzzOne(seed, mutationCount, undefined, true, true, VARIANT_4);
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

  console.log(`Patch fuzzing date precision and formats: ${count} seeds (${mutations} mutations each)...`);

  let tested = 0;
  let skipped = 0;
  const failures: PatchFuzzResult[] = [];
  for (let index = 0; index < count; index++) {
    const seed = startSeed + index;
    const result = fuzzOne4(seed, mutations);
    if (result.status === 'ok' && result.mutationDescs && result.mutationDescs.length > 0) {
      tested++;
    } else if (result.status === 'ok') {
      skipped++;
    } else {
      tested++;
      failures.push(result);
      console.log(`FAIL [seed=${seed}]: ${result.status} - ${result.error}`);
    }

    if ((index + 1) % 100 === 0) {
      console.log(`  Progress: ${index + 1}/${count}, tested: ${tested}, failures: ${failures.length}`);
    }
  }

  console.log(`Patch fuzz complete: ${tested} tested, ${skipped} skipped, ${failures.length} failures`);
  if (failures.length > 0) process.exit(1);
}

if (import.meta.main) {
  main();
}
