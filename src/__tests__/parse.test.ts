import { parse } from '../';

test('it should parse example from readme', () => {
  const parsed = parse(`
# This is a TOML document.

title = "TOML Example"

[owner]
name = "Tim"`);

  expect(parsed).toEqual({
    title: 'TOML Example',
    owner: {
      name: 'Tim'
    }
  });
});

test('it should parse special float values including negative zero', () => {
  const parsed = parse(`
# Special float values
positive_infinity = inf
negative_infinity = -inf
not_a_number = nan
zero = 0
negative_zero = -0.0
regular_float = 3.14
`);

  expect(parsed).toEqual({
    positive_infinity: Infinity,
    negative_infinity: -Infinity,
    not_a_number: NaN,
    zero: 0,
    negative_zero: -0,
    regular_float: 3.14
  });

  // Verify the distinction between 0 and -0
  expect(Object.is(parsed.zero, 0)).toBe(true);
  expect(Object.is(parsed.zero, -0)).toBe(false);
  expect(Object.is(parsed.negative_zero, -0)).toBe(true);
  expect(Object.is(parsed.negative_zero, 0)).toBe(false);

  // Verify NaN
  expect(Number.isNaN(parsed.not_a_number)).toBe(true);
});

test('it should parse special float values in arrays and nested structures', () => {
  const parsed = parse(`
# Arrays with special float values
mixed_numbers = [1.5, inf, -inf, nan, -0.0, 42]

[math_constants]
infinity = inf
negative_infinity = -inf

[calculations]
result = nan
negative_zero = -0.0
other_negative_zero = -0 # This form should not resolve to -0 in JS Object format
`);

  expect(parsed).toEqual({
    mixed_numbers: [1.5, Infinity, -Infinity, NaN, -0, 42],
    math_constants: {
      infinity: Infinity,
      negative_infinity: -Infinity
    },
    calculations: {
      result: NaN,
      negative_zero: -0,
      other_negative_zero: 0
    }
  });

  // Verify array values
  expect(parsed.mixed_numbers[1]).toBe(Infinity);
  expect(parsed.mixed_numbers[2]).toBe(-Infinity);
  expect(Number.isNaN(parsed.mixed_numbers[3])).toBe(true);
  expect(Object.is(parsed.mixed_numbers[4], -0)).toBe(true);

  // Verify nested object values
  expect(parsed.math_constants.infinity).toBe(Infinity);
  expect(parsed.math_constants.negative_infinity).toBe(-Infinity);
  expect(Number.isNaN(parsed.calculations.result)).toBe(true);
  expect(Object.is(parsed.calculations.negative_zero, -0)).toBe(true);
  expect(Object.is(parsed.calculations.other_negative_zero, 0)).toBe(true);
  
});

test('it should parse MLBS with \r\n newlines and preserve them in the value', () => {
  const parsed = parse(
    'a = 1' + '\r\n' +
    'text = """' + '\r\n' +
    'Hello world ' + '\r\n' +
    'This is a test. ' + '\r\n' +
    'Goodbye world."""'
  );

  expect(parsed).toEqual({
    a: 1,
    text: 'Hello world \r\nThis is a test. \r\nGoodbye world.'
  });

});

test('it should parse MLBS with \r\n newlines and preserve them in the value - even with LF at TOML file level', () => {
  const parsed = parse(
    'a = 1' + '\n' +
    'text = """' + '\r\n' +
    'Hello world ' + '\r\n' +
    'This is a test. ' + '\r\n' +
    'Goodbye world."""' + '\n'
  );

  expect(parsed).toEqual({
    a: 1,
    text: 'Hello world \r\nThis is a test. \r\nGoodbye world.'
  });

});

test('it should parse MLBS with mixed newlines and preserve them in the value', () => {
  const parsed = parse(
    'a = 1' + '\n' +
    'text = """' + '\r\n' +
    'Hello world ' + '\n' +
    'This is a test. ' + '\r\n' +
    'Goodbye world."""' + '\n'
  );

  expect(parsed).toEqual({
    a: 1,
    text: 'Hello world \nThis is a test. \r\nGoodbye world.'
  });

});

test('it should parse unsafe integers as bigint by default', () => {
  const parsed = parse(`
big_pos = 9223372036854775807
big_neg = -9223372036854775808
`);

  expect(typeof parsed.big_pos).toBe('bigint');
  expect(typeof parsed.big_neg).toBe('bigint');
  expect(parsed.big_pos).toBe(BigInt('9223372036854775807'));
  expect(parsed.big_neg).toBe(BigInt('-9223372036854775808'));
});

test('it should keep safe integers as number by default', () => {
  const parsed = parse(`
small = 42
safe_max = 9007199254740991
safe_min = -9007199254740991
`);

  expect(typeof parsed.small).toBe('number');
  expect(typeof parsed.safe_max).toBe('number');
  expect(typeof parsed.safe_min).toBe('number');
  expect(parsed.small).toBe(42);
  expect(parsed.safe_max).toBe(Number.MAX_SAFE_INTEGER);
  expect(parsed.safe_min).toBe(Number.MIN_SAFE_INTEGER);
});

test('it should accept string input that starts with UTF-8 BOM', () => {
  const parsed = parse('\uFEFFa=1\n');
  expect(parsed).toEqual({ a: 1 });
});
