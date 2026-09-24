import dedent from 'dedent';
import { parse } from '../';
import patchFull from '../patch';
import { patch as patchLite } from '../patch-lite-entry';
import { LocalDate, LocalDateTime, OffsetDateTime } from '../parse-toml';

/**
 * Tests that must behave identically for both the full `patch()` and the
 * edit-only `patch-lite()`.
 *
 * The `implementations` array below is reused by every `describe.each` block in
 * this file, so each test runs twice — once per implementation. Anything that
 * only one implementation can do (adding/removing/reordering keys, structural
 * type changes, or formatting options that patch-lite does not support) belongs
 * in the implementation-specific files (`patch.test.ts`, `patch-lite.test.ts`)
 * instead.
 *
 * Covered here:
 * - number format preservation (floats, exponent notation, integer radix and
 *   underscore grouping)
 * - string format preservation (basic and literal, single-line and multiline)
 * - mandatory control-character escaping
 * - date/time value edits
 * - bigint and non-finite number handling
 */
const implementations: Array<[string, (src: string, obj: any) => string]> = [
  ['full', patchFull],
  ['lite', patchLite],
];

describe.each(implementations)('Number format preservation (%s patch)', (_label, patch) => {
  test('Preserves uppercase E in exponent notation', () => {
    const src = dedent`
    a = 1.0E10
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = obj.a * 10;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 1.0E11
    ` + '\n');
  });

  test('Preserves hexadecimal notation when editing an integer', () => {
    const src = dedent`
    a = 0xFF
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 256;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 0x100
    ` + '\n');
  });

  test('Preserves octal notation when editing an integer', () => {
    const src = dedent`
    a = 0o777
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 512;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 0o1000
    ` + '\n');
  });

  test('Preserves binary notation when editing an integer', () => {
    const src = dedent`
    a = 0b1010
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 11;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 0b1011
    ` + '\n');
  });

  test('Preserves uppercase hexadecimal digits', () => {
    const src = dedent`
    a = 0xAF
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 176;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 0xB0
    ` + '\n');
  });

  test('Falls back to decimal for a negative value when the original used a radix prefix', () => {
    const src = dedent`
    a = 0x957
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = -2391;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = -2391
    ` + '\n');
  });
});

describe.each(implementations)('String format preservation (%s patch)', (_label, patch) => {
  test('Preserves a single-line literal string when editing a string', () => {
    const src = dedent`
    a = 'hello'
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 'goodbye';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 'goodbye'
    ` + '\n');
  });

  test('Does not escape backslashes in a preserved single-line literal string', () => {
    const src = dedent`
    a = 'C:\Users\Example'
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 'D:\\Data\\Files';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 'D:\Data\Files'
    ` + '\n');
  });

  test('Keeps the literal style when the value contains a double quote', () => {
    const src = dedent`
    a = 'hello'
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 'say "hi"';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 'say "hi"'
    ` + '\n');
  });

  test('Grows a single-line literal to a multiline literal when the value contains an apostrophe', () => {
    const src = dedent`
    a = 'hello'
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = "it's";

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = '''it's'''
    ` + '\n');
  });

  test('Falls back to a basic string when a single-line literal value holds a triple apostrophe', () => {
    const src = dedent`
    a = 'hello'
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = "it's ''' here";

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = "it's ''' here"
    ` + '\n');
  });

  test('Preserves the delimiters of an empty single-line literal string', () => {
    const src = dedent`
    a = ''
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 'filled';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 'filled'
    ` + '\n');
  });

  test('Grows a single-line literal to a multiline literal when the value contains a newline', () => {
    // A single-line literal string cannot hold a newline, so the value has to
    // move up to MLLS rather than being written into `'...'` verbatim.
    const src = "a = 'hello'\n";

    const obj = parse(src) as any;
    obj.a = 'one\ntwo';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe("a = '''one\ntwo'''\n");
  });

  test('Falls back to a basic string when a literal value holds a control character', () => {
    // Literal strings cannot represent DEL, so the value needs escaping. Writing
    // it verbatim would produce TOML that the parser rejects.
    const src = "a = 'hello'\n";

    const obj = parse(src) as any;
    obj.a = 'del\x7fchar';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe('a = "del\\u007Fchar"\n');
  });

  test('Preserves a multiline literal string when editing a string', () => {
    const src = dedent`
    a = '''
    hello
    '''
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 'goodbye';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = '''
    goodbye'''
    ` + '\n');
  });

  test('Does not escape backslashes in a preserved multiline literal string', () => {
    const src = dedent`
    a = '''
    C:\Users\Example
    '''
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 'D:\\Data\\Files';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = '''
    D:\Data\Files'''
    ` + '\n');
  });

  test('Preserves a multiline basic string when editing a string', () => {
    const src = dedent`
    a = """
    hello
    """
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 'goodbye';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = """
    goodbye"""
    ` + '\n');
  });

  test('Escapes backslashes in a preserved multiline basic string', () => {
    const src = dedent`
    a = """
    hello
    """
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 'D:\\Data\\Files';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = """
    D:\\Data\\Files"""
    ` + '\n');
  });

  test('Escapes embedded triple quotes in a preserved multiline basic string', () => {
    const src = dedent`
    a = """
    hello
    """
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 'has """ inside';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = """
    has ""\" inside"""
    ` + '\n');
  });
});

