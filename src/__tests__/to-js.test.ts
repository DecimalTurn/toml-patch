import parseTOML from '../parse-toml';
import toJS from '../to-js';
import {
  example,
  fruit,
  kitchen_sink,
  hard_example,
  hard_example_unicode,
  spec_01_example
} from '../__fixtures__';

test('it should convert examples to js', () => {
  expect(toJS(parseTOML(example))).toMatchSnapshot();
  expect(toJS(parseTOML(fruit))).toMatchSnapshot();
});

test('it should convert kitchen sink to JS', () => {
  const js = toJS(parseTOML(kitchen_sink));

  // Normalize local dates and times
  js.values.date.local = js.values.date.local.map((date: Date) => {
    // TODO Need to validate the actual dates in timezone/date independent way
    return Object.prototype.toString.call(date);
  });

  expect(js).toMatchSnapshot();
});

test('it should convert hard examples to JS', () => {
  expect(toJS(parseTOML(hard_example))).toMatchSnapshot();
  expect(toJS(parseTOML(hard_example_unicode))).toMatchSnapshot();
});

test('it should convert spec examples to JS', () => {
  expect(toJS(parseTOML(spec_01_example))).toMatchSnapshot();
});

test('it should not collide empty-string key paths with literal dot keys', () => {
  const src = `
    [""]
    "" = { x = 1 }
    ["."]
    y = 2
  `;
  expect(toJS(parseTOML(src))).toEqual({ '': { '': { x: 1 } }, '.': { y: 2 } });
});

const multiple_keys = `
  a.b.c = 1
  a.d = 2
  a.e = 3

  # Invalid
  a.e.f = 4
`;

const multiple_tables = `
  [a]
  b = 2

  [a]
  c = 3
`;

const static_array = `
  fruit = []

  [[fruit]]
`;

const table_table_array = `
  [a]
  b = 2

  [[a]]
  c = 3
`;

const table_array_table = `
[[fruit]]
  name = "apple"

  [[fruit.variety]]
    name = "red delicious"

  # This table conflicts with the previous table
  [fruit.variety]
    name = "granny smith"
`;

const inline_array_key = `
a = [1, 2, 3]
a.b = 4
`;

const inline_table_duplicate_key = `
t = { a = 1, a = 2 }
`;

const inline_table_conflicting_key = `
t = { a.b = 1, a.b.c = 2 }
`;

