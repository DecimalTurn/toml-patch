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

test('it anchors an added member before a renamed sibling when requested order is supplied', () => {
  expect(diff(
    { value: false },
    { replica: false, primary: 1 },
    ['settings', 'nested'],
    { orderSource: { settings: { nested: { primary: 1, replica: false } } } }
  )).toEqual([
    { type: 'Add', path: ['settings', 'nested', 'primary'], before: 'value' },
    { type: 'Rename', path: ['settings', 'nested'], from: 'value', to: 'replica' }
  ]);
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
    // The bug this guards is `x` vanishing: the original emitted only `Rename a -> b`, so
    // `x` was never added and `b` was written twice.
    //
    // `b` is present on both sides, so it is neither a rename source nor an available
    // target. That leaves exactly one departing key and one arriving key with the value 1,
    // which is an unambiguous pairing, so `a` is now renamed to `x` rather than removed and
    // re-added. Either shape carries `x` into the output; the rename additionally keeps
    // whatever comments and formatting `a` had.
    expect(diff({ a: 1, b: 1 }, { b: 1, x: 1 })).toEqual([
      { type: 'Rename', path: [], from: 'a', to: 'x' }
    ]);
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

// Value equality is the only signal a rename can be inferred from, and several keys can share
// a value. Candidates are grouped by value and paired off in order, as many as both sides can
// supply, because a renamed node keeps its comments while a remove-plus-add loses them.
// Pairing by position is what keeps it one-to-one — the whole group claiming one target is
// what produced a key with an empty name.
describe('rename pairing', () => {
  test('should rename when one key departs and one arrives', () => {
    expect(diff({ a: 1 }, { z: 1 })).toEqual([
      { type: 'Rename', path: [], from: 'a', to: 'z' }
    ]);
  });

  test('should rename regardless of untouched siblings holding other values', () => {
    expect(diff({ a: 1, keep: 2 }, { z: 1, keep: 2 })).toEqual([
      { type: 'Rename', path: [], from: 'a', to: 'z' }
    ]);
  });

  test('should pair every source it can when several share a value', () => {
    expect(diff({ a: 1, b: 1 }, { z: 1, y: 1 })).toEqual([
      { type: 'Rename', path: [], from: 'a', to: 'z' },
      { type: 'Rename', path: [], from: 'b', to: 'y' }
    ]);
  });

  test('should remove the sources it cannot pair', () => {
    expect(diff({ a: 1, b: 1 }, { z: 1 })).toEqual([
      { type: 'Rename', path: [], from: 'a', to: 'z' },
      { type: 'Remove', path: ['b'] }
    ]);
  });

  test('should add the targets it cannot pair', () => {
    expect(diff({ a: 1 }, { z: 1, w: 1 })).toEqual([
      { type: 'Rename', path: [], from: 'a', to: 'z' },
      { type: 'Add', path: ['w'] }
    ]);
  });

  test('should pair as far as the shorter side allows', () => {
    expect(diff({ a: 1, b: 1, c: 1 }, { y: 1, z: 1 })).toEqual([
      { type: 'Rename', path: [], from: 'a', to: 'y' },
      { type: 'Rename', path: [], from: 'b', to: 'z' },
      { type: 'Remove', path: ['c'] }
    ]);
  });

  test('should group by value, so one value never consumes another\'s targets', () => {
    expect(diff({ a: 1, b: 1, c: 2 }, { z: 1, y: 1, w: 2 })).toEqual([
      { type: 'Rename', path: [], from: 'a', to: 'z' },
      { type: 'Rename', path: [], from: 'b', to: 'y' },
      { type: 'Rename', path: [], from: 'c', to: 'w' }
    ]);
  });

  test('should never claim one target twice', () => {
    // The lone target is claimed once and the rest are removed. Emitting a second
    // `Rename -> z` here is what blanked a node's key, giving `  = 1`.
    expect(diff({ a: 1, b: 1, c: 1 }, { z: 1 })).toEqual([
      { type: 'Rename', path: [], from: 'a', to: 'z' },
      { type: 'Remove', path: ['b'] },
      { type: 'Remove', path: ['c'] }
    ]);
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

describe('array moves with duplicate values', () => {
  test('edits the displaced item, not the original at the same index (fuzz seed 340)', () => {
    // Replacing index 0 with a value equal to index 3 moves `true` from 3 to 0,
    // leaving 'a' at index 3.  The edit must diff the SIMULATED element ('a')
    // against the target (true) — diffing the untouched original `before[3]`
    // (true) against true emitted nothing and the leftover 'a' stayed in place.
    const changes = diff(['a', 1, 2, true], [true, 1, 2, true], ['x']);

    expect(changes).toEqual([
      { type: 'Move', path: ['x'], from: 3, to: 0 },
      { type: 'Move', path: ['x'], from: 2, to: 1 },
      { type: 'Move', path: ['x'], from: 3, to: 2 },
      { type: 'Edit', path: ['x', 3] }
    ]);
  });

  test('edits a duplicated value in place instead of an Add + Move chain (fuzz seed 1406)', () => {
    // `true` at index 1 becomes '4' but another `true` remains later in the
    // array.  Reading the element as "kept" made the diff fall through to
    // Add(1) plus a chain of Moves and a trailing Remove — and the writer
    // then slid the multiline string's following row onto its closing
    // quotes.  The surplus occurrence is now edited in place.
    const changes = diff(
      ['a', true, 'b', 'c', 'd', true, 'nested', 'inner', 6767, 'n', true],
      ['a', '4', 'b', 'c', 'd', true, 'nested', 'inner', 6767, 'n', true],
      ['x']
    );

    expect(changes).toEqual([
      { type: 'Edit', path: ['x', 1] }
    ]);
  });

  test('removes a deleted element in place instead of a Move chain when multiline values are present (fuzz seed 4765)', () => {
    // Removing one scalar from an array whose other elements include a
    // multiline string: the element only resolved at the end, after a chain
    // of Moves, and the writer dropped a content line of the multiline
    // string while relocating it.
    const changes = diff(
      ['a', 1, 2, 29780.85246, 'jgl', { k: '=F\nsK\nTijp\nb *8#fBchs>' }],
      ['a', 1, 2, 'jgl', { k: '=F\nsK\nTijp\nb *8#fBchs>' }],
      ['x']
    );

    expect(changes).toEqual([
      { type: 'Remove', path: ['x', 3] }
    ]);
  });
});
