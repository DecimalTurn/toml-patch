import { fuzzOneLite, fuzzRejectsLite, PatchLiteFuzzResult } from './fuzz-patch-lite';

// Seeds whose document is pinned to a fixed randomizer output. Adding a seed
// here keeps that exact document in the committed suite; extend the range when
// widening coverage, and add any seed a wider sweep surfaces (run
// `npx tsx src/__tests__/fuzz-patch-lite.ts --count N` to sweep).
const SWEEP_SEED_COUNT = 120;

const sweepSeeds = Array.from({ length: SWEEP_SEED_COUNT }, (_, index) => index);

// Seeds that failed the harness in a past sweep and were fixed. Kept separate
// so a regression on one of them is easy to spot against the general sweep.
const historicalFuzzSeeds: number[] = [];

function expectOk(result: PatchLiteFuzzResult) {
  expect(result.status, result.error).toBe('ok');
}

test.each(sweepSeeds)('patch-lite fuzz seed %d round-trips its edits', (seed) => {
  // Some random documents carry no editable scalar leaf (for example when every
  // value is a date/time, which patch-lite rejects by design) and are skipped
  // inside the harness; those still return 'ok'.
  expectOk(fuzzOneLite(seed, 5));
});

test.each(sweepSeeds)('patch-lite fuzz seed %d rejects structural changes', (seed) => {
  expectOk(fuzzRejectsLite(seed));
});

if (historicalFuzzSeeds.length > 0) {
  test.each(historicalFuzzSeeds)('historical patch-lite fuzz seed %d still passes', (seed) => {
    expectOk(fuzzOneLite(seed, 5));
    expectOk(fuzzRejectsLite(seed));
  });
}
