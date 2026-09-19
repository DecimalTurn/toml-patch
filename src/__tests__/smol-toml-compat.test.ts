import dedent from 'dedent';
import { parse as smolParse, stringify as smolStringify, TomlDate } from 'smol-toml';
import { parse, stringify } from '../';
import patch from '../patch';
import { patch as patchLite } from '../patch-lite-entry';
import { PatchLiteError, PatchLiteErrorCode } from '../diff-lite';

function expectLiteError(fn: () => unknown, code: PatchLiteErrorCode): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(PatchLiteError);
    expect((err as PatchLiteError).code).toBe(code);
    return;
  }
  throw new Error('Expected PatchLiteError to be thrown');
}

/**
 * A document exercising every smol-toml date kind. `offsetMinus` uses a
 * two-digit fraction on purpose: smol-toml re-renders it as `.250`, which the
 * round-trip tests must treat as the same value.
 */
const allKindsDoc = dedent`
  localDate = 1979-05-27
  localTime = 07:32:00
  localDt = 1979-05-27T07:32:00
  offsetZ = 1979-05-27T07:32:00Z
  offsetPlus = 1979-05-27T07:32:00+07:00
  offsetMinus = 1979-05-27T07:32:00.25-07:00
` + '\n';

/** The canonical form toml-patch emits for `allKindsDoc`. */
const allKindsCanonical = dedent`
  localDate = 1979-05-27
  localTime = 07:32:00
  localDt = 1979-05-27T07:32:00
  offsetZ = 1979-05-27T07:32:00Z
  offsetPlus = 1979-05-27T07:32:00+07:00
  offsetMinus = 1979-05-27T07:32:00.250-07:00
` + '\n';

/**
 * Maps every Date value in an object to its TOML rendering. Comparing these
 * maps verifies that dates keep both their kind and their instant across a
 * round-trip, without depending on how many fractional digits were written.
 */
function smolDateIso(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value instanceof Date) out[key] = value.toISOString();
  }
  return out;
}

describe('patch with a smol-toml parsed object', () => {
  test('preserves smol-toml dates byte-for-byte when only a non-date value changes', () => {
    const existing = dedent`
      localDate = 1979-05-27
      localTime = 07:32:00
      localDt = 1979-05-27T07:32:00
      offset = 1979-05-27T07:32:00-07:00
      version = "1.0.0"
    ` + '\n';

    const updated = smolParse(existing);
    updated.version = '1.0.1';

    expect(patch(existing, updated)).toEqual(dedent`
      localDate = 1979-05-27
      localTime = 07:32:00
      localDt = 1979-05-27T07:32:00
      offset = 1979-05-27T07:32:00-07:00
      version = "1.0.1"
    ` + '\n');
  });

  test('edits a smol-toml time value', () => {
    const existing = dedent`
      localTime = 07:32:00
      version = "1.0.0"
    ` + '\n';

    const updated = smolParse(existing);
    updated.localTime = new TomlDate('07:32:00.5');

    expect(patch(existing, updated)).toEqual(dedent`
      localTime = 07:32:00.500
      version = "1.0.0"
    ` + '\n');
  });

  test('adds a smol-toml date without the smol zero-fraction suffix', () => {
    const existing = 'version = "1.0.0"\n';

    const updated = smolParse(existing);
    updated.added = new TomlDate('2024-01-15T10:30:00Z');

    expect(patch(existing, updated)).toEqual('version = "1.0.0"\nadded = 2024-01-15T10:30:00Z\n');
  });

  test('stringify renders smol-toml dates in the canonical form', () => {
    const obj = smolParse('localTime = 07:32:00\nlocalDt = 1979-05-27T07:32:00\noffset = 1979-05-27T07:32:00-07:00\n');

    // smol-toml's own stringify keeps the `.000` zero-fraction suffix.
    expect(smolStringify(obj)).toEqual(
      'localTime = 07:32:00.000\nlocalDt = 1979-05-27T07:32:00.000\noffset = 1979-05-27T07:32:00.000-07:00\n'
    );

    // toml-patch emits the same dates without the suffix.
    expect(stringify(obj)).toEqual(
      'localTime = 07:32:00\nlocalDt = 1979-05-27T07:32:00\noffset = 1979-05-27T07:32:00-07:00\n'
    );
  });

  test('edits a smol-toml local date value', () => {
    const existing = dedent`
      localDate = 1979-05-27
      version = "1.0.0"
    ` + '\n';

    const updated = smolParse(existing);
    updated.localDate = new TomlDate('1984-02-14');

    expect(patch(existing, updated)).toEqual(dedent`
      localDate = 1984-02-14
      version = "1.0.0"
    ` + '\n');
  });

  test('edits a smol-toml local datetime value', () => {
    const existing = dedent`
      localDt = 1979-05-27T07:32:00
      version = "1.0.0"
    ` + '\n';

    const updated = smolParse(existing);
    updated.localDt = new TomlDate('1984-02-14T09:15:30');

    expect(patch(existing, updated)).toEqual(dedent`
      localDt = 1984-02-14T09:15:30
      version = "1.0.0"
    ` + '\n');
  });

  test('edits a smol-toml offset datetime value', () => {
    const existing = dedent`
      offset = 1979-05-27T07:32:00Z
      version = "1.0.0"
    ` + '\n';

    const updated = smolParse(existing);
    updated.offset = new TomlDate('1984-02-14T09:15:30Z');

    expect(patch(existing, updated)).toEqual(dedent`
      offset = 1984-02-14T09:15:30Z
      version = "1.0.0"
    ` + '\n');
  });

  test('keeps the source precision when editing an offset datetime with a fraction', () => {
    const existing = dedent`
      offset = 1979-05-27T07:32:00.25-07:00
      version = "1.0.0"
    ` + '\n';

    const updated = smolParse(existing);
    updated.offset = new TomlDate('1984-02-14T09:15:30.5-07:00');

    // The source wrote two fractional digits, so the edit keeps two digits.
    expect(patch(existing, updated)).toEqual(dedent`
      offset = 1984-02-14T09:15:30.50-07:00
      version = "1.0.0"
    ` + '\n');
  });

  test('adds a smol-toml date of every kind in canonical form', () => {
    const existing = 'version = "1.0.0"\n';

    const updated = smolParse(existing);
    updated.localDate = new TomlDate('1979-05-27');
    updated.localTime = new TomlDate('07:32:00');
    updated.localDt = new TomlDate('1979-05-27T07:32:00');
    updated.offsetZ = new TomlDate('1979-05-27T07:32:00Z');
    updated.offsetPlus = new TomlDate('1979-05-27T07:32:00+07:00');
    updated.offsetMinus = new TomlDate('1979-05-27T07:32:00.25-07:00');

    expect(patch(existing, updated)).toEqual(dedent`
      version = "1.0.0"
      localDate = 1979-05-27
      localTime = 07:32:00
      localDt = 1979-05-27T07:32:00
      offsetZ = 1979-05-27T07:32:00Z
      offsetPlus = 1979-05-27T07:32:00+07:00
      offsetMinus = 1979-05-27T07:32:00.250-07:00
    ` + '\n');
  });
});

