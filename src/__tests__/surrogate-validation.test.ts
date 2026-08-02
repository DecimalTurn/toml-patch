import { describe, test, expect, vi } from 'vitest';
import { parse, stringify } from '../';
import patch from '../patch';

// A backslash built at runtime, so the escape sequences under test are unambiguous in source.
const BS = String.fromCharCode(92);
const GRIN = '\u{1F600}'; // U+1F600, stored as the surrogate pair D83D DE00

describe('round-trip of characters that need surrogate pairs', () => {
  // An astral character is a *pair* of surrogates in a UTF-16 JS string, which is well-formed
  // and must keep working — the lone-surrogate rejection must not catch these.

  test('should round-trip a raw astral character through parse and stringify', () => {
    const doc = `s = "${GRIN}"\n`;
    expect(parse(doc)).toEqual({ s: GRIN });
    expect(stringify(parse(doc))).toBe(doc);
    expect(patch(doc, parse(doc))).toBe(doc);
  });

  test('should preserve an 8-digit escape for an astral character when patching', () => {
    // escape-preference keeps the document's existing spelling rather than expanding it to the
    // raw character, so an identity patch is byte-identical.
    const doc = `s = "${BS}U0001F600"\n`;
    expect(parse(doc)).toEqual({ s: GRIN });
    expect(patch(doc, parse(doc))).toBe(doc);
    expect(patch(doc, { s: GRIN })).toBe(doc);
  });

  test('should keep the escaped spelling when the surrounding value changes', () => {
    const doc = `s = "${BS}U0001F600"\n`;
    expect(patch(doc, { s: `x${GRIN}` })).toBe(`s = "x${BS}U0001F600"\n`);
  });

  test('should emit the raw character from stringify, which has no source spelling to keep', () => {
    // stringify gets no existing raw text to learn a preference from, so the shortest valid
    // form wins. Contrast with patch above.
    expect(stringify({ s: GRIN })).toBe(`s = "${GRIN}"\n`);
  });
});

describe('a lone surrogate cannot round-trip in any spelling', () => {
  const LONE = '\ud800';

  // There is deliberately no "keep it escaped" behaviour here. TOML forbids surrogate escapes
  // outright (see toml-test invalid/string/bad-uni-esc-06.toml, which is `\uD801`), so emitting
  // s = "\uD800" would produce a document this library — and any conforming parser — rejects.
  // A lone surrogate also has no UTF-8 encoding, so the raw form is not valid TOML either.
  // With neither spelling available, the value simply cannot be represented.

  test('should reject the escaped spelling on the way in', () => {
    expect(() => parse(`s = "${BS}uD800"`)).toThrow(/surrogates not allowed/);
    expect(() => parse(`s = "${BS}U0000D800"`)).toThrow(/surrogates not allowed/);
  });

  test('should refuse to emit a value holding a lone surrogate', () => {
    expect(() => stringify({ s: LONE })).toThrow(/lone surrogate/);
    expect(() => patch('s = "ok"\n', { s: LONE })).toThrow(/lone surrogate/);
  });

  test('should refuse a key holding a lone surrogate, with a printable message', () => {
    // The message names the offending key, so it must escape it rather than interpolate the
    // raw code unit — an unpaired surrogate in the message itself cannot be written to a
    // UTF-8 stream losslessly, which makes the error hard to log.
    let message = '';
    expect(() => {
      try {
        stringify({ [`bad${LONE}key`]: 1 });
      } catch (e: any) {
        message = e.message;
        throw e;
      }
    }).toThrow(/lone surrogate/);

    expect(message).toContain(String.raw`\ud800`);
    expect(message).not.toContain(LONE);
    // Well-formed, so logging or re-encoding it is lossless.
    expect(message.isWellFormed?.() ?? true).toBe(true);
    expect(Buffer.from(message, 'utf8').toString('utf8')).toBe(message);
  });

  test('should not emit an escaped surrogate that it would then reject on re-parse', () => {
    // Guards the tempting "just escape it" fix: whatever we emit must be re-readable.
    let emitted: string | undefined;
    try {
      emitted = stringify({ s: LONE });
    } catch {
      emitted = undefined;
    }
    if (emitted !== undefined) {
      expect(() => parse(emitted!)).not.toThrow();
    }
  });
});

// Simulates Node 16-19, where String.prototype.isWellFormed does not exist, to confirm the
// scan fallback still detects and reports lone surrogates identically.
describe('fallback when isWellFormed is unavailable', () => {
  test('behaves the same without the native method', async () => {
    const original = String.prototype.isWellFormed;
    const results: Record<string, string[]> = {};

    for (const mode of ['native', 'fallback'] as const) {
      if (mode === 'fallback') {
        // @ts-expect-error — deliberately removing to emulate an older runtime
        delete String.prototype.isWellFormed;
      } else if (original) {
        String.prototype.isWellFormed = original;
      }

      vi.resetModules();
      const { assertNoLoneSurrogate } = await import('../utils');

      const observed: string[] = [];
      for (const [label, value] of [
        ['clean ascii', 'hello'],
        ['astral pair', '\u{1F600}'],
        ['lone high at 0', '\ud800'],
        ['lone low at 2', 'ab\udfff'],
        ['lone high after pair', '\u{1F600}\ud800'],
      ] as [string, string][]) {
        try {
          assertNoLoneSurrogate(value, 'String value');
          observed.push(`${label}: ok`);
        } catch (e: any) {
          observed.push(`${label}: ${e.message.split('.')[0]}`);
        }
      }
      results[mode] = observed;
    }

    if (original) String.prototype.isWellFormed = original;

    // Both modes must agree exactly, including the reported index and code point.
    expect(results.fallback).toEqual(results.native);
    expect(results.native).toEqual([
      'clean ascii: ok',
      'astral pair: ok',
      'lone high at 0: String value contains a lone surrogate (U+D800) at index 0',
      'lone low at 2: String value contains a lone surrogate (U+DFFF) at index 2',
      'lone high after pair: String value contains a lone surrogate (U+D800) at index 2',
    ]);
  });
});
