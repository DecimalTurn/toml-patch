import { createHash } from 'node:crypto';
import { randomToml } from './randomizer';
import { spaceDottedKeySeparators } from './fuzz-patch2';

/*
 * These tests lock the generated TOML that each fuzzer feeds into patch(). They do not
 * lock a patched result, because that also depends on the mutation sequence and format.
 *
 * If a third fuzzer is added, import its source transformation, apply it to the same seed,
 * and add a third test with its expected length and SHA-256 hash. Only update an existing
 * hash after reviewing the changed TOML and deciding that the change is intentional.
 */
const seed = 19506;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('fuzz seed generated TOML stability', () => {
  test('keeps the original generated TOML stable', () => {
    const toml = randomToml({ seed }).toml;

    expect(toml.length).toBe(939);
    expect(sha256(toml)).toBe(
      '2291447545c16b0f56df026db6e9237ddb4ace68d05452b07f388371057076a8'
    );
  });

  test('keeps the fuzz2 generated TOML with spaced dotted keys stable', () => {
    const toml = spaceDottedKeySeparators(randomToml({ seed }).toml);

    expect(toml.length).toBe(991);
    expect((toml.match(/ \. /g) ?? []).length).toBe(26);
    expect(sha256(toml)).toBe(
      '8058e836237743cac1c3890b1d906456b86fa811bd8f53f4f0d3b1f6f7ea557c'
    );
  });
});
