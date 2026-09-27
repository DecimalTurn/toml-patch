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

    // The source wrote no fraction, so the new millisecond is written in its
    // minimal form, exactly as a LocalDateTime edit with the same value does.
    expect(patch(existing, updated)).toEqual(dedent`
      localTime = 07:32:00.5
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

  test('edits a smol-toml date of every kind', () => {
    const edits: Array<[string, string, string]> = [
      ['localDate = 1979-05-27\n', '1984-02-14', 'localDate = 1984-02-14\n'],
      ['localTime = 07:32:00\n', '09:15:30', 'localTime = 09:15:30\n'],
      ['localDt = 1979-05-27T07:32:00\n', '1984-02-14T09:15:30', 'localDt = 1984-02-14T09:15:30\n'],
      ['offsetZ = 1979-05-27T07:32:00Z\n', '1984-02-14T09:15:30Z', 'offsetZ = 1984-02-14T09:15:30Z\n'],
      [
        'offsetPlus = 1979-05-27T07:32:00+07:00\n',
        '1984-02-14T09:15:30+07:00',
        'offsetPlus = 1984-02-14T09:15:30+07:00\n'
      ],
      [
        'offsetMinus = 1979-05-27T07:32:00.25-07:00\n',
        '1984-02-14T09:15:30.5-07:00',
        'offsetMinus = 1984-02-14T09:15:30.50-07:00\n'
      ]
    ];

    for (const [doc, newValue, expected] of edits) {
      const updated = smolParse(doc);
      const key = Object.keys(updated)[0];
      (updated as Record<string, unknown>)[key] = new TomlDate(newValue);

      expect(patchLite(doc, updated)).toBe(expected);
    }
  });

  test('rejects changing a smol-toml date to a non-date value', () => {
    const existing = 'localDate = 1979-05-27\n';

    const updated = smolParse(existing);
    (updated as Record<string, unknown>).localDate = 'hello';

    expectLiteError(() => patchLite(existing, updated), 'TypeChange');
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

/**
 * Spellings smol-toml accepts but re-emits differently: sub-millisecond
 * fractions (truncated to milliseconds by `TomlDate`), a space separator
 * (re-emitted with `T`), lowercase `t`/`z`, explicit `+00:00`/`-00:00` offsets
 * and TOML 1.1 `HH:MM` local times (re-emitted with seconds).
 */
const edgeSpellingsDoc = dedent`
  z6 = 1979-05-27T07:32:00.123456Z
  off1 = 1979-05-27T07:32:00.5-07:00
  time6 = 07:32:00.123456
  space = 1979-05-27 07:32:00
  lower = 1979-05-27t07:32:00z
  pluszero = 1979-05-27T07:32:00+00:00
  minuszero = 1979-05-27T07:32:00-00:00
  nano = 1979-05-27T07:32:00.999999999-07:00
  timenosec = 07:32
  version = "1.0.0"
` + '\n';

describe('smol-toml date spellings outside the canonical form', () => {
  test('stringify canonicalises every spelling', () => {
    expect(stringify(smolParse(edgeSpellingsDoc))).toEqual(dedent`
      z6 = 1979-05-27T07:32:00.123Z
      off1 = 1979-05-27T07:32:00.500-07:00
      time6 = 07:32:00.123
      space = 1979-05-27T07:32:00
      lower = 1979-05-27T07:32:00Z
      pluszero = 1979-05-27T07:32:00+00:00
      minuszero = 1979-05-27T07:32:00-00:00
      nano = 1979-05-27T07:32:00.999-07:00
      timenosec = 07:32:00
      version = "1.0.0"
    ` + '\n');
  });

  test('patch returns the document byte-for-byte for an unedited object', () => {
    expect(patch(edgeSpellingsDoc, smolParse(edgeSpellingsDoc))).toBe(edgeSpellingsDoc);
  });

  test('patch-lite returns the document byte-for-byte for an unedited object', () => {
    expect(patchLite(edgeSpellingsDoc, smolParse(edgeSpellingsDoc))).toBe(edgeSpellingsDoc);
  });

  test('an unrelated edit leaves every date row verbatim', () => {
    const updated = smolParse(edgeSpellingsDoc);
    updated.version = '1.0.1';

    expect(patch(edgeSpellingsDoc, updated)).toEqual(
      edgeSpellingsDoc.replace('version = "1.0.0"', 'version = "1.0.1"')
    );
  });

  test('edits keep the source separator, offset style and case', () => {
    const updated = smolParse(edgeSpellingsDoc);
    updated.space = new TomlDate('1984-02-14T09:15:30');
    updated.lower = new TomlDate('1984-02-14T09:15:30Z');
    updated.pluszero = new TomlDate('1984-02-14T09:15:30+00:00');
    updated.minuszero = new TomlDate('1984-02-14T09:15:30-00:00');
    updated.timenosec = new TomlDate('09:15:30');

    expect(patch(edgeSpellingsDoc, updated)).toEqual(dedent`
      z6 = 1979-05-27T07:32:00.123456Z
      off1 = 1979-05-27T07:32:00.5-07:00
      time6 = 07:32:00.123456
      space = 1984-02-14 09:15:30
      lower = 1984-02-14T09:15:30Z
      pluszero = 1984-02-14T09:15:30+00:00
      minuszero = 1984-02-14T09:15:30-00:00
      nano = 1979-05-27T07:32:00.999999999-07:00
      timenosec = 09:15:30
      version = "1.0.0"
    ` + '\n');
  });

  test('patch-lite keeps the source separator and digit count on edit', () => {
    const updated = smolParse(edgeSpellingsDoc);
    updated.space = new TomlDate('1984-02-14T09:15:30');
    updated.off1 = new TomlDate('1984-02-14T09:15:30.5-07:00');

    const out = patchLite(edgeSpellingsDoc, updated);
    expect(out.split('\n').filter((line) => /^(space|off1) /.test(line))).toEqual([
      'off1 = 1984-02-14T09:15:30.5-07:00',
      'space = 1984-02-14 09:15:30'
    ]);
  });
});

/**
 * smol-toml's other date mode: `useLegacyDate: false` returns Temporal objects
 * instead of `TomlDate`. `patch()` auto-detects them; `patch-lite` documents
 * Temporal as unsupported and must reject it rather than corrupt the document.
 */
const temporalDoc = dedent`
  date = 1979-05-27
  time = 07:32:00.123456
  localDt = 1979-05-27T07:32:00.123456
  offsetZ = 1979-05-27T07:32:00.123456789Z
  offset = 1979-05-27T07:32:00.5-07:00
  version = "1.0.0"
` + '\n';

const smolTemporal = () => smolParse(temporalDoc, { useLegacyDate: false });

describe('smol-toml parsed with useLegacyDate: false (Temporal objects)', () => {
  test('smol emits the documented Temporal types', () => {
    const obj = smolTemporal();
    expect(obj.date).toBeInstanceOf(Temporal.PlainDate);
    expect(obj.time).toBeInstanceOf(Temporal.PlainTime);
    expect(obj.localDt).toBeInstanceOf(Temporal.PlainDateTime);
    expect(obj.offsetZ).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(obj.offset).toBeInstanceOf(Temporal.ZonedDateTime);
  });

  test('patch returns the document byte-for-byte for an unedited object', () => {
    expect(patch(temporalDoc, smolTemporal())).toBe(temporalDoc);
  });

  test('an unrelated edit leaves every date row verbatim', () => {
    const updated = smolTemporal();
    updated.version = '1.0.1';

    expect(patch(temporalDoc, updated)).toEqual(
      temporalDoc.replace('version = "1.0.0"', 'version = "1.0.1"')
    );
  });

  test('stringify keeps the Temporal sub-millisecond precision', () => {
    expect(stringify(smolTemporal())).toEqual(dedent`
      date = 1979-05-27
      time = 07:32:00.123456
      localDt = 1979-05-27T07:32:00.123456
      offsetZ = 1979-05-27T07:32:00.123456789Z
      offset = 1979-05-27T07:32:00.5-07:00
      version = "1.0.0"
    ` + '\n');
  });

  test('edits each Temporal kind', () => {
    const plainDate = smolTemporal();
    plainDate.date = Temporal.PlainDate.from('1984-02-14');
    expect(patch(temporalDoc, plainDate)).toEqual(
      temporalDoc.replace('date = 1979-05-27', 'date = 1984-02-14')
    );

    const plainTime = smolTemporal();
    plainTime.time = Temporal.PlainTime.from('09:15:30');
    expect(patch(temporalDoc, plainTime)).toEqual(
      temporalDoc.replace('time = 07:32:00.123456', 'time = 09:15:30')
    );

    const plainDateTime = smolTemporal();
    plainDateTime.localDt = Temporal.PlainDateTime.from('1984-02-14T09:15:30');
    expect(patch(temporalDoc, plainDateTime)).toEqual(
      temporalDoc.replace('localDt = 1979-05-27T07:32:00.123456', 'localDt = 1984-02-14T09:15:30')
    );

    const zoned = smolTemporal();
    zoned.offsetZ = Temporal.ZonedDateTime.from('1984-02-14T09:15:30.5Z[+00:00]');
    expect(patch(temporalDoc, zoned)).toEqual(
      temporalDoc.replace('offsetZ = 1979-05-27T07:32:00.123456789Z', 'offsetZ = 1984-02-14T09:15:30.5Z')
    );
  });

  test('patch-lite rejects Temporal values as documented', () => {
    const updated = smolTemporal();
    updated.version = '1.0.1';

    expectLiteError(() => patchLite(temporalDoc, updated), 'TypeChange');
  });
});
