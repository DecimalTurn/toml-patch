import type { PatchFuzzResult } from './fuzz-patch';
import { fuzzOne4 } from './fuzz-patch4';

// Seeds the committed suite scans with the variant 4 harness. Extend the range
// when widening coverage, and add any seed a wider sweep surfaces (run
// `npx -y tsx scripts/fuzz-run4.ts --seed 0 --to N --mutations 3`).
const SWEEP_SEED_COUNT = 250;

const sweepSeeds = Array.from({ length: SWEEP_SEED_COUNT }, (_, index) => index);

// Seeds a past sweep failed on and a fix repaired. Kept separate so a
// regression on one is easy to spot against the general sweep.
// 10: an edited date was truncated to the source's fractional-digit count,
// silently changing 750 ms into 700 ms (fixed by widening the fraction).
const historicalFuzzSeeds4: number[] = [10];

function expectOk(result: PatchFuzzResult) {
  expect(result.status, result.error).toBe('ok');
}

test.each(sweepSeeds)('fuzz4 seed %d round-trips its date and format edits', (seed) => {
  expectOk(fuzzOne4(seed, 3));
});

if (historicalFuzzSeeds4.length > 0) {
  test.each(historicalFuzzSeeds4)('historical fuzz4 seed %d still passes', (seed) => {
    expectOk(fuzzOne4(seed, 3));
  });
}
