import { describe, test, expect, vi } from 'vitest';

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
