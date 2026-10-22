import { parse } from '../index';
import { fuzzOne5, generateAotSource } from './fuzz-patch5';

const structureSeeds = Array.from({ length: 100 }, (_, index) => index);

test('generates interleaved nested AOT ownership and empty subtables', () => {
  const seed = 17;
  const source = generateAotSource({ seed }).source;
  const parsed = parse(source) as any;
  const parent = parsed[`twist_${seed.toString(36)}_0`];

  expect(parent).toHaveLength(2);
  expect(parent[0].branch['leaf.items'].length).toBeGreaterThanOrEqual(2);
  expect(parent[0].branch.tail).toBeDefined();
  expect(parent[1].branch.empty).toEqual({});
  expect(parent[1].branch['leaf.items']).toHaveLength(1);
});

test.each(structureSeeds)('fuzz5 seed %d round-trips structure-first AOT edits', (seed) => {
  const result = fuzzOne5(seed, 1);
  expect(result.status, result.error).toBe('ok');
});