describe.each(implementations)('Multiline string preservation (%s patch)', (_label, patch) => {
  test('should patch single-line multiline string to another single-line', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """A simple package"""
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "A different description";
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = """A different description"""
      version = "1.0.0"
      ` + '\n');
  });

  test('should patch single-line multiline string to another single-line with newline at start and end', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """
      A simple package
      """
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "A different description";
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = """
      A different description"""
      version = "1.0.0"
      ` + '\n');
  });

  test('should preserve multiline string with actual multiple lines', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """
      First line
      Second line
      Third line"""
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "Updated line one\nUpdated line two\nUpdated line three";
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = """
      Updated line one
      Updated line two
      Updated line three"""
      version = "1.0.0"
      ` + '\n');
  });

  test('should collapse mlbs with leading newline and multiple content lines to single-line value', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """
      First line
      Second line
      Third line"""
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "single line value";
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = """
      single line value"""
      version = "1.0.0"
      ` + '\n');

    expect(parse(patched).package.description).toEqual("single line value");
  });

  test('should collapse mlbs without leading newline and multiple content lines to single-line value', () => {
    const existing =
      '[package]\n' +
      'name = "example"\n' +
      'description = """First line\n' +
      'Second line\n' +
      'Third line"""\n' +
      'version = "1.0.0"\n';

    const obj = parse(existing);
    expect(obj.package.description).toEqual("First line\nSecond line\nThird line");

    obj.package.description = "single line value";
    const patched = patch(existing, obj);

    expect(patched).toEqual(
      '[package]\n' +
      'name = "example"\n' +
      'description = """single line value"""\n' +
      'version = "1.0.0"\n'
    );

    expect(parse(patched).package.description).toEqual("single line value");
  });

  test('should patch mlbs without leading newline to another multi-line value', () => {
    const existing =
      '[package]\n' +
      'name = "example"\n' +
      'description = """First line\n' +
      'Second line"""\n' +
      'version = "1.0.0"\n';

    const obj = parse(existing);
    expect(obj.package.description).toEqual("First line\nSecond line");

    obj.package.description = "Hello\nWorld";
    const patched = patch(existing, obj);

    expect(patched).toEqual(
      '[package]\n' +
      'name = "example"\n' +
      'description = """Hello\n' +
      'World"""\n' +
      'version = "1.0.0"\n'
    );

    expect(parse(patched).package.description).toEqual("Hello\nWorld");
  });

  test('should preserve multiline string with trailing newline in content', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """
      Content with trailing newline
      """
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "New content with trailing newline\n";
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = """
      New content with trailing newline
      """
      version = "1.0.0"
      ` + '\n');
  });

  test('should preserve multiline string with multiple trailing newlines', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """
      Content


      """
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "New content\n\n\n";
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = """
      New content


      """
      version = "1.0.0"
      ` + '\n');
  });

  test('should preserve multiline string with empty content and newline at the start', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """
      """
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "";
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = """
      """
      version = "1.0.0"
      ` + '\n');
  });

  test('should preserve multiline string with empty content without newline at the start', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """"""
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "";
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = """"""
      version = "1.0.0"
      ` + '\n');
  });

  test('should preserve multiline string format when value contains backslashes', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """
      Path: C:\\\\Users\\\\Example
      """
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "New path: D:\\Data\\Files\n";
    const patched = patch(existing, obj);

    const expectedOutput = dedent`
      [package]
      name = "example"
      description = """
      New path: D:\\Data\\Files
      """
      version = "1.0.0"
      ` + '\n';

    expect(patched).toEqual(expectedOutput);
  });

  test('should handle multiline string with triple quotes in content', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """Content without triple quotes"""
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = 'Updated content';
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = """Updated content"""
      version = "1.0.0"
      ` + '\n');
  });

  test('should preserve multiline string with CRLF line endings', () => {
    const existing = '[package]\r\nname = "example"\r\ndescription = """\r\nA simple package\r\n"""\r\nversion = "1.0.0"\r\n';

    const obj = parse(existing);
    obj.package.description = "A different description";
    const patched = patch(existing, obj);

    const expectedOutput = '[package]\r\nname = "example"\r\ndescription = """\r\nA different description"""\r\nversion = "1.0.0"\r\n';

    expect(patched).toEqual(expectedOutput);
  });

  test('should handle conversion from regular string to multiline string format preserved', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = "Regular string"
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "Updated string";
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = "Updated string"
      version = "1.0.0"
      ` + '\n');
  });

  test('should preserve multiline string with only newlines', () => {
    const existing = dedent`
      [package]
      name = "example"
      description = """

      """
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "\n";
    const patched = patch(existing, obj);

    expect(patched).toEqual(dedent`
      [package]
      name = "example"
      description = """

      """
      version = "1.0.0"
      ` + '\n');
  });
});

describe.each(implementations)('Multiline strings - both basic and literal (%s patch)', (_label, patch) => {
  test.each([
    { delimiter: '"""', type: 'basic' },
    { delimiter: "'''", type: 'literal' }
  ])('should preserve $type multiline string format with simple content', ({ delimiter }) => {
    const existing = dedent`
      [package]
      name = "example"
      description = ${delimiter}
      A simple package
      ${delimiter}
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "A different description";
    const patched = patch(existing, obj);

    const expectedOutput = dedent`
      [package]
      name = "example"
      description = ${delimiter}
      A different description${delimiter}
      version = "1.0.0"
      ` + '\n';

    expect(patched).toEqual(expectedOutput);
  });

  test.each([
    { delimiter: '"""', type: 'basic' },
    { delimiter: "'''", type: 'literal' }
  ])('should preserve $type multiline string with multiple lines', ({ delimiter }) => {
    const existing = dedent`
      [package]
      name = "example"
      description = ${delimiter}
      line one
      line two
      line three${delimiter}
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "New line one\nNew line two\nNew line three";
    const patched = patch(existing, obj);

    const expectedOutput = dedent`
      [package]
      name = "example"
      description = ${delimiter}
      New line one
      New line two
      New line three${delimiter}
      version = "1.0.0"
      ` + '\n';

    expect(patched).toEqual(expectedOutput);
  });

  test.each([
    { delimiter: '"""', type: 'basic' },
    { delimiter: "'''", type: 'literal' }
  ])('should preserve $type multiline string with empty content and leading newline', ({ delimiter }) => {
    const existing = dedent`
      [package]
      name = "example"
      description = ${delimiter}
      ${delimiter}
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.package.description = "";
    const patched = patch(existing, obj);

    const expectedOutput = dedent`
      [package]
      name = "example"
      description = ${delimiter}
      ${delimiter}
      version = "1.0.0"
      ` + '\n';

    expect(patched).toEqual(expectedOutput);
  });

  test.each([
    { delimiter: '"""', type: 'basic' },
    { delimiter: "'''", type: 'literal' }
  ])('should preserve $type multiline string with CRLF line endings', ({ delimiter }) => {
    const existing =
      `[package]\r\n` +
      `name = "example"\r\n` +
      `description = ${delimiter}\r\n` +
      `A simple package\r\n` +
      `${delimiter}\r\n` +
      `version = "1.0.0"\r\n`;

    const obj = parse(existing);
    obj.package.description = "A different description";
    const patched = patch(existing, obj);

    const expectedOutput =
      `[package]\r\n` +
      `name = "example"\r\n` +
      `description = ${delimiter}\r\n` +
      `A different description${delimiter}\r\n` +
      `version = "1.0.0"\r\n`;

    expect(patched).toEqual(expectedOutput);
  });
});

