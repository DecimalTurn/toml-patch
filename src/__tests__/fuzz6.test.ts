import { fuzzOne6 } from './fuzz-patch6';

test('fuzz6 rotates through the three targeted structural mutations', () => {
  const results = [0, 1, 2].map(seed => fuzzOne6(seed, 1));

  expect(results.map(result => result.mutationDescs?.[0]?.split(' at ')[0])).toEqual([
    'replace header-defined table with scalar',
    'delete table with nested AOT descendant',
    'replace inline table subtree with array'
  ]);
});

test('fuzz6 seed 0 round-trips replacing a header-defined table with a scalar', () => {
  expect(fuzzOne6(0, 1).status).toBe('ok');
});

test('fuzz6 seed 1 round-trips deleting a table that owns an AOT descendant', () => {
  expect(fuzzOne6(1, 1).status).toBe('ok');
});

test('fuzz6 seed 2 round-trips replacing a nested inline-table path', () => {
  expect(fuzzOne6(2, 1).status).toBe('ok');
});
