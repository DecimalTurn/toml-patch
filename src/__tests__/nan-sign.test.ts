import { parse, patch, stringify } from '../';
import { isNegativeNan, stableStringify } from '../utils';

/**
 * A negative NaN is only distinguishable by its IEEE 754 sign bit, which JS
 * exposes through a typed array. Reading it with `new Float64Array([value])` is
 * not reliable: the engine occasionally canonicalises the NaN payload on the
 * way in, so `-nan` reads as positive roughly one call in twenty thousand. The
 * library writes the value through a shared DataView instead, and these loops
 * are what pins that. Before the fix, a few iterations out of a few thousand
 * came back as `nan`.
 */
const NEGATIVE_NAN = (() => {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, 0x00000000, true);
  view.setUint32(4, 0xfff80000, true);
  return new Float64Array(buffer)[0];
})();

test('isNegativeNan recognises the sign bit of a NaN', () => {
  expect(isNegativeNan(NEGATIVE_NAN)).toBe(true);
  expect(isNegativeNan(NaN)).toBe(false);
  expect(isNegativeNan(0)).toBe(false);
  expect(isNegativeNan(-0)).toBe(false);
  expect(isNegativeNan(Infinity)).toBe(false);
  expect(isNegativeNan(-Infinity)).toBe(false);
});

test('the stable form keeps the sign of a NaN apart', () => {
  expect(stableStringify(NEGATIVE_NAN)).not.toBe(stableStringify(NaN));
});

/**
 * The ordinary way a negative NaN reaches the library: TOML spells NaN with an
 * optional sign, so a document can legitimately say `-nan`, and that spelling
 * has to survive being read and written back.
 *
 * This is the same promise the library already makes for `1.00`, `0x1F` or a
 * literal string: a field that was not edited keeps the spelling it had, and a
 * value handed to another document arrives as it was written. Nothing here
 * manipulates bytes — the sign is carried by the parsed value from start to
 * finish; the loops below are only there to pin the read that carries it.
 */
test('round-trips a negative NaN that came from a document', () => {
  const document = 'temperature = -nan\nretries = 3\n';

  // Editing an unrelated key has to leave the sentinel alone.
  const config = parse(document) as any;
  config.retries = 4;
  expect(stringify(config)).toBe('temperature = -nan\nretries = 4\n');
  expect(isNegativeNan(parse('temperature = -nan\n').temperature)).toBe(true);

  // Handing the parsed value to another document keeps the spelling too.
  const next = parse(document) as any;
  next.retries = 1;
  expect(patch('temperature = 0.0\nretries = 1\n', next))
    .toBe('temperature = -nan\nretries = 1\n');
});

test('keeps writing a negative NaN as -nan', () => {
  const iterations = 4000;
  let stringifyMisses = 0;
  let patchMisses = 0;

  for (let i = 0; i < iterations; i++) {
    if (stringify({ a: NEGATIVE_NAN }) !== 'a = -nan\n') stringifyMisses++;

    if (i < 1000) {
      const source = 'a = nan\n';
      const value = parse(source) as any;
      value.a = NEGATIVE_NAN;
      if (patch(source, value) !== 'a = -nan\n') patchMisses++;
    }
  }

  expect({ stringifyMisses, patchMisses }).toEqual({ stringifyMisses: 0, patchMisses: 0 });
});