// A `"""` or `'''` can appear in content inside a basic string or comment
// without the document containing a multiline string. These pin that such
// content remains ordinary text during patching.
describe.each(implementations)('Multiline delimiters appearing in content (%s patch)', (_label, patch) => {
  test('a basic string containing three apostrophes patches normally', () => {
    const original = dedent`
      note = "contains ''' inside"
      port = 8080
    ` + '\n';

    const updated = parse(original);
    updated.port = 9090;

    expect(patch(original, updated)).toBe(dedent`
      note = "contains ''' inside"
      port = 9090
    ` + '\n');
  });

  test('a comment containing three apostrophes patches normally', () => {
    const original = dedent`
      # see ''' for the quoting rules
      port = 8080
    ` + '\n';

    const updated = parse(original);
    updated.port = 9090;

    expect(patch(original, updated)).toBe(dedent`
      # see ''' for the quoting rules
      port = 9090
    ` + '\n');
  });

  test('a comment containing three quotes patches normally', () => {
    const original = dedent`
      # see """ for the quoting rules
      port = 8080
    ` + '\n';

    const updated = parse(original);
    updated.port = 9090;

    expect(patch(original, updated)).toBe(dedent`
      # see """ for the quoting rules
      port = 9090
    ` + '\n');
  });

  test('a multiline literal string holding three quotes patches normally', () => {
    const original = dedent`
      note = '''
      holds """ fine'''
      port = 8080
    ` + '\n';

    const updated = parse(original);
    updated.port = 9090;

    expect(patch(original, updated)).toBe(dedent`
      note = '''
      holds """ fine'''
      port = 9090
    ` + '\n');
  });

  test('a multiline literal string holding three quotes inside an inline table', () => {
    const original = dedent`
      cfg = {
        note = '''
      holds """ fine''',
        retries = 2,
      }
      port = 8080
    ` + '\n';

    const updated = parse(original);
    updated.cfg.retries = 3;

    expect(patch(original, updated)).toBe(dedent`
      cfg = {
        note = '''
      holds """ fine''',
        retries = 3,
      }
      port = 8080
    ` + '\n');
  });

  test('a multiline literal string holding two apostrophes patches normally', () => {
    const original = dedent`
      note = '''
      it can hold '' safely'''
      port = 8080
    ` + '\n';

    const updated = parse(original);
    updated.port = 9090;

    expect(patch(original, updated)).toBe(dedent`
      note = '''
      it can hold '' safely'''
      port = 9090
    ` + '\n');
  });
});