describe('validation', () => {
  test('allows the same explicit sub-table path in separate table-array entries', () => {
    const src = `
      [[route]]
      [route.args]
      x = 1

      [[route]]
      args.y = 2
    `;

    expect(toJS(parseTOML(src))).toEqual({
      route: [
        { args: { x: 1 } },
        { args: { y: 2 } }
      ]
    });
  });

  test('allows repeated explicit sub-table paths across nested table-array entries', () => {
    const src = `
      [[group]]
      [[group.route]]
      [group.route.args]
      x = 1

      [[group]]
      [[group.route]]
      [group.route.args]
      y = 2
    `;

    expect(toJS(parseTOML(src))).toEqual({
      group: [
        { route: [{ args: { x: 1 } }] },
        { route: [{ args: { y: 2 } }] }
      ]
    });
  });

  test('allows repeated explicit paths in sibling nested table-array entries', () => {
    const src = `
      [[group]]
      [[group.route]]
      [group.route.args]
      x = 1

      [[group.route]]
      [group.route.args]
      y = 2
    `;

    expect(toJS(parseTOML(src))).toEqual({
      group: [{
        route: [
          { args: { x: 1 } },
          { args: { y: 2 } }
        ]
      }]
    });
  });

  test('allows repeated explicit paths across three AOT levels after an unrelated AOT', () => {
    const src = `
      [[tenant]]
      id = "t0"
      [[tenant.group]]
      id = "g0"
      [[tenant.group.route]]
      id = "r0"
      [tenant.group.route.args]
      value = "first"

      [[audit]]
      event = "checkpoint"

      [[tenant]]
      id = "t1"
      [[tenant.group]]
      id = "g1"
      [[tenant.group.route]]
      id = "r1"
      [tenant.group.route.args]
      value = "second"
    `;

    expect(toJS(parseTOML(src))).toEqual({
      tenant: [
        { id: 't0', group: [{ id: 'g0', route: [{ id: 'r0', args: { value: 'first' } }] }] },
        { id: 't1', group: [{ id: 'g1', route: [{ id: 'r1', args: { value: 'second' } }] }] }
      ],
      audit: [{ event: 'checkpoint' }]
    });
  });

  test('still rejects dotted keys that extend an explicit table outside table arrays', () => {
    const src = `
      [a.b.c]
      value = 1

      [a]
      b.c.extra = 2
    `;

    expect(() => toJS(parseTOML(src))).toThrow(/Cannot extend explicit table a\.b\.c with dotted keys/);
  });

  test('still rejects a value that overwrites a table array from its parent table', () => {
    const src = `
      [[parent.items]]
      [parent]
      other = 1
      items = 2
    `;

    expect(() => toJS(parseTOML(src))).toThrow(/Table already defined: parent\.items/);
  });

  test('still rejects a value that overwrites a nested table array from its parent table in the same entry', () => {
    const src = `
      [[group]]
      [[group.route.items]]
      [group.route]
      items = 2
    `;

    expect(() => toJS(parseTOML(src))).toThrow(/Table already defined: group\.route\.items/);
  });

  test('rejects traversing inherited date properties without mutating shared prototypes', () => {
    const sourceDate = toJS(parseTOML('d = 1979-05-27')).d as Date;
    const datePrototype = Object.getPrototypeOf(sourceDate);
    const originalToISOString = datePrototype.toISOString;
    const src = `
      d = 1979-05-27
      d.constructor.prototype.toISOString = "broken"
    `;

    expect(() => toJS(parseTOML(src))).toThrow(/Value already defined for d\.constructor/);
    expect(datePrototype.toISOString).toBe(originalToISOString);
    expect(sourceDate.toISOString()).toBe('1979-05-27');
    expect((toJS(parseTOML('d = 1979-05-27')).d as Date).toISOString()).toBe('1979-05-27');
  });

  test('rejects an array of tables when its implicit parent already has children', () => {
    const src = `
      [a.b]
      value = 1

      [[a]]
      other = 2
    `;

    expect(() => toJS(parseTOML(src))).toThrow(/Cannot add Array of Tables to table at a/);
  });

  test('allows an explicit table header to open an implicit parent with children', () => {
    const src = `
      [a.b]
      value = 1

      [a]
      other = 2
    `;

    expect(toJS(parseTOML(src))).toEqual({ a: { b: { value: 1 }, other: 2 } });
  });

  test('rejects extending an explicit sub-table after an unrelated table header', () => {
    const src = `
      [[group]]
      [[group.route]]
      [group.route.args.deep]
      value = 1

      [[other]]
      value = 2

      [group.route.args]
      deep.extra = 3
    `;

    expect(() => toJS(parseTOML(src))).toThrow(/Cannot extend explicit table group\.route\.args\.deep with dotted keys/);
  });

  test("it shouldn't allow writing to the same key multiple times", () => {
    expect(() => toJS(parseTOML(multiple_keys))).toThrow(
      /Value already defined for a\.e/
    );
  });

  test("it shouldn't allow repeat table keys", () => {
    expect(() => toJS(parseTOML(multiple_tables))).toThrow(
      /Table already defined: a/
    );
  });

  test("it shouldn't allow appending to static array", () => {
    expect(() => toJS(parseTOML(static_array))).toThrow(
      /Cannot add to static array/
    );
  });

  test("it shouldn't allow appending table array to table", () => {
    expect(() => toJS(parseTOML(table_table_array))).toThrow(
      /Cannot add Array of Tables to table/
    );
  });

  test("it shouldn't allow appending table to table array", () => {
    expect(() => toJS(parseTOML(table_array_table))).toThrow(
      /Table already defined:/
    );
  });

  test("it shouldn't allow appending key to inline array", () => {
    expect(() => toJS(parseTOML(inline_array_key))).toThrow(
      /Cannot add to static array/
    );
  });

  test("it shouldn't allow duplicate keys in inline tables", () => {
    expect(() => toJS(parseTOML(inline_table_duplicate_key))).toThrow(
      /Duplicate key "a" in inline table/
    );
  });

  test("it shouldn't allow conflicting keys in inline tables", () => {
    expect(() => toJS(parseTOML(inline_table_conflicting_key))).toThrow(
      /Key "a\.b\.c" conflicts with key: "a\.b"/
    );
  });
});
