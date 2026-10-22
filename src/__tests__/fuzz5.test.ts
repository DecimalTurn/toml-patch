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

test('rotates deterministically through varied AOT mutation classes', () => {
  const expected = [
    'remove AOT entry',
    'add object AOT entry',
    'append non-object AOT value',
    'edit existing AOT value'
  ];
  const results = expected.map((_, seed) => fuzzOne5(seed, 1));

  expect(results.map(result => result.mutationDescs?.[0]?.split(' at ')[0])).toEqual(expected);
  expect(results.every(result => result.status === 'ok')).toBe(true);
  expect(results.map(result => result.patchedToml)).toEqual(
    expected.map((_, seed) => fuzzOne5(seed, 1).patchedToml)
  );
});

test('fuzz5 seed 112 round-trips three varied AOT mutations', () => {
  const result = fuzzOne5(112, 3);
  expect(result.status, result.error).toBe('ok');
});

test.each(structureSeeds)('fuzz5 seed %d round-trips structure-first AOT edits', (seed) => {
  const result = fuzzOne5(seed, 1);
  expect(result.status, result.error).toBe('ok');
});
