import diff from '../diff';

test('it should diff objects', () => {
  expect(
    diff(
      {
        a: 1,
        b: 3.14,
        c: 'd',
        e: true,
        f: [1, 2, 3],
        g: { h: 'i' }
      },
      {
        a: 2,
        b: 3.141,
        c: 'dd',
        e: false,
        f: [1, 2, 3, 4],
        g: { h: 'i', j: 'k' }
      }
    )
  ).toMatchSnapshot();
});

test('it should attempt to find moved array items', () => {
  expect(
    diff(
      [{ value: 1 }, { value: 2 }, { value: 3 }],
      [{ value: 4 }, { value: 3 }, { value: 2 }, { value: 5 }]
    )
  ).toMatchSnapshot();
});

test('it should add, move, and remove in arrays', () => {
  expect(diff([1, 1, 2], [1, 2, 3])).toMatchSnapshot();
});

test('it should compare dates by ISO', () => {
  expect(diff(new Date('1979-05-27T07:32:00Z'), new Date('1979-05-27T07:32:00Z'))).toEqual([]);
});

test('it should find object rename', () => {
  expect(diff({ a: { value: 1 } }, { b: { value: 1 } })).toMatchSnapshot();
});

// A rename is inferred by matching values across before/after. The heuristic asked only
// whether the *source* key had disappeared, never whether the *target* was actually new — so
// removing a key whose value happens to equal an untouched sibling's was read as a rename
// onto that sibling. See https://github.com/DecimalTurn/toml-patch/issues/262.
describe('rename inference requires a genuinely new target key (#262)', () => {
  test('should report a Remove, not a Rename, when the removed value matches a surviving key', () => {
    expect(diff({ a: 1, b: 1 }, { b: 1 })).toEqual([{ type: 'Remove', path: ['a'] }]);
  });

  test('should not swallow an added key alongside such a removal', () => {
    // Previously emitted only `Rename a -> b`, so `x` was never added at all.
    expect(diff({ a: 1, b: 1 }, { b: 1, x: 1 })).toEqual(
      expect.arrayContaining([
        { type: 'Remove', path: ['a'] },
        { type: 'Add', path: ['x'] }
      ])
    );
    expect(diff({ a: 1, b: 1 }, { b: 1, x: 1 })).toHaveLength(2);
  });

  test('should still infer a genuine rename onto a key that did not exist before', () => {
    expect(diff({ a: 1 }, { z: 1 })).toEqual([{ type: 'Rename', path: [], from: 'a', to: 'z' }]);
  });

  test('should still infer a genuine rename when a sibling is untouched', () => {
    expect(diff({ a: 1, keep: 2 }, { z: 1, keep: 2 })).toEqual([
      { type: 'Rename', path: [], from: 'a', to: 'z' }
    ]);
  });

  test('should report a Remove when values differ, as it always did', () => {
    expect(diff({ a: 1, b: 2 }, { b: 2 })).toEqual([{ type: 'Remove', path: ['a'] }]);
  });
});

describe('updateOrder option (docs/PLAN-Update-Order.md)', () => {
  test('a no-options call emits zero Moves for a pure object key-order permutation', () => {
    // The API-compat guarantee (§2): existing callers who never pass options must see
    // byte-for-byte the same Change[] they always have, even for a document whose keys are
    // purely reordered.
    expect(diff({ a: 1, b: 2, c: 3 }, { c: 3, a: 1, b: 2 })).toEqual([]);
  });

  test('updateOrder: false explicitly also emits zero Moves', () => {
    expect(diff({ a: 1, b: 2, c: 3 }, { c: 3, a: 1, b: 2 }, [], { updateOrder: false })).toEqual([]);
  });

  test('updateOrder: true emits a Move with the shape { type, path, from, to, key }', () => {
    const changes = diff({ a: 1, b: 2, c: 3 }, { c: 3, a: 1, b: 2 }, [], { updateOrder: true });

    expect(changes).toEqual([
      { type: 'Move', path: [], from: 2, to: 0, key: 'c' }
    ]);
  });

  test('array Moves are unaffected -- from/to stay bare ordinals with no key', () => {
    const changes = diff([1, 2, 3], [3, 1, 2], [], { updateOrder: true });

    expect(changes).toEqual([
      { type: 'Move', path: [], from: 2, to: 0 }
    ]);
    expect(changes[0]).not.toHaveProperty('key');
  });

  test('updateOrder: true still emits nothing for an identity permutation', () => {
    expect(diff({ a: 1, b: 2 }, { a: 1, b: 2 }, [], { updateOrder: true })).toEqual([]);
  });

  test('updateOrder: true composes with Add/Remove -- a genuinely new key can be placed anywhere in the target order', () => {
    const changes = diff({ a: 1, b: 2 }, { c: 3, a: 1, b: 2 }, [], { updateOrder: true });

    expect(changes).toEqual(
      expect.arrayContaining([
        { type: 'Add', path: ['c'] },
        { type: 'Move', path: [], from: 2, to: 0, key: 'c' }
      ])
    );
  });
});
