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
