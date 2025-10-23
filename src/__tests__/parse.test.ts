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
`);

  expect(parsed).toEqual({
    mixed_numbers: [1.5, Infinity, -Infinity, NaN, -0, 42],
    math_constants: {
      infinity: Infinity,
      negative_infinity: -Infinity
    },
    calculations: {
      result: NaN,
      negative_zero: -0
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
});
