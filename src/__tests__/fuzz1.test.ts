import { fuzzOne1 } from './fuzz-patch1';

const baselineSeeds = Array.from({ length: 100 }, (_, index) => index);

test.each(baselineSeeds)('fuzz1 seed %d round-trips the general patch corpus', (seed: number) => {
  const result = fuzzOne1(seed, 3);
  expect(result.status, result.error).toBe('ok');
});
