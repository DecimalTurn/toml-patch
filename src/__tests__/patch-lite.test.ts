import dedent from 'dedent';
import { parse } from '../';
import { LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from '../parse-toml';
import { patch } from '../patch-lite-entry';
import { PatchLiteError, PatchLiteErrorCode } from '../diff-lite';

function expectPatchError(fn: () => unknown, code: PatchLiteErrorCode): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(PatchLiteError);
    expect((err as PatchLiteError).code).toBe(code);
    return;
  }
  throw new Error('Expected PatchLiteError to be thrown');
}

describe('edits', () => {
  test('edits a top-level string value', () => {
    const existing = dedent`
      title = "TOML example"
    `;

    const updated = parse(existing);
    updated.title = 'TOML patched';

    expect(patch(existing, updated)).toBe(dedent`
      title = "TOML patched"
    `);
  });

  test('edits a version-like string value', () => {
    const existing = 'version = "1.0.0"\n';

    expect(patch(existing, { version: '1.0.1' })).toBe('version = "1.0.1"\n');
  });

  test('edits a number value', () => {
    const existing = 'port = 8080\n';

    expect(patch(existing, { port: 9090 })).toBe('port = 9090\n');
  });

  test('edits a boolean value', () => {
    const existing = 'enabled = true\n';

    expect(patch(existing, { enabled: false })).toBe('enabled = false\n');
  });

  test('edits a bigint value', () => {
    const existing = 'big = 9223372036854775808\n';

    const updated = parse(existing);
    expect(typeof updated.big).toBe('bigint');
    updated.big = 9223372036854775809n;

    expect(patch(existing, updated)).toBe('big = 9223372036854775809\n');
  });

  test('edits a nested table value', () => {
    const existing = dedent`
      [database]
      enabled = true
      port = 5432
    `;

    const updated = parse(existing);
    updated.database.enabled = false;
    updated.database.port = 5433;

    expect(patch(existing, updated)).toBe(dedent`
      [database]
      enabled = false
      port = 5433
    `);
  });

  test('edits a dotted key value', () => {
    const existing = dedent`
      owner.name = "Bob"
      owner.age = 42
    `;

    expect(patch(existing, { owner: { name: 'Tim', age: 42 } })).toBe(dedent`
      owner.name = "Tim"
      owner.age = 42
    `);
  });

  test('edits a value inside an inline table', () => {
    const existing = 'point = { x = 1, y = 2 }\n';

    expect(patch(existing, { point: { x: 3, y: 2 } })).toBe('point = { x = 3, y = 2 }\n');
  });

  test('edits an existing array element', () => {
    const existing = dedent`
      ports = [8000, 8001, 8002]
    `;

    const updated = parse(existing);
    updated.ports[1] = 9000;

    expect(patch(existing, updated)).toBe(dedent`
      ports = [8000, 9000, 8002]
    `);
  });

  test('edits a value inside an array of tables', () => {
    const existing = dedent`
      [[product]]
      name = "Hammer"
      sku = 738594937

      [[product]]
      name = "Nail"
      sku = 284758393
    `;

    const updated = parse(existing);
    updated.product[0].sku = 999;

    expect(patch(existing, updated)).toBe(dedent`
      [[product]]
      name = "Hammer"
      sku = 999

      [[product]]
      name = "Nail"
      sku = 284758393
    `);
  });

  test('applies multiple edits in one call', () => {
    const existing = dedent`
      title = "Before"
      count = 1
      enabled = false

      [server]
      host = "localhost"
      port = 8080
    `;

    const updated = parse(existing);
    updated.title = 'After';
    updated.count = 2;
    updated.enabled = true;
    updated.server.host = 'example.com';
    updated.server.port = 9090;

    expect(patch(existing, updated)).toBe(dedent`
      title = "After"
      count = 2
      enabled = true

      [server]
      host = "example.com"
      port = 9090
    `);
  });

  test('preserves untouched multiline content', () => {
    const existing = dedent`
      description = """
      Line one
      Line two
      """
      name = "Before"
    `;

    const updated = parse(existing);
    updated.name = 'After';

    expect(patch(existing, updated)).toBe(dedent`
      description = """
      Line one
      Line two
      """
      name = "After"
    `);
  });

  test('preserves inline comments and surrounding whitespace', () => {
    const existing = 'name    =    "Alice"    # primary user\n';

    expect(patch(existing, { name: 'Bob' })).toBe('name    =    "Bob"    # primary user\n');
  });

  test('preserves CRLF line endings', () => {
    const existing = 'name = "Alice"\r\nage = 30\r\n';

    expect(patch(existing, { name: 'Bob', age: 30 })).toBe('name = "Bob"\r\nage = 30\r\n');
  });

  test('preserves a leading BOM', () => {
    const existing = '\uFEFFname = "Alice"\n';

    expect(patch(existing, { name: 'Bob' })).toBe('\uFEFFname = "Bob"\n');
  });

  test('preserves float type when replacing a float value', () => {
    const existing = 'ratio = 1.0\n';

    expect(patch(existing, { ratio: 2 })).toBe('ratio = 2.0\n');
  });

  test('keeps a fractional float as a float when the new value is a whole number', () => {
    const existing = 'a = 1.5\n';
    const updated = { a: 2 };
    const once = patch(existing, updated);

    expect(once).toBe('a = 2.0\n');
    expect(parse(once)).toEqual(updated);
  });

  test('preserves exponent notation when replacing an exponent float', () => {
    const existing = 'a = 1.0e10\n';
    const updated = { a: 1e11 };
    const once = patch(existing, updated);

    expect(once).toBe('a = 1.0e11\n');
    expect(parse(once)).toEqual(updated);
  });

  test('drops an insignificant fraction when an exponent float becomes a whole number', () => {
    const existing = 'a = 1.25e10\n';
    const updated = { a: 1e11 };
    const once = patch(existing, updated);

    expect(once).toBe('a = 1e11\n');
    expect(parse(once)).toEqual(updated);
  });

  test('encodes replacement strings with proper escaping', () => {
    const existing = 's = "old"\n';

    expect(patch(existing, { s: 'a"b\\c\nd' })).toBe('s = "a\\"b\\\\c\\nd"\n');
  });

  test('classifies unsafe integer-valued numbers as floats', () => {
    const existing = 'count = 5\n';
    const updated = { count: 1e21 };
    const once = patch(existing, updated);

    expect(once).toBe('count = 1e+21\n');
    expect(parse(once)).toEqual(updated);
  });

  test('preserves negative zero as a float', () => {
    const existing = 'x = 1\n';
    const updated = { x: -0 };
    const once = patch(existing, updated);

    expect(once).toBe('x = -0.0\n');
    expect(parse(once)).toEqual(updated);
  });

  test('returns the original string for a no-op update', () => {
    const existing = dedent`
      title = "TOML example"

      [database]
      enabled = true
    `;

    const updated = parse(existing);

    expect(patch(existing, updated)).toBe(existing);
  });

  test('returns the original string for a no-op update with a BOM', () => {
    const existing = '\uFEFFtitle = "TOML example"\n';

    expect(patch(existing, { title: 'TOML example' })).toBe(existing);
  });

  test('leaves date and time text untouched when other values are edited', () => {
    const existing = dedent`
      released = 1979-05-27 07:32:00
      version = "1.0.0"
    `;

    const updated = parse(existing);
    updated.version = '1.0.1';

    expect(patch(existing, updated)).toBe(dedent`
      released = 1979-05-27 07:32:00
      version = "1.0.1"
    `);
  });

  test('re-applying the same edit is stable', () => {
    const existing = dedent`
      title = "Before"

      [server]
      port = 8080
    `;

    const updated = parse(existing);
    updated.title = 'After';
    updated.server.port = 9090;

    const once = patch(existing, updated);

    expect(patch(once, updated)).toBe(once);
    expect(parse(once)).toEqual(updated);
  });

  test('applying an edit twice in sequence keeps only the last value', () => {
    const existing = 'version = "1.0.0"\n';
    const first = patch(existing, { version: '1.0.1' });

    expect(patch(first, { version: '1.0.2' })).toBe('version = "1.0.2"\n');
  });

  test('accepts the two-argument public signature', () => {
    expect(patch('version = "1.0.0"\n', { version: '1.0.1' })).toBe('version = "1.0.1"\n');
  });
});

