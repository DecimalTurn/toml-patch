import dedent from 'dedent';
import { parse as smolParse, stringify as smolStringify, TomlDate } from 'smol-toml';
import { stringify } from '../';
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
});
