/**
 * Esoteric patching tests against the 0A-spec-01-example-v0.4.0.toml fixture.
 *
 * Each test targets a structurally tricky corner of the document:
 *   - deeply nested tables (x.y.z.w)
 *   - inline tables with multiple keys
 *   - multi-line strings with line-ending backslashes
 *   - multi-line literal strings
 *   - multi-line arrays with trailing commas
 *   - integer underscores
 *   - table arrays with empty entries ([[products]])
 *   - nested AOT + sub-table + nested AOT (fruit)
 */

import patch from '../patch';
import { parse } from '../';
import { readFileSync } from 'fs';
import { join } from 'path';
import dedent from 'dedent';

const fixturePath = join(__dirname, '../__fixtures__/0A-spec-01-example-v0.4.0.toml');
const fixture = readFileSync(fixturePath, 'utf8');


test('spec example: edit value in deeply nested implicit table x.y.z.w', () => {
  const input = dedent`
    [table.subtable]
    key = "another value"

    [w]

    [table.inline]
    name = { first = "Tom", last = "Preston-Werner" }
  `;
  const value = parse(input);
  value.w = 9;

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [table.subtable]
    key = "another value"

    w = 9

    [table.inline]
    name = { first = "Tom", last = "Preston-Werner" }
  `);
});


// ---------------------------------------------------------------------------
// Deeply nested implicit super-tables
// ---------------------------------------------------------------------------

test('spec example: edit value in deeply nested implicit table x.y.z.w', () => {
  const input = dedent`
    [table.subtable]
    key = "another value"

    [x.y.z.w]

    [table.inline]
    name = { first = "Tom", last = "Preston-Werner" }
  `;
  const value = parse(input);
  value.x.y.z.w = 'deep';

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [table.subtable]
    key = "another value"

    [x.y.z]
    w = "deep"

    [table.inline]
    name = { first = "Tom", last = "Preston-Werner" }
  `);
});



test('spec example: replace non-empty table with scalar and verify later section placement', () => {
  // Exercises replace() span accounting: when a non-empty table is replaced by a
  // scalar the stale newTable span must not corrupt following section positions.
  const input = dedent`
    [x.y.z.w]
    a = 1
    b = 2

    [after]
    value = 1
  `;
  const value = parse(input);
  value.x.y.z.w = 'deep';

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [x.y.z]
    w = "deep"

    [after]
    value = 1
  `);
});

test('spec example: replace empty table with multi-KV object and verify later section placement', () => {
  const input = dedent`
    [x.y.z.w]

    [after]
    value = 1
  `;
  const value = parse(input);
  value.x.y.z.w = { one: 1, two: 2, three: 3 };

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [x.y.z.w]
    one = 1
    two = 2
    three = 3

    [after]
    value = 1
  `);
});

test('spec example: add a key-value inside deeply nested implicit table x.y.z.w', () => {
  const value = parse(fixture);
  value.x.y.z.w.foo = 'deep';

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.x.y.z.w.foo).toBe('deep');
  // Verify surrounding sections are not corrupted
  expect(parsed.table.inline.name.first).toBe('Tom');
  expect(parsed.table.subtable.key).toBe('another value');
});
// ---------------------------------------------------------------------------
// Inline table mutations
// ---------------------------------------------------------------------------

test('spec example: edit a key inside an inline table', () => {
  const value = parse(fixture);
  value.table.inline.name.first = 'Jane';

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.table.inline.name.first).toBe('Jane');
  expect(parsed.table.inline.name.last).toBe('Preston-Werner');
});

test('spec example: add a key to an inline table', () => {
  const value = parse(fixture);
  value.table.inline.point.z = 3;

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.table.inline.point).toEqual({ x: 1, y: 2, z: 3 });
});

test('spec example: remove a key from an inline table', () => {
  const value = parse(fixture);
  delete value.table.inline.point.y;

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.table.inline.point).toEqual({ x: 1 });
});

// ---------------------------------------------------------------------------
// Multi-line basic strings (line-ending backslash)
// ---------------------------------------------------------------------------

test('spec example: edit multi-line string with line-ending backslash', () => {
  const value = parse(fixture);
  value.string.multiline.continued.key2 = 'replaced';

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.string.multiline.continued.key2).toBe('replaced');
  // Sibling keys must be untouched
  expect(parsed.string.multiline.continued.key1).toBe('The quick brown fox jumps over the lazy dog.');
  expect(parsed.string.multiline.continued.key3).toBe('The quick brown fox jumps over the lazy dog.');
});

// ---------------------------------------------------------------------------
// Multi-line literal strings
// ---------------------------------------------------------------------------

test('spec example: edit multi-line literal string', () => {
  const value = parse(fixture);
  value.string.literal.multiline.lines = 'replaced';

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.string.literal.multiline.lines).toBe('replaced');
  expect(parsed.string.literal.multiline.regex2).toBe("I [dw]on't need \\d{2} apples");
});

// ---------------------------------------------------------------------------
// Integer underscores
// ---------------------------------------------------------------------------

test('spec example: edit integer with underscores', () => {
  const value = parse(fixture);
  value.integer.underscores.key2 = 9999999;

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.integer.underscores.key2).toBe(9999999);
  // Other underscore values must survive untouched
  expect(parsed.integer.underscores.key1).toBe(1000);
  expect(parsed.integer.underscores.key3).toBe(12345);
});

// ---------------------------------------------------------------------------
// Multi-line arrays with trailing comma
// ---------------------------------------------------------------------------