describe('date edits', () => {
  test('edits a local date', () => {
    const existing = 'date = 1979-05-27\n';

    const updated = parse(existing);
    updated.date = new LocalDate('1984-02-14');

    expect(patch(existing, updated)).toBe('date = 1984-02-14\n');
  });

  test('edits a local time', () => {
    const existing = 'time = 07:32:00\n';

    const updated = parse(existing);
    updated.time = new LocalTime('09:15:30', '09:15:30');

    expect(patch(existing, updated)).toBe('time = 09:15:30\n');
  });

  test('edits a local datetime', () => {
    const existing = 'dt = 1979-05-27T07:32:00\n';

    const updated = parse(existing);
    updated.dt = new LocalDateTime('1984-02-14T09:15:30', false);

    expect(patch(existing, updated)).toBe('dt = 1984-02-14T09:15:30\n');
  });

  test('edits an offset datetime', () => {
    const existing = 'ts = 1979-05-27T07:32:00Z\n';

    const updated = parse(existing);
    updated.ts = new OffsetDateTime('1984-02-14T09:15:30Z', false);

    expect(patch(existing, updated)).toBe('ts = 1984-02-14T09:15:30Z\n');
  });

  test('keeps the source precision when editing an offset datetime with a fraction', () => {
    const existing = 'ts = 1979-05-27T07:32:00.25-07:00\n';

    const updated = parse(existing);
    updated.ts = new OffsetDateTime('1984-02-14T09:15:30.5-07:00', false);

    expect(patch(existing, updated)).toBe('ts = 1984-02-14T09:15:30.50-07:00\n');
  });

  test('edits a nested date value', () => {
    const existing = 'server = { started = 1979-05-27 }\n';

    const updated = parse(existing);
    updated.server.started = new LocalDate('1984-02-14');

    expect(patch(existing, updated)).toBe('server = { started = 1984-02-14 }\n');
  });
});