describe.each(implementations)('Mandatory escape characters through patch (%s patch)', (_label, patch) => {
  test('should escape backspace (\\b) when patching a basic string value', () => {
    const existing = 'msg = "hello"\n';

    const obj = parse(existing);
    obj.msg = 'line\x08end'; // \x08 = backspace

    const patched = patch(existing, obj);
    expect(patched).toBe('msg = "line\\bend"\n');
    expect(parse(patched).msg).toEqual('line\x08end');
  });

  test('should escape form feed (\\f) when patching a basic string value', () => {
    const existing = 'msg = "hello"\n';

    const obj = parse(existing);
    obj.msg = 'page\x0Cbreak'; // \x0C = form feed

    const patched = patch(existing, obj);
    expect(patched).toBe('msg = "page\\fbreak"\n');
    expect(parse(patched).msg).toEqual('page\x0Cbreak');
  });

  test('should escape carriage return (\\r) when patching a singleline basic string value', () => {
    const existing = 'msg = "hello"\n';

    const obj = parse(existing);
    obj.msg = 'line\rend';

    const patched = patch(existing, obj);
    expect(patched).toBe('msg = "line\\rend"\n');
    expect(parse(patched).msg).toEqual('line\rend');
  });

  test('should escape an arbitrary disallowed control character (ESC, \\x1b) as \\uXXXX', () => {
    const existing = 'msg = "hello"\n';

    const obj = parse(existing);
    obj.msg = 'esc\x1Bchar';

    const patched = patch(existing, obj);
    expect(patched).toBe('msg = "esc\\u001Bchar"\n');
    expect(parse(patched).msg).toEqual('esc\x1Bchar');
  });

  test('should escape DEL (\\x7f) as \\u007F when patching a basic string value', () => {
    const existing = 'msg = "hello"\n';

    const obj = parse(existing);
    obj.msg = 'del\x7Fchar';

    const patched = patch(existing, obj);
    expect(patched).toBe('msg = "del\\u007Fchar"\n');
    expect(parse(patched).msg).toEqual('del\x7Fchar');
  });

  test('should escape disallowed control characters in a multiline basic string', () => {
    const existing = 'msg = """hello"""\n';

    const obj = parse(existing);
    obj.msg = 'back\x08space';

    const patched = patch(existing, obj);
    expect(patched).toBe('msg = """back\\bspace"""\n');
    expect(parse(patched).msg).toEqual('back\x08space');
  });
});