describe('patch-lite with a smol-toml parsed object', () => {
  test('treats unchanged smol-toml dates as no-op edits', () => {
    const existing = dedent`
      localDate = 1979-05-27
      localTime = 07:32:00
      localDt = 1979-05-27T07:32:00
      offset = 1979-05-27T07:32:00-07:00
      version = "1.0.0"
    ` + '\n';

    const updated = smolParse(existing);
    updated.version = '1.0.1';

    expect(patchLite(existing, updated)).toEqual(dedent`
      localDate = 1979-05-27
      localTime = 07:32:00
      localDt = 1979-05-27T07:32:00
      offset = 1979-05-27T07:32:00-07:00
      version = "1.0.1"
    ` + '\n');
  });

  test('rejects an edited smol-toml date', () => {
    const existing = dedent`
      localTime = 07:32:00
      version = "1.0.0"
    ` + '\n';

    const updated = smolParse(existing);
    updated.localTime = new TomlDate('07:32:00.5');

    expectLiteError(() => patchLite(existing, updated), 'UnsupportedValue');
  });

  test('rejects an edited smol-toml date of every kind', () => {
    const edits: Array<[string, string]> = [
      ['localDate', '1984-02-14'],
      ['localTime', '09:15:30'],
      ['localDt', '1984-02-14T09:15:30'],
      ['offsetZ', '1984-02-14T09:15:30Z'],
      ['offsetPlus', '1984-02-14T09:15:30+07:00'],
      ['offsetMinus', '1984-02-14T09:15:30.5-07:00']
    ];

    for (const [key, value] of edits) {
      const updated = smolParse(allKindsDoc);
      (updated as Record<string, unknown>)[key] = new TomlDate(value);
      expectLiteError(() => patchLite(allKindsDoc, updated), 'UnsupportedValue');
    }
  });
});

describe('round-trip with a smol-toml parsed object', () => {
  test('patch returns the document unchanged for an unedited smol-toml object', () => {
    expect(patch(allKindsDoc, smolParse(allKindsDoc))).toBe(allKindsDoc);
  });

  test('patch-lite returns the document unchanged for an unedited smol-toml object', () => {
    expect(patchLite(allKindsDoc, smolParse(allKindsDoc))).toBe(allKindsDoc);
  });

  test('stringify → parse → stringify is stable for a smol-toml object', () => {
    const canonical = stringify(smolParse(allKindsDoc));
    expect(canonical).toBe(allKindsCanonical);
    expect(stringify(parse(canonical))).toBe(allKindsCanonical);
  });

  test('smol-toml dates keep their kind and instant after a stringify round-trip', () => {
    const before = smolParse(allKindsDoc);
    const after = smolParse(stringify(before));
    expect(smolDateIso(after)).toEqual(smolDateIso(before));
  });

  test('an edited smol-toml object round-trips through patch and smol re-parse', () => {
    const doc = dedent`
      localDate = 1979-05-27
      localTime = 07:32:00
      offsetZ = 1979-05-27T07:32:00Z
      version = "1.0.0"
    ` + '\n';

    const updated = smolParse(doc);
    updated.version = '1.0.1';

    const reparsed = smolParse(patch(doc, updated));
    expect(reparsed.version).toBe('1.0.1');
    expect(smolDateIso(reparsed)).toEqual(smolDateIso(updated));
  });
});
