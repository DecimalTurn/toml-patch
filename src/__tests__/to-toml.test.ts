import toTOML, { toTOMLSequential } from '../to-toml';
import parseTOML from '../parse-toml';
import parseJS from '../parse-js';
import { example, kitchen_sink, hard_example, hard_example_unicode } from '../__fixtures__';
import dedent from 'dedent';
import { TomlFormat } from '../toml-format';

test('it should convert CST to toml', () => {
  expect(toTOML(parseTOML(example), TomlFormat.default())).toEqual(example);
});

test('it should convert kitchen sink', () => {
  expect(toTOML(parseTOML(kitchen_sink), TomlFormat.default())).toEqual(kitchen_sink);
});

test('it should convert hard examples', () => {
  expect(toTOML(parseTOML(hard_example), TomlFormat.default())).toEqual(hard_example);
  expect(toTOML(parseTOML(hard_example_unicode), TomlFormat.default())).toEqual(hard_example_unicode);
});


test('it should convert simple examples 1', () => {
  const simpleToml = dedent`
    bar = "baz"

    [foo]
    a = "b"
    ` + '\n';

  let intermediate = parseTOML(simpleToml);
  expect(toTOML(intermediate, TomlFormat.default())).toEqual(simpleToml);

  
});

test('sequential emitter matches coordinate emitter for generated CSTs', () => {
  const fmt = TomlFormat.default();
  const corpus = [
    {},
    { a: 1 },
    { a: 1, b: 2, c: 3 },
    { s: 'hello', n: 42, f: 3.14, b: true, d: new Date('1979-05-27T07:32:00Z') },
    { big: 9007199254740993n, small: 1.5 },
    { owner: { name: 'Alice', dob: new Date('1979-05-27') } },
    { ports: [8000, 8001, 8002] },
    { points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
    { nested: { a: { b: { c: 1 } } } },
    { empty_array: [], empty_table: {} },
    { text: 'line one\nline two\nline three' },
    { text: 'multi\n\n\nlines' },
    { 'quoted key': 'value', 'with.dots': 1, 'with spaces': 2 },
    { table: { array: [1, [2, 3], { nested: [4, 5] }] } },
    { mixed: [1, 'two', 3.0, true, { nested: 'table' }] }
  ];

  for (const value of corpus) {
    const cst = parseJS(value, fmt);
    expect(toTOMLSequential(cst.items, fmt)).toBe(toTOML(cst.items, fmt));
  }
});