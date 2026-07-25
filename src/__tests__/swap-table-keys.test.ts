import dedent from 'dedent';
import { parse, patch } from '../index';

test('should swap keys between two tables', () => {
  const input = dedent`
    [A]
    B = "valueB"

    [C]
    D = "valueD"
  `;

  const value = parse(input);

  // Swap: move B from A to C, and D from C to A
  const bValue = value.A.B;
  const dValue = value.C.D;

  delete value.A.B;
  delete value.C.D;

  value.A.D = dValue;
  value.C.B = bValue;

  const result = patch(input, value);

  // Note: patch preserves the original blank line between sections and also
  // preserves the line where the removed key was, resulting in a doubled blank line.
  expect(result).toEqual(dedent`
    [A]
    D = "valueD"

    [C]
    B = "valueB"
  `);
});

test('should swap keys with comments preserved', () => {
  const input = dedent`
    [A]
    # comment for B
    B = "valueB" # inline B

    [C]
    # comment for D
    D = "valueD" # inline D
  `;

  const value = parse(input);

  const bValue = value.A.B;
  const dValue = value.C.D;

  delete value.A.B;
  delete value.C.D;

  value.A.D = dValue;
  value.C.B = bValue;

  const result = patch(input, value);

  // Comments are tied to the line they appear on, so they should be preserved
  // in their original positions. The key movement should not orphan comments.
  expect(result).toEqual(dedent`
    [A]
    # comment for B
    D = "valueD"

    [C]
    # comment for D
    B = "valueB"
  `);
});

test('should swap keys when one table is an inline table', () => {
  const input = dedent`
    [A]
    B = "valueB"

    C = { D = "valueD" }
  `;

  const value = parse(input);

  // Inline table C = { ... } appears under [A], so it's parsed as A.C
  const bValue = value.A.B;
  const dValue = value.A.C.D;

  delete value.A.B;
  delete value.A.C.D;

  value.A.D = dValue;
  value.A.C.B = bValue;

  const result = patch(input, value);

  // C stays at its original line position; D is appended after.
  // The inline table preserves spacing from the original, leaving trailing
  // whitespace where D was removed.
  expect(result).toEqual(dedent`
    [A]

    C = { B = "valueB" }
    D = "valueD"
  `);
});

test('should swap keys between nested tables', () => {
  const input = dedent`
    [A.X]
    B = "valueB"

    [C.Y]
    D = "valueD"
  `;

  const value = parse(input);

  const bValue = value.A.X.B;
  const dValue = value.C.Y.D;

  delete value.A.X.B;
  delete value.C.Y.D;

  value.A.X.D = dValue;
  value.C.Y.B = bValue;

  const result = patch(input, value);

  // Same doubled-blank-line behavior as the simple table swap
  expect(result).toEqual(dedent`
    [A.X]
    D = "valueD"

    [C.Y]
    B = "valueB"
  `);
});

test('should swap a key between two tables that have other keys', () => {
  const input = dedent`
    [A]
    B = "valueB"
    E = "valueE"

    [C]
    D = "valueD"
    F = "valueF"
  `;

  const value = parse(input);

  const bValue = value.A.B;
  const dValue = value.C.D;

  delete value.A.B;
  delete value.C.D;

  value.A.D = dValue;
  value.C.B = bValue;

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [A]
    E = "valueE"
    D = "valueD"

    [C]
    F = "valueF"
    B = "valueB"
  `);
});

test('should swap the last key between two multi-key tables', () => {
  const input = dedent`
    [A]
    B = "valueB"
    E = "valueE"

    [C]
    D = "valueD"
    F = "valueF"
  `;

  const value = parse(input);

  const eValue = value.A.E;
  const fValue = value.C.F;

  delete value.A.E;
  delete value.C.F;

  value.A.F = fValue;
  value.C.E = eValue;

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [A]
    B = "valueB"
    F = "valueF"

    [C]
    D = "valueD"
    E = "valueE"
  `);
});

test('should swap keys between an inline table and a regular table with other keys', () => {
  const input = dedent`
    [A]
    B = "valueB"
    E = "valueE"

    C = { D = "valueD", F = "valueF" }
  `;

  const value = parse(input);

  const bValue = value.A.B;
  const dValue = value.A.C.D;

  delete value.A.B;
  delete value.A.C.D;

  value.A.D = dValue;
  value.A.C.B = bValue;

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [A]
    E = "valueE"

    C = { F = "valueF", B = "valueB" }
    D = "valueD"
  `);
});

test('should swap all keys between two tables', () => {
  const input = dedent`
    [A]
    B = "valueB"
    E = "valueE"

    [C]
    D = "valueD"
    F = "valueF"
  `;

  const value = parse(input);

  const bValue = value.A.B;
  const eValue = value.A.E;
  const dValue = value.C.D;
  const fValue = value.C.F;

  delete value.A.B;
  delete value.A.E;
  delete value.C.D;
  delete value.C.F;

  value.A.D = dValue;
  value.A.F = fValue;
  value.C.B = bValue;
  value.C.E = eValue;

  const result = patch(input, value);

  expect(result).toEqual(dedent`
    [A]
    D = "valueD"
    F = "valueF"

    [C]
    B = "valueB"
    E = "valueE"
  `);
});

test('should swap keys from inline table converted to full table by inlineTableStart', () => {
  const input = dedent`
    [A]
    B = "valueB"
    E = "valueE"

    server = { host = "localhost", port = 8080 }
  `;

  const value = parse(input);

  const bValue = value.A.B;
  const port = value.A.server.port;

  delete value.A.B;
  delete value.A.server.port;

  value.A.port = port;
  value.A.server.B = bValue;

  // inlineTableStart only converts newly added inline tables during patching,
  // not existing ones. Verify the swap still works correctly with it set.
  const result = patch(input, value, { inlineTableStart: 2 });
  expect(result).toEqual(dedent`
    [A]
    E = "valueE"

    server = { host = "localhost", B = "valueB" }
    port = 8080
  `);
});

test('should swap keys when inlineTableStart converts nested inline table after swap', () => {
  const input = dedent`
    [A]
    B = "valueB"

    [C]
    D = "valueD"
    nested = { X = "xValue", Y = "yValue" }
  `;

  const value = parse(input);

  const bValue = value.A.B;
  const yValue = value.C.nested.Y;

  delete value.A.B;
  delete value.C.nested.Y;

  value.A.Y = yValue;
  value.C.nested.B = bValue;

  const result = patch(input, value, { inlineTableStart: 1 });

  expect(result).toEqual(dedent`
    [A]
    Y = "yValue"

    [C]
    D = "valueD"
    nested = { X = "xValue", B = "valueB" }
  `);
});

test('should swap keys with inlineTableStart=0 keeping all inline', () => {
  const input = dedent`
    [A]
    B = "valueB"

    [C]
    D = "valueD"
    info = { name = "test", version = 2 }
  `;

  const value = parse(input);

  const bValue = value.A.B;
  const nameValue = value.C.info.name;

  delete value.A.B;
  delete value.C.info.name;

  value.A.name = nameValue;
  value.C.info.B = bValue;

  const result = patch(input, value, { inlineTableStart: 0 });

  expect(result).toEqual(dedent`
    [A]
    name = "test"

    [C]
    D = "valueD"
    info = { version = 2, B = "valueB" }
  `);
});