test('spec example: append to multi-line array (key6) that has trailing comma', () => {
  const value = parse(fixture);
  value.array.key6.push(3);

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.array.key6).toEqual([1, 2, 3]);
  // key5 must be untouched
  expect(parsed.array.key5).toEqual([1, 2, 3]);
});

test('spec example: remove element from multi-line array (key6) that has trailing comma', () => {
  const value = parse(fixture);
  value.array.key6.splice(0, 1); // remove first element (1)

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.array.key6).toEqual([2]);
});

// ---------------------------------------------------------------------------
// Table array with empty entry
// ---------------------------------------------------------------------------

test('spec example: edit first products entry', () => {
  const value = parse(fixture);
  value.products[0].name = 'Wrench';

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.products[0].name).toBe('Wrench');
  expect(parsed.products[0].sku).toBe(738594937);
  // Empty middle entry and third entry untouched
  expect(parsed.products[1]).toEqual({});
  expect(parsed.products[2]).toEqual({ name: 'Nail', sku: 284758393, color: 'gray' });
});

test('spec example: add a key to the empty products entry', () => {
  const value = parse(fixture);
  value.products[1].name = 'Screwdriver';

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.products[1].name).toBe('Screwdriver');
  // Surrounding entries untouched
  expect(parsed.products[0].name).toBe('Hammer');
  expect(parsed.products[2].name).toBe('Nail');
});

test('spec example: remove a key from the last products entry', () => {
  const value = parse(fixture);
  delete value.products[2].color;

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.products[2]).toEqual({ name: 'Nail', sku: 284758393 });
});

// ---------------------------------------------------------------------------
// Nested AOT + sub-table + nested AOT (fruit)
// ---------------------------------------------------------------------------

test('spec example: edit leaf value in nested AOT fruit.variety', () => {
  const value = parse(fixture);
  value.fruit[0].variety[1].name = 'fuji';

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.fruit[0].variety[0].name).toBe('red delicious');
  expect(parsed.fruit[0].variety[1].name).toBe('fuji');
  // Other fruit entries untouched
  expect(parsed.fruit[1].name).toBe('banana');
  expect(parsed.fruit[1].variety[0].name).toBe('plantain');
});

test('spec example: edit fruit.physical sub-table', () => {
  const value = parse(fixture);
  value.fruit[0].physical.color = 'green';

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.fruit[0].physical.color).toBe('green');
  expect(parsed.fruit[0].physical.shape).toBe('round');
});

test('spec example: add a new variety to the second fruit entry', () => {
  const value = parse(fixture);
  value.fruit[1].variety.push({ name: 'cavendish' });

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.fruit[1].variety).toEqual([
    { name: 'plantain' },
    { name: 'cavendish' },
  ]);
  // First fruit entry untouched
  expect(parsed.fruit[0].variety).toEqual([
    { name: 'red delicious' },
    { name: 'granny smith' },
  ]);
});

test('spec example: append nested AOT without collapsing later root table spacing', () => {
  const input = dedent`
    [[fruit]]
    name = "banana"

    [[fruit.variety]]
    name = "plantain"

    [after]
    value = 1
  `;
  const value = parse(input);
  value.fruit[0].variety.push({ name: 'cavendish' });

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [[fruit]]
    name = "banana"

    [[fruit.variety]]
    name = "plantain"

    [[fruit.variety]]
    name = "cavendish"

    [after]
    value = 1
  `);
});

test('spec example: append nested AOT entry with multiple KVs and verify later section placement', () => {
  // Exercises the freshTableArray span accounting: when a nested AOT entry is
  // regenerated from scratch its KV items must not corrupt the position of
  // subsequent root sections.
  const input = dedent`
    [[fruit]]
    name = "banana"

    [[fruit.variety]]
    name = "plantain"

    [after]
    key1 = "a"
    key2 = "b"
    key3 = "c"
  `;
  const value = parse(input);
  value.fruit[0].variety.push({ name: 'cavendish', color: 'yellow', origin: 'ecuador', fresh: true, sku: 42 });

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [[fruit]]
    name = "banana"

    [[fruit.variety]]
    name = "plantain"

    [[fruit.variety]]
    name = "cavendish"
    color = "yellow"
    origin = "ecuador"
    fresh = true
    sku = 42

    [after]
    key1 = "a"
    key2 = "b"
    key3 = "c"
  `);
});

test('spec example: append multiple nested AOT entries and verify later section placement', () => {
  const input = dedent`
    [[fruit]]
    name = "banana"

    [[fruit.variety]]
    name = "plantain"

    [after]
    value = 1
  `;
  const value = parse(input);
  value.fruit[0].variety.push({ name: 'cavendish' });
  value.fruit[0].variety.push({ name: 'goldfinger' });
  value.fruit[0].variety.push({ name: 'dwarf' });

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [[fruit]]
    name = "banana"

    [[fruit.variety]]
    name = "plantain"

    [[fruit.variety]]
    name = "cavendish"

    [[fruit.variety]]
    name = "goldfinger"

    [[fruit.variety]]
    name = "dwarf"

    [after]
    value = 1
  `);
});

// ---------------------------------------------------------------------------
// Cross-section: add a root-level key alongside nested tables
// ---------------------------------------------------------------------------

test('spec example: add a new root key-value alongside nested tables', () => {
  const value = parse(fixture);
  value.meta = 'roundtrip';

  const result = patch(fixture, value);
  const parsed = parse(result);

  expect(parsed.meta).toBe('roundtrip');
  // Spot-check that unrelated data survived
  expect(parsed.table.subtable.key).toBe('another value');
  expect(parsed.fruit[0].name).toBe('apple');
});