describe.each(implementations)('Date/time value edits (%s patch)', (_label, patch) => {
  test('should patch date by increasing it by one day', () => {
    const existing = dedent`
    # Configuration with date
    name = "Test App"
    created_date = 2024-01-15T10:30:00Z

    [settings]
    enabled = true
    ` + '\n';

    const value = parse(existing);

    const currentDate = value.created_date as Date;
    const nextDay = new Date(currentDate);
    nextDay.setDate(nextDay.getDate() + 1);

    value.created_date = nextDay;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
    # Configuration with date
    name = "Test App"
    created_date = 2024-01-16T10:30:00Z

    [settings]
    enabled = true
    ` + '\n');
  });

  test('should patch date field from example toml', () => {
    const existing = dedent`
    title = "TOML Example"

    [owner]
    name = "Tom Preston-Werner"
    dob = 1979-05-27T07:32:00Z # First class dates? Why not?

    [database]
    enabled = true
    ` + '\n';

    const value = parse(existing);

    const currentDob = value.owner.dob as Date;
    const nextDay = new Date(currentDob);
    nextDay.setDate(nextDay.getDate() + 1);

    value.owner.dob = nextDay;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
    title = "TOML Example"

    [owner]
    name = "Tom Preston-Werner"
    dob = 1979-05-28T07:32:00Z # First class dates? Why not?

    [database]
    enabled = true
    ` + '\n');
  });

  test('should patch date-only field by increasing it by one day', () => {
    const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_date = 2024-01-15

    [venue]
    name = "Convention Center"
    ` + '\n';

    const value = parse(existing);

    const currentDate = value.start_date as Date;
    const nextDayTime = currentDate.getTime() + 24 * 60 * 60 * 1000;
    const nextDayStr = new Date(nextDayTime).toISOString().split('T')[0];
    const nextDay = new LocalDate(nextDayStr);

    value.start_date = nextDay;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_date = 2024-01-16

    [venue]
    name = "Convention Center"
    ` + '\n');
  });

  test('should patch local datetime with T separator', () => {
    const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-15T10:30:00

    [venue]
    name = "Convention Center"
    ` + '\n';

    const value = parse(existing);

    const currentDateTime = value.start_datetime as Date;
    const nextDayTime = currentDateTime.getTime() + 24 * 60 * 60 * 1000;
    const nextDayISO = new Date(nextDayTime).toISOString().replace('Z', '');
    const nextDay = new LocalDateTime(nextDayISO, false);

    value.start_datetime = nextDay;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-16T10:30:00

    [venue]
    name = "Convention Center"
    ` + '\n');
  });

  test('should patch local datetime with space separator', () => {
    const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-15 10:30:00

    [venue]
    name = "Convention Center"
    ` + '\n';

    const value = parse(existing);

    const currentDateTime = value.start_datetime as Date;
    const nextDayTime = currentDateTime.getTime() + 24 * 60 * 60 * 1000;
    const nextDayISO = new Date(nextDayTime).toISOString().replace('Z', '').replace('T', ' ');
    const nextDay = new LocalDateTime(nextDayISO, true);

    value.start_datetime = nextDay;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-16 10:30:00

    [venue]
    name = "Convention Center"
    ` + '\n');
  });

  test('should patch offset datetime with space separator', () => {
    const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-15 10:30:00Z

    [venue]
    name = "Convention Center"
    ` + '\n';

    const value = parse(existing);

    const newDateTime = new OffsetDateTime('2024-01-16 10:30:00Z', true);

    value.start_datetime = newDateTime;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-16 10:30:00Z

    [venue]
    name = "Convention Center"
    ` + '\n');
  });

  test('should patch offset datetime with T separator and timezone offset', () => {
    const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-15T10:30:00-07:00

    [venue]
    name = "Convention Center"
    ` + '\n';

    const value = parse(existing);

    const newDateTime = new OffsetDateTime('2024-01-16T10:30:00-07:00', false);
    value.start_datetime = newDateTime;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-16T10:30:00-07:00

    [venue]
    name = "Convention Center"
    ` + '\n');
  });

  test('should patch offset datetime with space separator and timezone offset', () => {
    const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-15 10:30:00+05:30

    [venue]
    name = "Convention Center"
    ` + '\n';

    const value = parse(existing);

    const newDateTime = new OffsetDateTime('2024-01-16 10:30:00+05:30', true);
    value.start_datetime = newDateTime;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-16 10:30:00+05:30

    [venue]
    name = "Convention Center"
    ` + '\n');
  });

  test('should patch offset datetime with milliseconds and preserve precision', () => {
    const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-15T10:30:00.500Z

    [venue]
    name = "Convention Center"
    ` + '\n';

    const value = parse(existing);

    const newDateTime = new OffsetDateTime('2024-01-16T14:30:00.750Z', false);
    value.start_datetime = newDateTime;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_datetime = 2024-01-16T14:30:00.750Z

    [venue]
    name = "Convention Center"
    ` + '\n');
  });
});

describe.each(implementations)('BigInt handling (%s patch)', (_label, patch) => {
  test('should not throw on document containing integer outside safe range', () => {
    const src = 'id = 9223372036854775807\n';
    expect(() => patch(src, parse(src))).not.toThrow();
  });

  test('should not throw on unrelated edit with bigint in document', () => {
    const src = 'id = 9223372036854775807\nname = "x"\n';
    const o = parse(src);
    o.name = 'y';
    expect(() => patch(src, o)).not.toThrow();
    const result = patch(src, o);
    expect(result).toContain('name = "y"');
    expect(result).toContain('id = 9223372036854775807');
  });
});

describe.each(implementations)('Non-finite numbers (%s patch)', (_label, patch) => {
  test('encodes non-finite numbers', () => {
    expect(patch('x = 1.0\n', { x: Infinity })).toBe('x = inf\n');
    expect(patch('x = 1.0\n', { x: -Infinity })).toBe('x = -inf\n');
    expect(patch('x = 1.0\n', { x: NaN })).toBe('x = nan\n');
  });
});