describe('rejections', () => {
  test('rejects added keys', () => {
    const existing = dedent`
      a = 1
    `;

    expectPatchError(() => patch(existing, { a: 1, b: 2 }), 'AddedKey');
  });

  test('rejects removed keys', () => {
    const existing = dedent`
      a = 1
      b = 2
    `;

    expectPatchError(() => patch(existing, { a: 1 }), 'RemovedKey');
  });

  test('rejects key renames', () => {
    const existing = dedent`
      a = 1
    `;

    expectPatchError(() => patch(existing, { b: 1 }), 'RemovedKey');
  });

  test('rejects array length changes', () => {
    const existing = dedent`
      ports = [1, 2]
    `;

    expectPatchError(() => patch(existing, { ports: [1, 2, 3] }), 'ArrayLengthChange');
  });

  test('rejects array reordering', () => {
    const existing = dedent`
      ports = [1, 2, 3]
    `;

    expectPatchError(() => patch(existing, { ports: [2, 1, 3] }), 'ArrayReorder');
  });

  test('rejects scalar to container changes', () => {
    const existing = dedent`
      value = 1
    `;

    expectPatchError(() => patch(existing, { value: { nested: 2 } }), 'TypeChange');
  });

  test('rejects container to scalar changes', () => {
    const existing = dedent`
      point = { x = 1, y = 2 }
    `;

    expectPatchError(() => patch(existing, { point: 5 }), 'TypeChange');
  });

  test('rejects edits to paths that do not exist in the source', () => {
    const existing = dedent`
      a = 1
    `;

    expectPatchError(() => patch(existing, { a: { b: 2 } }), 'TypeChange');
  });

  test('rejects unsupported value types', () => {
    const existing = dedent`
      value = "hello"
    `;

    expectPatchError(() => patch(existing, { value: undefined }), 'UnsupportedValue');
  });

  test('rejects changing a date to a non-date value', () => {
    const existing = dedent`
      date = 1979-05-27
    `;

    const updated = parse(existing);
    updated.date = 'hello';

    expectPatchError(() => patch(existing, updated), 'TypeChange');
  });

  test('throws before producing any partial output', () => {
    const existing = dedent`
      a = 1
      b = 2
    `;

    // The added key makes the whole update invalid even though a and b would edit fine.
    expectPatchError(() => patch(existing, { a: 10, b: 20, c: 3 }), 'AddedKey');
  });

  test('rejects every non-Edit change before source mutation', () => {
    const existing = dedent`
      scalar = 1
      list = [1, 2, 3]
      table = { x = 1 }
    `;

    expectPatchError(() => patch(existing, { scalar: 1, list: [1, 2], table: { x: 1 } }), 'ArrayLengthChange');
    expectPatchError(() => patch(existing, { scalar: 1, list: [2, 1, 3], table: { x: 1 } }), 'ArrayReorder');
    expectPatchError(() => patch(existing, { scalar: 1, list: [1, 2, 3], table: { x: 1, y: 2 } }), 'AddedKey');
    expectPatchError(() => patch(existing, { scalar: 1, list: [1, 2, 3], table: 'text' }), 'TypeChange');
  });

  test('rejects the invalid float 1.e06 in the source', () => {
    expect(() => patch('x = 1.e06\n', { x: 5 })).toThrow(/fraction must start with digit/);
  });
});
