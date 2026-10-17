import { fuzzOne5 } from './fuzz-patch5';

const structureSeeds = Array.from({ length: 100 }, (_, index) => index);

test.each(structureSeeds)('fuzz5 seed %d round-trips structure-first AOT edits', (seed) => {
  const result = fuzzOne5(seed, 1);
  expect(result.status, result.error).toBe('ok');
});
