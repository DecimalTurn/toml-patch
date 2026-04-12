import patch from '../patch';
import { parse } from '../';
import { LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from '../parse-toml';
import { example } from '../__fixtures__';
import dedent from 'dedent';

test('it should apply edit to key-value', () => {
  const value = parse(example);
  value.owner.name = 'Tim Hall';

  expect(patch(example, value)).toMatchSnapshot();
});

test('it should add key-value to table', () => {
  const value = parse(example);
  value.owner.handle = 'timhall';

  expect(patch(example, value)).toMatchSnapshot();
});

test('it should add key-value to inline table', () => {
  const value = parse(example);
  value.clients.count.d = 4;

  expect(patch(example, value)).toMatchSnapshot();
});

test('it should add to inline array', () => {
  const value = parse(example);
  value.database.ports.push(8003);

  expect(patch(example, value)).toMatchSnapshot();
});

test('it should add to table array', () => {
  const value = parse(example);
  value.products.splice(1, 0, { name: 'Screwdriver', sku: 123456 });

  expect(patch(example, value)).toMatchSnapshot();
});

test('should remove key-value from table', () => {
  const value = parse(example);
  delete value.database.enabled;

  expect(patch(example, value)).toMatchSnapshot();
});

test('should remove element from inline array', () => {
  const value = parse(example);
  value.database.ports.splice(1, 1);

  expect(patch(example, value)).toMatchSnapshot();
});

test('should move elements in inline array', () => {
  const value = parse(example);
  value.clients.data[1][0] = 2;
  value.clients.data[1][1] = 1;

  expect(patch(example, value)).toMatchSnapshot();
});

test('should rename key-value in table', () => {
  const value = parse(example);
  delete value.products[1].color;
  value.products[1].product_color = 'gray';

  expect(patch(example, value)).toMatchSnapshot();
});

test('should patch readme example (no newline at the end)', () => {
  const existing = dedent`
    # This is a TOML document

    title = "TOML example"
    owner.name = "Bob"
    `;
  const patched = patch(existing, {
    title: 'TOML example',
    owner: {
      name: 'Tim'
    }
  });

  expect(patched).toEqual(dedent`
    # This is a TOML document

    title = "TOML example"
    owner.name = "Tim"
    `);

});

//A simple toml with a global key-value and a table
test('should patch example 1', () => {
  
  const existing = dedent`
    bar = "baz"

    [foo]
    a = "b"

    ` + '\n';

  const newObject = {
    bar: 'baz',
    foo: {
      a: 'b'
    }
  };

  const patched = patch(existing, newObject);

  let expectedOutput = dedent`
    bar = "baz"

    [foo]
    a = "b"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
});

// Here we check if switching the order of the properties in the newObject
// will still produce the same output
test('should patch example 2', () => {
  const existing = dedent`
    bar = "baz"

    [foo]
    a = "b"

    ` + '\n';

  const newObject = {
    foo: {
      a: 'b'
    },
    bar: 'baz'
  };

  const patched = patch(existing, newObject);

  let expectedOutput = dedent`
    bar = "baz"

    [foo]
    a = "b"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
});


// A reasonable JSON object to patch a simpler toml file
// This seems to cause a problem with the [src] table appearing at the top
test('should patch example with src table', () => {

  
  const existing = dedent`
    [project]
    name = "Simple"
    
    [src]
    Module1 = "src/Module1.bas"
    ` + '\n';

  const newObject = {
    project: {
      name: "Simple",
      version: "0.0.0",
      authors: ["Joe Bloggs"],
      target: {
        type: "xlsm",
        path: "../targets/xlsm"
      }
    },
    src: {
      Module1: "../src/Module1.bas"
    }
  };

  const patched = patch(existing, newObject);

  let expectedOutput = dedent`
    [project]
    name = "Simple"
    version = "0.0.0"
    authors = [ "Joe Bloggs" ]
    target = { type = "xlsm", path = "../targets/xlsm" }

    [src]
    Module1 = "../src/Module1.bas"
    ` + '\n';

    expect(patched).toEqual(expectedOutput);
});

// A reasonable JSON object to patch a simpler toml file
// This seems to cause a problem with the [src] table appearing at the top
test('should patch example with missing src table', () => {
  const existing = dedent`
    [project]
    name = "Simple"
    ` + '\n';

  // This form doesn't cause the problem
  // const existing = dedent`
  //   [project]
  //   name = "Simple"
    
  //   [src]
  //   Module1 = "src/Module1.bas"
  //   ` + '\n';

  const newObject = {
    project: {
      name: "Simple",
      version: "0.0.0",
      authors: ["Joe Bloggs"],
      target: {
        type: "xlsm",
        path: "../targets/xlsm"
      }
    },
    src: {
      Module1: "../src/Module1.bas"
    }
  };

  const patched = patch(existing, newObject);

  let expectedOutput = dedent`
    [project]
    name = "Simple"
    version = "0.0.0"
    authors = [ "Joe Bloggs" ]
    target = { type = "xlsm", path = "../targets/xlsm" }

    [src]
    Module1 = "../src/Module1.bas"
    ` + '\n';

    expect(patched).toEqual(expectedOutput);
});


test('should patch example with triple quotes', () => {
  const existing = dedent`
    [package]
    name = "lipsum"
    version = "0.8.0"
    authors = ["Martin Geisler <martin@geisler.net>"]
    description = """
    Lipsum is a lorem ipsum text generation library. Use this if you need
    filler or dummy text for your application.
    
    The text is generated using a simple Markov chain, which you can also
    instantiate to generate your own pieces of pseudo-random text.
    """
    documentation = "https://docs.rs/lipsum/"
    repository = "https://github.com/mgeisler/lipsum/"
    readme = "README.md"
    ` + '\n';

  const obj  = parse(existing);
  obj.package.version = "0.8.1";
  const patched = patch(existing, obj);
  let expectedOutput = dedent`
    [package]
    name = "lipsum"
    version = "0.8.1"
    authors = ["Martin Geisler <martin@geisler.net>"]
    description = """
    Lipsum is a lorem ipsum text generation library. Use this if you need
    filler or dummy text for your application.
    
    The text is generated using a simple Markov chain, which you can also
    instantiate to generate your own pieces of pseudo-random text.
    """
    documentation = "https://docs.rs/lipsum/"
    repository = "https://github.com/mgeisler/lipsum/"
    readme = "README.md"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
});

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
  
  let expectedOutput = dedent`
    [package]
    name = "example"
    description = """A different description"""
    version = "1.0.0"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
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
  
  let expectedOutput = dedent`
    [package]
    name = "example"
    description = """
    A different description"""
    version = "1.0.0"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
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
  
  let expectedOutput = dedent`
    [package]
    name = "example"
    description = """
    Updated line one
    Updated line two
    Updated line three"""
    version = "1.0.0"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
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
  
  let expectedOutput = dedent`
    [package]
    name = "example"
    description = """
    New content with trailing newline
    """
    version = "1.0.0"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
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
  
  let expectedOutput = dedent`
    [package]
    name = "example"
    description = """
    New content


    """
    version = "1.0.0"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
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
  
  let expectedOutput = dedent`
    [package]
    name = "example"
    description = """
    """
    version = "1.0.0"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
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
  
  let expectedOutput = dedent`
    [package]
    name = "example"
    description = """"""
    version = "1.0.0"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
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
  // Note: Multiline BASIC strings (""") DO escape backslashes (unlike literal strings with ''')
  // When we set a JavaScript string with a backslash, it needs to be escaped as \\ in the TOML output
  obj.package.description = "New path: D:\\Data\\Files\n";
  const patched = patch(existing, obj);
  
  // In the expected output, backslashes are escaped in the multiline basic string
  const expectedOutput = `[package]
name = "example"
description = """
New path: D:\\\\Data\\\\Files
"""
version = "1.0.0"
`;

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
  
  let expectedOutput = dedent`
    [package]
    name = "example"
    description = """Updated content"""
    version = "1.0.0"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
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
  
  // Should remain as regular string since original was regular
  let expectedOutput = dedent`
    [package]
    name = "example"
    description = "Updated string"
    version = "1.0.0"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
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
  
  let expectedOutput = dedent`
    [package]
    name = "example"
    description = """

    """
    version = "1.0.0"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
});

test('should preserve line-continuation in multiline basic strings - Same length', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The swift brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.');
});

test('should preserve line-continuation in multiline basic strings - Slightly smaller length, second line preserved intact', () => {
  // "quick" → "slow" frees 2 chars on line 1 but the second line must not change.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The slow brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // Line 2 "jumps over the lazy dog." is unchanged and must stay verbatim.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The slow brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The slow brown fox jumps over the lazy dog.');
});

test('should preserve line-continuation in multiline basic strings - bigger length causing small overflow', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The superfast brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The superfast brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The superfast brown fox jumps over the lazy dog.');
});

test('should preserve line-continuation in multiline basic strings - even bigger length causing big overflow', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' + // 19 chars
    '  jumps over the lazy dog."""\n'; // 24 chars

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The superduperultrafast brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // "superduperultrafast" forces a mid-line split; the unchanged second line is preserved.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The superduperultrafast \\' + '\n' +
    '  brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The superduperultrafast brown fox jumps over the lazy dog.');
});

test('should not treat even number of trailing backslashes as line-continuation', () => {
  // A line ending with \\ is two literal backslashes, not a continuation.
  // The segment parser must count trailing backslashes and only flag odd counts.
  const existing =
    '[cfg]\n' +
    'path = """\\' + '\n' +
    '  C:\\\\Users\\\\Alice \\' + '\n' +
    '  is cool."""\n';

  const value = parse(existing);
  // \\ in raw TOML basic string = one literal backslash, so the decoded value is:
  // "C:\Users\Alice is cool."
  expect(value.cfg.path).toEqual('C:\\Users\\Alice is cool.');

  value.cfg.path = 'C:\\Users\\Bob is cool.';
  const patched = patch(existing, value);

  // The double-backslash lines are literal backslashes (even count = not continuation).
  // "Alice" → "Bob" frees space on line 1; line 2 "is cool." must stay verbatim.
  expect(patched).toEqual(
    '[cfg]\n' +
    'path = """\\' + '\n' +
    '  C:\\\\Users\\\\Bob \\' + '\n' +
    '  is cool."""\n'
  );
  expect(parse(patched).cfg.path).toEqual('C:\\Users\\Bob is cool.');
});

test('should preserve empty line between content lines in line-continuation multiline basic strings', () => {
  // A blank line between continuation segments is consumed by TOML's line-continuation
  // whitespace trimming, but the raw format should be preserved after patching.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // Blank line is whitespace consumed by line-continuation, so decoded value has no gap
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // The empty line between the two content segments is preserved
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The swift brown fox \\' + '\n' +
    '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.');
});

test('should preserve whitespace-only blank line between content lines in line-continuation multiline basic strings', () => {
  // A whitespace-only (e.g. "  ") line should also round-trip with its original spaces.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  \n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // The whitespace-only blank line is preserved with its original spaces
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The swift brown fox \\' + '\n' +
    '  \n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.');
});

test('should not treat backslash in literal multiline string as line-continuation when converting to basic', () => {
  // If the new value contains ''' the string is converted from literal (''') to basic (""").
  // Backslashes in the original literal body were literal characters — line-continuation
  // detection must be gated on the original delimiter, not the post-conversion isLiteral flag.
  const existing =
    '[cfg]\n' +
    "path = '''\n" +
    "C:\\Users\\Alice\n" +
    "'''\n";

  const value = parse(existing);
  // In a literal string backslashes are verbatim, not escape sequences
  expect(value.cfg.path).toEqual('C:\\Users\\Alice\n');

  // New value contains ''' so conversion to basic multiline """ is required
  value.cfg.path = "uses '''triple''' quotes\n";
  const patched = patch(existing, value);

  // Converts to basic string; single quotes need no escaping in basic strings;
  // no line-continuation logic is applied (original was literal, not basic)
  expect(patched).toEqual(
    '[cfg]\n' +
    "path = \"\"\"\n" +
    "uses '''triple''' quotes\n" +
    "\"\"\"\n"
  );
  expect(parse(patched).cfg.path).toEqual("uses '''triple''' quotes\n");
});

test('should preserve multiple consecutive spaces between words in line-continuation multiline strings', () => {
  // Multiple spaces between words are preserved because the tokenizer splits on
  // space runs (/\S+| +/g) and appends the run as trailing WS before the backslash
  // when the next word doesn't fit. TOML preserves trailing WS before line-continuation.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  // New value contains double spaces between words
  value.description.text = 'The  quick  brown  fox  jumps  over  the  lazy  dog.';
  const patched = patch(existing, value);

  // Double spaces are preserved: the space run at each line-break point becomes
  // trailing whitespace before the backslash. Decoded: "The  quick  brown  fox  jumps  over  the  lazy  dog."
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The  quick  brown  fox  \\' + '\n' +
    '  jumps  over  the  lazy  \\' + '\n' +
    '  dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The  quick  brown  fox  jumps  over  the  lazy  dog.');
});

test('should handle patching line-continuation multiline string to empty string', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = '';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  """\n'
  );
  expect(parse(patched).description.text).toEqual('');
});

test('should handle patching line-continuation multiline string to a single character', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = 'x';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  x"""\n'
  );
  expect(parse(patched).description.text).toEqual('x');
});

test('should handle patching line-continuation multiline string to a single word', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = 'Hello';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  Hello"""\n'
  );
  expect(parse(patched).description.text).toEqual('Hello');
});

test('should handle patching line-continuation multiline string with no whitespace in new value', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // A long string with no spaces — cannot break at word boundaries, so it stays on one line
  value.description.text = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  abcdefghijklmnopqrstuvwxyz0123456789"""\n'
  );
  expect(parse(patched).description.text).toEqual('abcdefghijklmnopqrstuvwxyz0123456789');
});

test('should handle patching line-continuation multiline string with a single very long word exceeding maxLength', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  Hello \\' + '\n' +
    '  world."""\n';

  const value = parse(existing);
  // "Supercalifragilisticexpialidocious" is 34 chars — far exceeds maxLength of 5
  value.description.text = 'Supercalifragilisticexpialidocious rest';
  const patched = patch(existing, value);

  // The word overflows maxLength but must still be emitted (at least one word per line)
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  Supercalifragilisticexpialidocious \\' + '\n' +
    '  rest"""\n'
  );
  expect(parse(patched).description.text).toEqual('Supercalifragilisticexpialidocious rest');
});

test('should handle patching line-continuation multiline string where original value is all whitespace', () => {
  // The original decoded value is just spaces (consumed by line-continuation trimming)
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '       \\' + '\n' +
    '       """\n';

  const value = parse(existing);
  // Line-continuation trims all whitespace, so the decoded value is empty
  expect(value.description.text).toEqual('');

  value.description.text = 'Hello world';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '       Hello \\' + '\n' +
    '       world"""\n'
  );
  expect(parse(patched).description.text).toEqual('Hello world');
});

test('should handle patching line-continuation multiline string to all whitespace', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // New value is only spaces — cannot be represented in line-continuation format
  // because line-continuation trims all whitespace. Falls back to regular multiline.
  value.description.text = '     ';
  const patched = patch(existing, value);

  // Falls back to regular multiline format to preserve the whitespace value
  expect(patched).toEqual(
    '[description]\n' +
    'text = """     """\n'
  );
  // Verify round-trip: parsing the patched output should recover the whitespace value
  expect(parse(patched)).toEqual({ description: { text: '     ' } });
});

// Mixed line ending backslash + literal newline tests.
// A multiline basic string may have some lines with a line ending backslash and other
// lines without one. The lines that lack a backslash contribute a literal newline to
// the decoded value. Since the decoded value therefore contains a '\n',
// detectLineContinuation correctly returns false and the formatter falls back to a
// regular multiline string — preserving content even though the structural formatting
// is not preserved.

test('should preserve line ending backslash with literal line break for mixed LC/literal-newline source', () => {
  // """\<NL> opening, middle line has backslash, last content line does NOT.
  // The decoded value therefore contains a literal newline.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog\n' +
    '  and this was just white space."""\n';

  const value = parse(existing);
  // Line ending backslash joins first two lines; third line starts after literal \n
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog\n  and this was just white space.');

  value.description.text = 'Hello world\nand goodbye world';
  const patched = patch(existing, value);

  // Original style contains a literal newline in source, so preserve it literally
  // instead of encoding as a \n escape.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  Hello world\n' +
    'and goodbye world"""\n'
  );
  expect(parse(patched).description.text).toEqual('Hello world\nand goodbye world');
});

test('should preserve literal line break when only opening line has continuation marker', () => {
  // """\<NL> is immediately followed by content lines WITHOUT backslashes.
  // Only the opening backslash trims the first newline; the rest are literal newlines.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // Opening backslash trims to first content line, then literal newline appears
  expect(value.description.text).toEqual('The quick brown fox\n  jumps over the lazy dog.');

  value.description.text = 'A swift brown fox\njumps high.';
  const patched = patch(existing, value);

  // Preserve the opening LC marker and keep the semantic newline as a literal
  // source line break instead of a \n escape.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  A swift brown fox\n' +
    'jumps high."""\n'
  );
  expect(parse(patched).description.text).toEqual('A swift brown fox\njumps high.');
});

test('should preserve line ending backslash for """<NL> format regardless of leading whitespace in new value', () => {
  // The opening is """<NL> (no backslash), so first content line's indent is part of the
  // decoded value. newFirstIndent is derived from the new value's own leading whitespace,
  // stripped before packing and reattached by reassembly — so any leading whitespace is
  // supported without falling back.
  const existing =
    '[description]\n' +
    'text = """\n' +
    '  The quick brown fox \\\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('  The quick brown fox jumps over the lazy dog.');

  // Same 2-space indent — LC format preserved
  value.description.text = '  The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\n' +
    '  The swift brown fox \\\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('  The swift brown fox jumps over the lazy dog.');
});

test('should preserve line ending backslash for """<NL> format when new value has different leading whitespace', () => {
  // newFirstIndent is derived from the new value itself, so the first line's structural
  // indent adapts to match the new value's leading whitespace.
  const existing =
    '[description]\n' +
    'text = """\n' +
    '  The quick brown fox \\\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('  The quick brown fox jumps over the lazy dog.');

  // New value has no leading spaces — newFirstIndent = "", first line gets no indent
  value.description.text = 'The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // LC format preserved, first indent removed to match the new value
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\n' +
    'The swift brown fox \\\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.');
});

test('should preserve line ending backslash for """<NL> format when first segment has no indent', () => {
  // Same structure as above, but the new value does NOT start with spaces AND the
  // original first segment has no indent. rebuildLineContinuation preserves LC.
  const existing =
    '[description]\n' +
    'text = """\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // LC format preserved — first segment has no indent, no leading-space issue
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\n' +
    'The swift brown fox \\\n' +
    'jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.');
});

test('should preserve line ending backslash for multi-paragraph string with blank line between paragraphs', () => {
  // Each paragraph's text lines use LC to join them — no real newline within a paragraph.
  // A blank line (no backslash) between the two blocks is a literal \n\n in the decoded value.
  // Note: uses `"""\<NL>` (backslash opening), not `"""<NL>`, so no leading-indent issue.
  const existing =
    '[doc]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\n' +
    '\n' +
    'The second paragraph \\\n' +
    'also has some content."""\n';

  const decoded = parse(existing).doc.text;
  expect(decoded).toEqual('The quick brown fox jumps over the lazy dog.\n\nThe second paragraph also has some content.');

  const value = parse(existing);
  value.doc.text = 'A swift brown fox jumps over the lazy dog.\n\nThe second paragraph is different now.';
  const patched = patch(existing, value);

  // Paragraph style detected from original — paragraph breaks become actual blank TOML lines.
  // Each paragraph is word-packed independently, keeping "dog." on the correct paragraph.
  expect(patched).toEqual(
    '[doc]\n' +
    'text = """\\' + '\n' +
    'A swift brown fox jumps \\\n' +
    'over the lazy dog.\n' +
    '\n' +
    'The second paragraph is \\\n' +
    'different now."""\n'
  );
  expect(parse(patched).doc.text).toEqual('A swift brown fox jumps over the lazy dog.\n\nThe second paragraph is different now.');
});

test('should collapse multi-paragraph LC string to one paragraph when new value has no newlines', () => {
  const existing =
    '[doc]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\n' +
    '\n' +
    'The second paragraph \\\n' +
    'also has some content."""\n';

  const value = parse(existing);
  value.doc.text = 'A swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // No \n\n in new value — blank-line paragraph style not triggered; single-group pack.
  // The blank line from the original is dropped since it has no corresponding paragraph break.
  expect(patched).toEqual(
    '[doc]\n' +
    'text = """\\' + '\n' +
    'A swift brown fox jumps \\\n' +
    'over the lazy dog."""\n'
  );
  expect(parse(patched).doc.text).toEqual('A swift brown fox jumps over the lazy dog.');
});

test('should expand multi-paragraph LC string to three paragraphs when new value has two newlines', () => {
  const existing =
    '[doc]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\n' +
    '\n' +
    'The second paragraph \\\n' +
    'also has some content."""\n';

  const value = parse(existing);
  value.doc.text = 'First paragraph content.\n\nSecond paragraph content.\n\nThird paragraph content.';
  const patched = patch(existing, value);

  // Three paragraphs separated by blank lines. Each paragraph is packed independently.
  // "First paragraph content." fits on one line so it has no backslash (paragraph end).
  // "Second paragraph content." splits into two LC lines then a blank.
  // "Third paragraph content." fits on one line as the global tail.
  expect(patched).toEqual(
    '[doc]\n' +
    'text = """\\' + '\n' +
    'First paragraph content.\n' +
    '\n' +
    'Second paragraph \\\n' +
    'content.\n' +
    '\n' +
    'Third paragraph content."""\n'
  );
  expect(parse(patched).doc.text).toEqual('First paragraph content.\n\nSecond paragraph content.\n\nThird paragraph content.');
});

test('should preserve literal single line break style when original uses real line breaks', () => {
  const existing =
    '[description]\n' +
    'text = """\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\n' +
    '\n' +
    'And then what?\n' +
    'Nothing, really."""\n';

  const value = parse(existing);
  value.description.text = 'The quick brown fox jumps over the lazy dog.\n\nAnd then what?\nNothing, really, but you know.';
  const patched = patch(existing, value);

  // Original style uses real line breaks (including a single line break after '?').
  // Preserve that style and avoid introducing \n escapes when a literal line break can
  // represent the same value naturally.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\n' +
    '\n' +
    'And then what?\n' +
    'Nothing, really, but you \\\n' +
    'know."""\n'
  );
  expect(parse(patched).description.text).toEqual(
    'The quick brown fox jumps over the lazy dog.\n\nAnd then what?\nNothing, really, but you know.'
  );
});

test('should preserve spaced blank line and avoid orphan continuation line when patching quick to swift', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\\n' +
    '  jumps over the lazy dog.\n' +
    '  \n' +
    '  Then it jumped into the river."""\n';

  const value = parse(existing);
  value.description.text = value.description.text.replace('quick', 'swift');
  const patched = patch(existing, value);

  // Keep paragraph style and whitespace-only separator line from original. The second
  // logical line should not create an orphan `  \\` continuation line.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The swift brown fox jumps over \\\n' +
    '  the lazy dog.\n' +
    '  \n' +
    '  Then it jumped into the river."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.\n  \n  Then it jumped into the river.');
});

test('should handle massive underflow from many segments to one word', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  one \\' + '\n' +
    '  two \\' + '\n' +
    '  three \\' + '\n' +
    '  four \\' + '\n' +
    '  five."""\n';

  const value = parse(existing);
  value.description.text = 'hi.';
  const patched = patch(existing, value);

  // Collapses to a single content line
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  hi."""\n'
  );
  expect(parse(patched).description.text).toEqual('hi.');
});

test('should handle massive overflow from one segment to many words', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  hi."""\n';

  const value = parse(existing);
  // maxLength is 2 ("hi" = 2 chars), so each word gets its own line
  value.description.text = 'aa bb cc dd ee ff';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  aa \\' + '\n' +
    '  bb \\' + '\n' +
    '  cc \\' + '\n' +
    '  dd \\' + '\n' +
    '  ee \\' + '\n' +
    '  ff"""\n'
  );
  expect(parse(patched).description.text).toEqual('aa bb cc dd ee ff');
});

test('should fall back to regular multiline when patching line-continuation string with leading whitespace', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // Leading spaces cannot survive line-continuation format because the `"""\`
  // continuation trims all whitespace (indent + content) on the first content line.
  value.description.text = '  hello world';
  const patched = patch(existing, value);

  // Falls back to regular multiline to preserve the leading spaces
  expect(patched).toEqual(
    '[description]\n' +
    'text = """  hello world"""\n'
  );
  expect(parse(patched).description.text).toEqual('  hello world');
});

test('should fall back to regular multiline when patching line-continuation string with trailing whitespace mismatch', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // Original tail has trailingWs = '' (no trailing space before """).
  // Adding trailing spaces to the new value would be lost because the reassembly
  // inherits the original tail's trailingWs, silently dropping the trailing spaces.
  value.description.text = 'hello world  ';
  const patched = patch(existing, value);

  // Falls back to regular multiline to preserve the trailing spaces
  expect(patched).toEqual(
    '[description]\n' +
    'text = """hello world  """\n'
  );
  expect(parse(patched).description.text).toEqual('hello world  ');
});

test('should fall back to regular multiline when patching line-continuation string with both leading and trailing whitespace', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = '  hello world  ';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """  hello world  """\n'
  );
  expect(parse(patched).description.text).toEqual('  hello world  ');
});

test('should fall back to regular multiline when patching line-continuation string with a single space', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = ' ';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """ """\n'
  );
  expect(parse(patched).description.text).toEqual(' ');
});

test('should preserve line-continuation when trailing space count matches original tail', () => {
  // The original tail segment has trailingWs = ' ' (one space before \).
  // A new value that also ends with exactly one space should stay in
  // line-continuation format because the tail's trailingWs matches.
  const existing =
    'tbl = {\n' +
    '       val = """\\' + '\n' +
    '       Hello \\' + '\n' +
    '       """\n' +
    '}\n';

  const value = parse(existing);
  expect(value.tbl.val).toEqual('Hello ');

  value.tbl.val = 'Goodbye ';
  const patched = patch(existing, value);

  // Stays in line-continuation format
  expect(patched).toEqual(
    'tbl = {\n' +
    '       val = """\\' + '\n' +
    '       Goodbye \\' + '\n' +
    '       """\n' +
    '}\n'
  );
  expect(parse(patched).tbl.val).toEqual('Goodbye ');
});

test('should fall back when removing trailing space from value that originally had one', () => {
  // Original value has a trailing space ("Hello "). Patching to a value without
  // trailing space would still inject the original tail's trailingWs, corrupting the value.
  const existing =
    'tbl = {\n' +
    '       val = """\\' + '\n' +
    '       Hello \\' + '\n' +
    '       """\n' +
    '}\n';

  const value = parse(existing);
  expect(value.tbl.val).toEqual('Hello ');

  value.tbl.val = 'Goodbye';
  const patched = patch(existing, value);

  // Falls back to regular multiline — otherwise tail trailingWs would add a space
  expect(patched).toEqual(
    'tbl = {\n' +
    '       val = """Goodbye"""\n' +
    '}\n'
  );
  expect(parse(patched).tbl.val).toEqual('Goodbye');
});

test('should preserve earlier lines when only the end of a line-continuation string is removed', () => {
  // Removing the last word "Sup" from a 3-line LC string should keep lines 1 and 2
  // exactly as they were, not re-flow the whole string.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog. \\\n' +
    'Sup"""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog. Sup');

  value.description.text = 'The quick brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // Line 1 ("The quick brown fox \") must stay unchanged.
  // Line 2 loses its trailing space and backslash, becoming the tail.
  // "Sup" is removed entirely.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The quick brown fox jumps over the lazy dog.');
});

test('should preserve earlier lines when the last word of a continuation string is replaced', () => {
  // Replacing just the last word keeps the unchanged leading lines intact.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\\\n' +
    'Sup"""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.Sup');

  value.description.text = 'The quick brown fox jumps over the lazy dog.End';
  const patched = patch(existing, value);

  // Line 1 ("The quick brown fox \") stays unchanged.
  // "Sup" on line 3 is replaced with "End".
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\\\n' +
    'End"""\n'
  );
  expect(parse(patched).description.text).toEqual('The quick brown fox jumps over the lazy dog.End');
});

// Underflow tests — guard against words from later (longer) lines being pulled up into
// earlier (shorter) lines when a minimal change is made, caused by maxLength being
// measured from the longest line in the original string.

test('should not reflow later lines when replacing a same-length word on a short first line', () => {
  // maxLength is determined by the long second line ("The quick brown fox." = 20).
  // Line 1 is intentionally kept short by the original author.
  // Swapping "Hi" for same-length "Yo" should only touch line 1.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'Hi \\' + '\n' +
    'The quick brown fox."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('Hi The quick brown fox.');

  value.description.text = 'Yo The quick brown fox.';
  const patched = patch(existing, value);

  // Only the first word changes — "The quick brown fox." must stay on line 2 unchanged.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'Yo \\' + '\n' +
    'The quick brown fox."""\n'
  );
  expect(parse(patched).description.text).toEqual('Yo The quick brown fox.');
});

test('should not reflow later lines when adding one character to a short first word', () => {
  // maxLength is 22 (from the long second line "very long line indeed." = 22).
  // Adding one char to "A" (→ "An") should only affect line 1 — not pull words
  // from line 2 up to fill the now-slightly-larger available space on line 1.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'A \\' + '\n' +
    'very long line indeed."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('A very long line indeed.');

  value.description.text = 'An very long line indeed.';
  const patched = patch(existing, value);

  // Only the first word changes — the second line must remain untouched.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'An \\' + '\n' +
    'very long line indeed."""\n'
  );
  expect(parse(patched).description.text).toEqual('An very long line indeed.');
});

test('should not pull words from line 3 when shrinking a word on line 2', () => {
  // maxLength is 24 (from the third line "jumps over the lazy dog." = 24).
  // Prefix preservation keeps line 1 intact. The remainder ("red fox ...") would
  // be repacked at maxLength=24, absorbing words from line 3 onto line 2.
  // Replacing "brown" (5 chars) with "red" (3 chars) should only change line 2.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick \\' + '\n' +
    'brown fox \\' + '\n' +
    'jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The quick red fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // Line 1 preserved, only "brown" → "red" on line 2, line 3 untouched.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick \\' + '\n' +
    'red fox \\' + '\n' +
    'jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The quick red fox jumps over the lazy dog.');
});

test('should not absorb words from line 3 when swapping a same-length word on line 2', () => {
  // maxLength is 15 (from the third line "fox jumps over." = 15).
  // "green fox jumps" (15) fits exactly in maxLength, so the greedy packer would
  // absorb "fox jumps" from line 3 onto line 2, leaving only "over." alone.
  // "brown" → "green" is an exact same-length swap — no lines should reflow.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick \\' + '\n' +
    'brown \\' + '\n' +
    'fox jumps over."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over.');

  value.description.text = 'The quick green fox jumps over.';
  const patched = patch(existing, value);

  // Line 1 preserved, only "brown" → "green" on line 2, line 3 untouched.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick \\' + '\n' +
    'green \\' + '\n' +
    'fox jumps over."""\n'
  );
  expect(parse(patched).description.text).toEqual('The quick green fox jumps over.');
});

test('should normalize mixed line endings in new value to the document line ending (CRLF doc, LF value)', () => {
  // The document uses CRLF. The caller supplies a value whose newlines are bare LF.
  // generate.ts normalises value newlines to the document's line ending before
  // passing to rebuildLineContinuation, so the output must use CRLF throughout.
  const crlf = '\r\n';
  const existing =
    '[description]\r\n' +
    'text = """\\\r\n' +
    '  The quick brown fox \\\r\n' +
    '  jumps over the lazy dog."""\r\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  // New value contains bare LF newlines (simulating a value received from a
  // cross-platform source that doesn't match the document's CRLF endings).
  value.description.text = 'Hello\nworld';
  const patched = patch(existing, value);

  // The patched output must not contain any bare LF — every newline is CRLF.
  expect(patched).not.toMatch(/(?<!\r)\n/);
  expect(patched).toEqual(
    '[description]\r\n' +
    'text = """\\\r\n' +
    '  Hello\\nworld"""\r\n'
  );
  expect(parse(patched).description.text).toEqual('Hello\nworld');
});

test('should normalize mixed line endings in new value to the document line ending (LF doc, CRLF value)', () => {
  // The document uses LF. The caller supplies a value whose newlines are CRLF.
  // The output must use LF throughout.
  const existing =
    '[description]\n' +
    'text = """\\\n' +
    '  The quick brown fox \\\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  // New value contains CRLF newlines.
  value.description.text = 'Hello\r\nworld';
  const patched = patch(existing, value);

  // The patched output must not contain any CRLF — every newline is bare LF.
  expect(patched).not.toContain('\r\n');
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\\n' +
    '  Hello\\nworld"""\n'
  );
  expect(parse(patched).description.text).toEqual('Hello\nworld');
});

test('should normalize mixed line endings in the document itself (CRLF doc, bare LF inside LC string body)', () => {
  // A TOML file with mixed line endings: the document is CRLF but the LC string
  // body contains bare LF lines. The patcher normalises existingRaw to the
  // detected document newline before parsing segments, so the patched output
  // uses CRLF consistently and the LC structure is preserved.
  const existing =
    '[description]\r\n' +
    'text = """\\' + '\r\n' +
    '  The quick brown fox \\' + '\n' + // bare LF — mixed!
    '  jumps over the lazy dog."""\r\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The slow brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // Output is fully CRLF and the second line is preserved verbatim.
  expect(patched).not.toMatch(/(?<!\r)\n/);
  expect(patched).toEqual(
    '[description]\r\n' +
    'text = """\\' + '\r\n' +
    '  The slow brown fox \\' + '\r\n' +
    '  jumps over the lazy dog."""\r\n'
  );
  expect(parse(patched).description.text).toEqual('The slow brown fox jumps over the lazy dog.');
});

test('should normalize mixed line endings in the document itself (LF doc, CRLF opening line in LC string)', () => {
  // A TOML file where the LC opening line uses CRLF but the rest of the document
  // uses bare LF. After normalization the output is fully LF.
  const existing =
    '[description]\n' +
    'text = """\\' + '\r\n' + // CRLF after opening — mixed!
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The slow brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // Output is fully LF and the second line is preserved verbatim.
  expect(patched).not.toContain('\r\n');
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The slow brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The slow brown fox jumps over the lazy dog.');
});

// Edge cases that exercise boundary conditions in the packing and reassembly logic.
// These specifically guard against regressions if assumptions about dead code paths
// inside rebuildLineContinuation are ever invalidated.

test('should handle value starting with a tab character in line-continuation format', () => {
  // Tabs are escaped to \\t before reaching the packing loop, so the escaped value
  // starts with a backslash (\\), not a space. This tests that the indent regex
  // handles non-tab/space first characters correctly and that the leading-space
  // guard doesn't misfire on escaped whitespace characters.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = '\thello world';
  const patched = patch(existing, value);

  // Tab is escaped to \t in basic strings, so it stays in line-continuation format
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  \\thello world"""\n'
  );
  expect(parse(patched).description.text).toEqual('\thello world');
});

test('should handle value with escaped backslash at the very start in line-continuation format', () => {
  // The escaped value starts with "\\\\" (doubled backslash), not whitespace.
  // Tests that the indent regex correctly parses lines starting with non-indent chars.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = '\\start and end\\';
  const patched = patch(existing, value);

  // Backslashes are doubled in basic strings; no leading space so stays in line-continuation
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  \\\\start and end\\\\"""\n'
  );
  expect(parse(patched).description.text).toEqual('\\start and end\\');
});

test('should repack many words across multiple lines without corrupting spaces', () => {
  // Tests the packing loop boundary: after each inner-loop break, the next
  // outer iteration must land on a word token (not a space). With many words
  // being repacked across many lines, this exercises the token pointer advancement
  // across multiple break-and-resume cycles.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  abcdef \\' + '\n' +
    '  ghijkl."""\n';

  const value = parse(existing);
  // maxLength is 6, so each word pair gets its own line
  value.description.text = 'aa bb cc dd ee ff gg hh ii jj';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  aa bb \\' + '\n' +
    '  cc dd \\' + '\n' +
    '  ee ff \\' + '\n' +
    '  gg hh \\' + '\n' +
    '  ii jj"""\n'
  );
  expect(parse(patched).description.text).toEqual('aa bb cc dd ee ff gg hh ii jj');
});

test('should preserve trailing space in value when tail prototype has matching trailing space', () => {
  // The Original tail segment has trailingWs = ' ' (1 space before \).
  // New value also ends with exactly 1 space — must survive round-trip.
  // This directly tests that the tail trailing-WS assignment path works correctly
  // after the removal of the redundant /\s$/ suppression check.
  const existing =
    '[cfg]\n' +
    'val = """\\' + '\n' +
    '  word1 \\' + '\n' +
    '  word2 \\' + '\n' +
    '  word3 \\' + '\n' +
    '  """\n';

  const value = parse(existing);
  // Decoded: "word1 word2 word3 " (trailing space from last segment's trailingWs)
  expect(value.cfg.val).toEqual('word1 word2 word3 ');

  value.cfg.val = 'aaa bbb ccc ddd ';
  const patched = patch(existing, value);

  // Must stay in line-continuation format AND preserve the trailing space.
  // maxLength is 5 (from "word1"), so each word gets its own line.
  expect(patched).toEqual(
    '[cfg]\n' +
    'val = """\\' + '\n' +
    '  aaa \\' + '\n' +
    '  bbb \\' + '\n' +
    '  ccc \\' + '\n' +
    '  ddd \\' + '\n' +
    '  """\n'
  );
  expect(parse(patched).cfg.val).toEqual('aaa bbb ccc ddd ');
});

test('should handle double spaces at line boundaries during repacking', () => {
  // Double-space runs at a break point become trailing whitespace before the
  // backslash. Tests that the packing loop handles space-run tokens at the exact
  // boundary where a break occurs, and that the reassembly doesn't double-add
  // whitespace or corrupt the content.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  abcd \\' + '\n' +
    '  efgh."""\n';

  const value = parse(existing);
  // maxLength is 4, double spaces between each word
  value.description.text = 'aa  bb  cc  dd';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  aa  \\' + '\n' +
    '  bb  \\' + '\n' +
    '  cc  \\' + '\n' +
    '  dd"""\n'
  );
  expect(parse(patched).description.text).toEqual('aa  bb  cc  dd');
});

// Content integrity invariant: for ANY value, patching and then parsing must
// recover exactly the value that was set. This catches silent data corruption
// regardless of which internal format (line-continuation vs regular multiline)
// is chosen by the formatter.
describe('line-continuation content integrity', () => {
  const lineContinuationDoc =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  test.each([
    ['simple words', 'hello world'],
    ['leading space', ' hello world'],
    ['trailing space', 'hello world '],
    ['leading and trailing spaces', ' hello world '],
    ['multiple leading spaces', '   hello world'],
    ['multiple trailing spaces', 'hello world   '],
    ['all spaces', '     '],
    ['single space', ' '],
    ['empty string', ''],
    ['single character', 'x'],
    ['tab character', '\thello'],
    ['escaped backslash', 'C:\\Users\\Alice'],
    ['triple quotes', 'uses """triple""" quotes'],
    ['very long value', 'a '.repeat(100).trim()],
    ['no spaces at all', 'abcdefghijklmnopqrstuvwxyz'],
    ['double spaces between words', 'hello  world  foo'],
    ['only non-breaking content', '!!@@##$$%%'],
  ])('round-trips correctly: %s', (_label, newValue) => {
    const value = parse(lineContinuationDoc);
    value.description.text = newValue;
    const patched = patch(lineContinuationDoc, value);

    // THE INVARIANT: parsed content must exactly match what was set
    expect(parse(patched).description.text).toEqual(newValue);
  });
});

// Parameterized tests for both basic (""") and literal (''') multiline strings
describe('multiline strings - both basic and literal', () => {
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
    const existing = `[package]\r\nname = "example"\r\ndescription = ${delimiter}\r\nA simple package\r\n${delimiter}\r\nversion = "1.0.0"\r\n`;

    const obj = parse(existing);
    obj.package.description = "A different description";
    const patched = patch(existing, obj);
    
    const expectedOutput = `[package]\r\nname = "example"\r\ndescription = ${delimiter}\r\nA different description${delimiter}\r\nversion = "1.0.0"\r\n`;

    expect(patched).toEqual(expectedOutput);
  });
});

// Specific tests for literal multiline strings (''') - testing literal behavior
describe('literal multiline strings - specific behavior', () => {
  test('should preserve literal multiline string without escaping backslashes', () => {
    const existing = dedent`
      [package]
      name = "example"
      path = '''
      C:\\Users\\Example\\Path
      '''
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    // When setting a JavaScript string with single backslashes
    obj.package.path = "D:\\Data\\Files";
    const patched = patch(existing, obj);
    
    // In literal strings, backslashes are NOT doubled - they remain as single backslashes
    const expectedOutput = dedent`
      [package]
      name = "example"
      path = '''
      D:\Data\Files'''
      version = "1.0.0"
      ` + '\n';

    expect(patched).toEqual(expectedOutput);
  });

  test('should handle literal multiline string with actual newlines vs escape sequences', () => {
    const existing = dedent`
      [package]
      name = "example"
      text = '''
      Old text
      '''
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    // Setting a JavaScript string that contains the characters \ and n
    obj.package.text = "Line with \\n literal backslash-n";
    const patched = patch(existing, obj);
    
    // Literal strings show backslash-n as actual characters (not newline)
    // In the template we need to escape the backslash as \\n
    const expectedOutput = `[package]
name = "example"
text = '''
Line with \\n literal backslash-n'''
version = "1.0.0"
`;

    expect(patched).toEqual(expectedOutput);
  });

  test('should handle literal multiline string with triple quotes in content', () => {
    const existing = dedent`
      [package]
      name = "example"
      text = '''Old text'''
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    // Literal strings cannot contain ''' so it should convert to basic string
    obj.package.text = "Text with ''' quotes";
    const patched = patch(existing, obj);
    
    // Should convert from literal (''') to basic (""")
    // Note: ''' doesn't need escaping in basic strings, only """ needs escaping
    const expectedOutput = `[package]
name = "example"
text = """Text with ''' quotes"""
version = "1.0.0"
`;

    expect(patched).toEqual(expectedOutput);
  });

  test('should NOT add leading newline when converting literal string with newline in middle', () => {
    const existing = dedent`
      [package]
      name = "example"
      text = '''line one
      line two'''
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    // Change value to require conversion to basic string
    obj.package.text = "has ''' quotes";
    const patched = patch(existing, obj);
    
    // Should convert to basic string WITHOUT leading newline
    // (the original literal string had newline in content, not at the start)
    const expectedOutput = `[package]
name = "example"
text = """has ''' quotes"""
version = "1.0.0"
`;

    expect(patched).toEqual(expectedOutput);
  });

  test('should preserve leading newline when converting literal string with leading newline', () => {
    const existing = dedent`
      [package]
      name = "example"
      text = '''
      Old text
      '''
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    // Change value to require conversion to basic string
    obj.package.text = "New with ''' quotes";
    const patched = patch(existing, obj);
    
    // Should convert to basic string WITH leading newline
    const expectedOutput = `[package]
name = "example"
text = """
New with ''' quotes"""
version = "1.0.0"
`;

    expect(patched).toEqual(expectedOutput);
  });
});


test('should patch example with removal of an array element', () => {
  const existing = dedent`
  baseUrl = "https://example.com/"
  languageCode = "en-us"
  languageLang = "en"
  title = "this is the title"
  DefaultContentLanguage = "en"
  disableLanguages = ["he", "hu", "zh", "nb", "da", "ro", "do", "fi"]
  ` + '\n';

  let value = parse(existing)


  // Remove the first element from the array
  removeFromArray(value.disableLanguages, ['he']);

  const patched = (patch(existing, value));

  let expectedOutput = dedent`
    baseUrl = "https://example.com/"
    languageCode = "en-us"
    languageLang = "en"
    title = "this is the title"
    DefaultContentLanguage = "en"
    disableLanguages = ["hu", "zh", "nb", "da", "ro", "do", "fi"]
    ` + '\n';
  
  expect(patched).toEqual(expectedOutput);
});



test('should patch example with multiple removals of an array element', () => {

  
  const existing = dedent`
  x = ["a", "bee", "cee", "dee", "e", "f", "g", "h", "i", "j"]
  ` + '\n';

  let value = parse(existing)
  
  removeFromArray(value.x, ['a', 'cee', 'f']);
  

  const patched = (patch(existing, value));

  let expectedOutput = dedent`
    x = ["bee", "dee", "e", "g", "h", "i", "j"]
    ` + '\n';
  
  expect(patched).toEqual(expectedOutput);
});

// Remove specific elements from an array
function removeFromArray(array: any[], elementsToRemove: any[]) {
  for (let i = 0; i < array.length; i++) {
    if (elementsToRemove.includes(array[i])) {
      array.splice(i, 1);
      i--;
    }
  }
}


test('should patch example with removal of an inline-table element', () => {
  const existing = dedent`
    [project]
    name = "Simple"
    version = "0.0.0"
    authors = ["Joe Bloggs"]
    target = { type = "xlsm", path = "../../targets/xlsm", test = "test" }
  ` + '\n';

  let value = parse(existing)


  // Remove the first element from the inline-table
  removeFromObject(value.project.target, ['type']);

  const patched = (patch(existing, value));

  let expectedOutput = dedent`
    [project]
    name = "Simple"
    version = "0.0.0"
    authors = ["Joe Bloggs"]
    target = { path = "../../targets/xlsm", test = "test" }
    ` + '\n';
  
  expect(patched).toEqual(expectedOutput);
});


function removeFromObject(obj: any, keysToRemove: string[]) {
  for (const key of keysToRemove) {
    delete obj[key];
  }
}

test('should patch example of modification of an inline-table element', () => {
  const existing = dedent`
    [project]
    name = "Simple"
    version = "0.0.0"
    authors = ["Joe Bloggs"]
    target = { type = "xlsm", path = "targets/xlsm" }
  ` + '\n';

  let value = parse(existing)
  // Change the path to be "target/xlsm"
  value.project.target.path = "../../target/xlsm";

  const patched = (patch(existing, value));
  let expectedOutput = dedent`
    [project]
    name = "Simple"
    version = "0.0.0"
    authors = ["Joe Bloggs"]
    target = { type = "xlsm", path = "../../target/xlsm" }
    ` + '\n';
  expect(patched).toEqual(expectedOutput);
});

// Regression guard for the cast `existing.item as KeyValue` inside the
// `isInlineItem(existing) && isKeyValue(existing.item) && isKeyValue(replacement)` branch
// of applyChanges (condition 3).
//
// Condition 3 fires when:
//   - `existing` (from the original AST) is an InlineItem<KeyValue>  — i.e. a named key
//     inside a root-level inline table such as `target = { type = "xlsm", path = "…" }`
//   - `replacement` (from parseJS on the updated object) is a bare KeyValue  — because
//     `formatTopLevel` in parseJS promotes root-level objects to block [table] sections.
//
// NOTE: Inline *array* items (e.g. arr = [1, 2, 3]) do NOT hit this branch.
// For those, `findByPath` returns InlineItem<Integer>, but `replacement` is also
// InlineItem<Integer> (parseJS keeps arrays inline), so `isKeyValue(replacement)` is
// false and the code falls through to the `else` branch instead.  A separate test
// below covers that path.
test('should edit a value inside a root-level inline table (exercises InlineItem→KeyValue cast)', () => {
  const existing = dedent`
    target = { type = "xlsm", path = "targets/xlsm" }
    ` + '\n';

  const value = parse(existing);
  value.target.path = 'out/xlsm';

  const patched = patch(existing, value);

  expect(patched).toEqual(dedent`
    target = { type = "xlsm", path = "out/xlsm" }
    ` + '\n');
});

// Verifies that editing an element of an inline array is handled by the `else`
// branch of applyChanges (not by the InlineItem→KeyValue cast branch above).
// Both `existing` and `replacement` are InlineItem<Integer>, so no KeyValue cast occurs.
test('should edit an element of a root-level inline array', () => {
  const existing = dedent`
    arr = [1, 2, 3]
    ` + '\n';

  const value = parse(existing);
  value.arr[0] = 99;

  const patched = patch(existing, value);

  expect(patched).toEqual(dedent`
    arr = [99, 2, 3]
    ` + '\n');
});

// Verifies that an array written across multiple lines is edited correctly
// and that the per-line spacing and indentation are preserved.
test('should edit an element of an array written on separate lines', () => {
  const existing = dedent`
    arr = [
      1,
      2,
      3,
    ]
    ` + '\n';

  const value = parse(existing);
  value.arr[0] = 99;

  const patched = patch(existing, value);

  expect(patched).toEqual(dedent`
    arr = [
      99,
      2,
      3,
    ]
    ` + '\n');
});

// Verifies that editing a key inside an inline table that is an element of an
// array written on separate lines works correctly.
// Previously this threw "Node not found at arr.2.a" because findByPath could
// not traverse into InlineItem<InlineTable> — it only handled InlineItem<KeyValue>.
test('should edit a key inside an inline table element of an array written on separate lines', () => {
  const existing = dedent`
    arr = [
      {a = 1 },
      {a = 2 },
      {a = 3 },
    ]
    ` + '\n';

  const value = parse(existing);
  value.arr[2]['a'] = 4;

  const patched = patch(existing, value);

  expect(patched).toEqual(dedent`
    arr = [
      {a = 1 },
      {a = 2 },
      {a = 4 },
    ]
    ` + '\n');
});

test('should replace an inline table element of an array written on separate lines', () => {
  const existing = dedent`
    arr = [
      {a = 1 },
      {a = 2 },
      {a = 3 },
    ]
    ` + '\n';

  const value = parse(existing);
  value.arr[2] = 4;

  const patched = patch(existing, value);

  expect(patched).toEqual(dedent`
    arr = [
      {a = 1 },
      {a = 2 },
      4,
    ]
    ` + '\n');
});

// This complex example includes a replacement from Inline-Table to single string
test('should patch complex vba-block example', () => {
  const existing = dedent`
    [project]
    name = "complex"
    version = "0.0.0"
    authors = [ "Tim Hall" ]
    target = { type = "xlsm", path = "targets/xlsm" }

    [src]
    ThisWorkbook = "src/ThisWorkbook.cls"
    Sheet1 = "src/Sheet1.cls"
    Sheet2 = "src/Sheet2.cls"
    Sheet3 = "src/Sheet3.cls"
    UserForm1 = { path = "src/UserForm1.frm", binary = "src/UserForm1.frx" }
    Validation = "src/Validation.bas"
    Class1 = "src/Class1.cls"

    [dependencies]
    web = "^4"
  ` + '\n';

  const jsonString = dedent`
  {
    "project": {
        "name": "complex",
        "version": "0.0.0",
        "authors": [
            "Tim Hall"
        ],
        "target": {
            "type": "xlsm",
            "path": "targets/xlsm"
        }
    },
    "src": {
        "ThisWorkbook": "src/ThisWorkbook.cls",
        "Sheet1": "src/Sheet1.cls",
        "Sheet2": "src/Sheet2.cls",
        "Sheet3": "src/Sheet3.cls",
        "UserForm1": "src/UserForm1.frm",
        "Class1": "src/Class1.cls",
        "Added": "src/Added.bas"
    },
    "dependencies": {
        "web": "^4"
    },
    "references": {
        "VBIDE": {
            "version": "5.3",
            "guid": "{0002E157-0000-0000-C000-000000000046}"
        }
    }
  }
  `

  let changed = JSON.parse(jsonString)

  const patched = (patch(existing, changed));
  let expectedOutput = dedent`
    [project]
    name = "complex"
    version = "0.0.0"
    authors = [ "Tim Hall" ]
    target = { type = "xlsm", path = "targets/xlsm" }

    [src]
    ThisWorkbook = "src/ThisWorkbook.cls"
    Sheet1 = "src/Sheet1.cls"
    Sheet2 = "src/Sheet2.cls"
    Sheet3 = "src/Sheet3.cls"
    UserForm1 = "src/UserForm1.frm"
    Class1 = "src/Class1.cls"
    Added = "src/Added.bas"

    [dependencies]
    web = "^4"

    [references]
    VBIDE = { version = "5.3", guid = "{0002E157-0000-0000-C000-000000000046}" }
` + '\n';

  expect(patched).toEqual(expectedOutput);
});

test('should patch example without introducing trailing comma', () => {
  const existing = dedent`
    [db.pooler]
    enabled = false
    ` + '\n';

  const newObject = {
    db: {
      pooler: {
        enabled: true
      }
    }
  };

  const patched = patch(existing, newObject);

  let expectedOutput = dedent`
    [db.pooler]
    enabled = true
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
});

test('should allow to add an element to an inline-table', () => {
  const existing = dedent`
    [project]
    name = "Simple"
    version = "0.0.0"
    authors = ["Joe Bloggs"]
    target = { type = "xlsm", path = "targets/xlsm" }
  ` + '\n';

  let value = parse(existing)
  // Add a new element to the inline-table
  value.project.target.test = "test";

  const patched = (patch(existing, value));
  let expectedOutput = dedent`
    [project]
    name = "Simple"
    version = "0.0.0"
    authors = ["Joe Bloggs"]
    target = { type = "xlsm", path = "targets/xlsm", test = "test" }
    ` + '\n';
  expect(patched).toEqual(expectedOutput);
});

//Ref: https://github.com/nunocoracao/blowfish-tools/issues/77
test('should allow to add elements to a unexisting inline-table', () => {
  const existing = dedent`
    disabled = false
    languageCode = "en"
    languageName = "English"
    weight = 1
    title = "Blowfish"
   
    [params]
    displayName = "EN"
    isoCode = "en"
    rtl = false
    dateFormat = "2 January 2006"    
  ` + '\n';

  let value = parse(existing)
  // Add a new element to the inline-table
  value.params.author = { name: "Abel" };
  value.params.author["image"] = "me.jpg";

  const patched = (patch(existing, value));
  let expectedOutput = dedent`
    disabled = false
    languageCode = "en"
    languageName = "English"
    weight = 1
    title = "Blowfish"

    [params]
    displayName = "EN"
    isoCode = "en"
    rtl = false
    dateFormat = "2 January 2006"
    author = { name = "Abel", image = "me.jpg" }
    ` + '\n';
  expect(patched).toEqual(expectedOutput);
});

//Ref: https://github.com/toml-rs/toml/issues/163
test('dotted key-values should keep the order', () => {
  const existing = dedent`
  hello.world = "a"
  goodbye = "b"
  hello.moon = "c"
  ` + '\n';

  const value = parse(existing);
  value.hello.world = "a1";
  value.goodbye = "b2";
  value.hello.moon = "c3";

  const patched = patch(existing, value);
  let expectedOutput = dedent`
  hello.world = "a1"
  goodbye = "b2"
  hello.moon = "c3"
  ` + '\n';
  expect(patched).toEqual(expectedOutput);
});

test('should patch example without introducing trailing comma', () => {
  const existing = dedent`
    [db.pooler]
    enabled = false
    # Port to use for the local connection pooler.
    port = 54329
    ` + '\n';

  const newObject = parse(existing);
  newObject.db.pooler.enabled = true;
  const patched = patch(existing, newObject);

  let expectedOutput = dedent`
    [db.pooler]
    enabled = true
    # Port to use for the local connection pooler.
    port = 54329
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
});

test('should correctly add new sections', () => {
  // Test case based on a reported issue where adding new sections would result in incorrect TOML formatting
  const existing = dedent`
    project_id = "xxxxxxxxxxx"

    [auth]
    enabled = true
    site_url = "https://siteurl.com"
    additional_redirect_urls = ["http://127.0.0.1:8080", "https://127.0.0.1:8080", "http://localhost:8080", "https://localhost:8080"]

    [auth.external.github]
    enabled = true
    client_id = "env(GITHUB_OAUTH_CLIENT_ID)"
    secret = "env(GITHUB_OAUTH_CLIENT_SECRET)"
    redirect_uri = "http://localhost:54321/auth/v1/callback"
    ` + '\n';

  // Parse the existing TOML
  const value = parse(existing);
  
  // Add the new sections
  value.edge_runtime = { policy: "per_worker" };
  value.db = { pooler: { enabled: true, pool_mode: "transaction" } };

  // Apply the patch
  const patched = patch(existing, value);

  // Expected result should maintain the original structure plus add the new sections
  const expectedOutput = dedent`
    project_id = "xxxxxxxxxxx"

    [auth]
    enabled = true
    site_url = "https://siteurl.com"
    additional_redirect_urls = ["http://127.0.0.1:8080", "https://127.0.0.1:8080", "http://localhost:8080", "https://localhost:8080"]

    [auth.external.github]
    enabled = true
    client_id = "env(GITHUB_OAUTH_CLIENT_ID)"
    secret = "env(GITHUB_OAUTH_CLIENT_SECRET)"
    redirect_uri = "http://localhost:54321/auth/v1/callback"

    [edge_runtime]
    policy = "per_worker"

    [db]
    pooler = {enabled = true, pool_mode = "transaction"}
    ` + '\n';
  
  expect(patched).toEqual(expectedOutput);
});

// Tests for trailing newline preservation
test('should preserve no trailing newlines', () => {
  const existing = dedent`
    [project]
    name = "test"
    version = "1.0.0"`;

  const value = parse(existing);
  value.project.author = "John Doe";

  const patched = patch(existing, value);

  const expectedOutput = dedent`
    [project]
    name = "test"
    version = "1.0.0"
    author = "John Doe"`;

  expect(patched).toEqual(expectedOutput);
  expect(patched.endsWith('\n')).toBe(false);
});

test('should preserve single trailing newline', () => {
  const existing = dedent`
    [project]
    name = "test"
    version = "1.0.0"
    ` + '\n';

  const value = parse(existing);
  value.project.author = "John Doe";

  const patched = patch(existing, value);

  const expectedOutput = dedent`
    [project]
    name = "test"
    version = "1.0.0"
    author = "John Doe"
    ` + '\n';

  expect(patched).toEqual(expectedOutput);
  expect(patched.endsWith('\n')).toBe(true);
  expect(patched.endsWith('\n\n')).toBe(false);
});

test('should preserve multiple trailing newlines', () => {
  const existing = dedent`
    [project]
    name = "test"
    version = "1.0.0"
    ` + '\n\n\n';

  const value = parse(existing);
  value.project.author = "John Doe";

  const patched = patch(existing, value);

  const expectedOutput = dedent`
    [project]
    name = "test"
    version = "1.0.0"
    author = "John Doe"
    ` + '\n\n\n';

  expect(patched).toEqual(expectedOutput);
  
  // Count trailing newlines properly
  function countTrailingNewlines(str: string) {
    let count = 0;
    for (let i = str.length - 1; i >= 0; i--) {
      if (str[i] === '\n') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }
  
  expect(countTrailingNewlines(patched)).toBe(3);
});

test('should preserve CRLF line endings and trailing newlines', () => {
  const existing = '[project]\r\nname = "test"\r\nversion = "1.0.0"\r\n\r\n';

  const value = parse(existing);
  value.project.author = "John Doe";

  const patched = patch(existing, value);

  expect(patched).toContain('\r\n');
  expect(patched.endsWith('\r\n\r\n')).toBe(true);
  
  // Count trailing CRLF sequences
  let count = 0;
  let pos = patched.length;
  while (pos >= 2 && patched.substring(pos - 2, pos) === '\r\n') {
    count++;
    pos -= 2;
  }
  expect(count).toBe(2);
});

test('should preserve exact trailing newline count with complex changes', () => {
  const existing = dedent`
    [database]
    server = "192.168.1.1"
    ports = [ 8001, 8001, 8002 ]
    connection_max = 5000
    enabled = true
    
    [servers]
    
    [servers.alpha]
    ip = "10.0.0.1"
    dc = "eqdc10"
    ` + '\n\n\n\n\n';

  const value = parse(existing);
  value.database.server = "192.168.1.100";
  value.database.ports.push(8003);
  value.servers.gamma = { ip: "10.0.0.3", dc: "eqdc11" };

  const patched = patch(existing, value);

  // Should preserve exactly 5 trailing newlines
  function countTrailingNewlines(str: string) {
    let count = 0;
    for (let i = str.length - 1; i >= 0; i--) {
      if (str[i] === '\n') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }
  
  expect(countTrailingNewlines(patched)).toBe(5);
  expect(patched.endsWith('\n\n\n\n\n')).toBe(true);
});

test('should handle edge case with only newlines', () => {
  const existing = '\n\n\n';
  const value = {};
  const patched = patch(existing, value);

  expect(patched).toBe('\n\n\n');
});

test('should handle empty string', () => {
  const existing = '';
  const value = {};
  const patched = patch(existing, value);

  expect(patched).toBe('');
});

test('should handle mixed line endings consistently', () => {
  // File that starts with CRLF but we want to ensure consistency
  const existing = 'title = "test"\r\nversion = "1.0"\r\n\r\n';

  const value = parse(existing);
  value.author = "Test Author";

  const patched = patch(existing, value);

  // Should maintain CRLF throughout and preserve trailing count
  expect(patched).toContain('\r\n');
  expect(patched.endsWith('\r\n\r\n')).toBe(true);
  
  // Count trailing CRLF sequences
  function countTrailingCRLF(str: string) {
    let count = 0;
    let pos = str.length;
    while (pos >= 2 && str.substring(pos - 2, pos) === '\r\n') {
      count++;
      pos -= 2;
    }
    return count;
  }
  
  expect(countTrailingCRLF(patched)).toBe(2);
});

test('should normalize bare LF in new value to CRLF when document uses CRLF', () => {
  // A CRLF document patched with a multiline value that uses bare '\n' must not
  // produce mixed line endings in the output — the '\n' must be upgraded to '\r\n'.
  const existing = '[description]\r\ntext = """\r\nFirst line\r\nSecond line\r\n"""\r\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('First line\r\nSecond line\r\n');

  // New value supplied with bare LF (as a JS developer would naturally write)
  value.description.text = 'Hello world\nand goodbye world\n';
  const patched = patch(existing, value);

  // Output must use CRLF throughout — no bare LF in the patched document
  expect(patched).not.toContain('\r\r\n'); // no double-CR
  expect(patched.split('\r\n').join('').includes('\n')).toBe(false); // no leftover bare LF
  expect(patched).toEqual('[description]\r\ntext = """\r\nHello world\r\nand goodbye world\r\n"""\r\n');
  expect(parse(patched).description.text).toEqual('Hello world\r\nand goodbye world\r\n');
});

test('should normalize CRLF in new value to LF when document uses LF', () => {
  // A LF document patched with a value containing '\r\n' must normalize to bare '\n'.
  const existing = '[description]\ntext = """\nFirst line\nSecond line\n"""\n';

  const value = parse(existing);
  value.description.text = 'Hello world\r\nand goodbye world\r\n';
  const patched = patch(existing, value);

  expect(patched).not.toContain('\r\n');
  expect(patched).toEqual('[description]\ntext = """\nHello world\nand goodbye world\n"""\n');
  expect(parse(patched).description.text).toEqual('Hello world\nand goodbye world\n');
});

test('should keep literal \\n and \\r\\n sequences while normalizing real newlines to CRLF', () => {
  const existing = '[description]\r\ntext = """\r\nFirst line\r\n"""\r\n';

  const value = parse(existing);
  value.description.text = 'literal \\n and literal \\r\\n plus real\nline\r\nend';
  const patched = patch(existing, value);

  expect(patched).toContain('literal \\\\n and literal \\\\r\\\\n plus real');
  expect(patched).toEqual(
    '[description]\r\n' +
    'text = """\r\n' +
    'literal \\\\n and literal \\\\r\\\\n plus real\r\n' +
    'line\r\n' +
    'end"""\r\n'
  );
  expect(parse(patched).description.text).toEqual('literal \\n and literal \\r\\n plus real\r\nline\r\nend');
});

test('should keep literal \\n and \\r\\n sequences while normalizing real newlines to LF', () => {
  const existing = '[description]\ntext = """\nFirst line\n"""\n';

  const value = parse(existing);
  value.description.text = 'literal \\n and literal \\r\\n plus real\r\nline\nend';
  const patched = patch(existing, value);

  expect(patched).toContain('literal \\\\n and literal \\\\r\\\\n plus real');
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\n' +
    'literal \\\\n and literal \\\\r\\\\n plus real\n' +
    'line\n' +
    'end"""\n'
  );
  expect(parse(patched).description.text).toEqual('literal \\n and literal \\r\\n plus real\nline\nend');
});

test('should respect quoted keys when parsing', () => {
  const toml = dedent`
    [dog]
    "tater.man" = { type = { name = "pug" } }
    ` + '\n';

  const result = parse(toml);

  expect(result).toEqual({
    dog: {
      "tater.man": {
        type: {
          name: "pug"
        }
      }
    }
  });
});

test('should respect inlineTableStart setting when creating new top-level objects', () => {
  // Start with a simple document
  const existing = dedent`
    name = "Simple"
    ` + '\n';

  // Add a nested object structure
  const newObject = {
    name: "Simple",
    project: {
      target: {
        type: "xlsm",
        path: "targets/xlsm"
      }
    }
  };

  // Test with inlineTableStart = 0 (should keep everything inline)  
  const patchedInline = patch(existing, newObject, { inlineTableStart: 0 });
  const expectedInline = dedent`
    name = "Simple"
    project = { target = { type = "xlsm", path = "targets/xlsm" } }
    ` + '\n';
  
  expect(patchedInline).toEqual(expectedInline);

  // Test with inlineTableStart = 1 (should create section for project, keep target inline)
  const patchedMixed = patch(existing, newObject, { inlineTableStart: 1 });
  const expectedMixed = dedent`
    name = "Simple"

    [project]
    target = { type = "xlsm", path = "targets/xlsm" }
    ` + '\n';
  
  expect(patchedMixed).toEqual(expectedMixed);

  // Test with inlineTableStart = 2 (should create sections for project and target, but currently has a bug)
  // TODO: Fix the patch function to properly handle deep section creation from scratch
  const patchedSections = patch(existing, newObject, { inlineTableStart: 2 });
  const expectedSections = dedent`
    name = "Simple"

    [project]
    ` + '\n';
  
  expect(patchedSections).toEqual(expectedSections);

});

test('should respect inlineTableStart setting with deeply nested structures', () => {
  // Start with a simple document
  const existing = dedent`
    name = "Simple"
    ` + '\n';

  // Add a deeply nested object structure (2 levels of nesting)
  const newObject = {
    name: "Simple",
    project: {
      build: {
        target: {
          type: "xlsm",
          path: "targets/xlsm"
        },
        config: {
          mode: "release",
          optimization: true
        }
      }
    }
  };

  // Test with inlineTableStart = 0 (should keep everything inline)  
  const patchedInline = patch(existing, newObject, { inlineTableStart: 0 });
  const expectedInline = dedent`
    name = "Simple"
    project = { build = { target = { type = "xlsm", path = "targets/xlsm" }, config = { mode = "release", optimization = true } } }
    ` + '\n';
  
  expect(patchedInline).toEqual(expectedInline);

  // Test with inlineTableStart = 1 (should create section for project, keep build inline)
  const patchedMixed = patch(existing, newObject, { inlineTableStart: 1 });
  const expectedMixed = dedent`
    name = "Simple"

    [project]
    build = { target = { type = "xlsm", path = "targets/xlsm" }, config = { mode = "release", optimization = true } }
    ` + '\n';
  
  expect(patchedMixed).toEqual(expectedMixed);

  // Test with inlineTableStart = 3 (should create separate sections for all levels, but currently has a bug)
  // TODO: Fix patch function for deep section creation from scratch
  const patchedSections = patch(existing, newObject, { inlineTableStart: 3 });
  const expectedSections = dedent`
    name = "Simple"

    [project]
    ` + '\n';
  
  expect(patchedSections).toEqual(expectedSections);

});

test('should add nested objects to existing table sections', () => {
  // Start with an existing table section
  const existing = dedent`
    [project]
    name = "Simple"
    version = "1.0.0"
    ` + '\n';

  // Add a nested object to the existing table
  const newObject = {
    project: {
      name: "Simple",
      version: "1.0.0",
      target: {
        type: "xlsm",
        path: "targets/xlsm"
      }
    }
  };

  // Test current behavior - adds as inline table within existing table section
  const result = patch(existing, newObject, { inlineTableStart: 0 });
  
  // Current behavior: nested object becomes an inline table within the existing table section
  const expected = dedent`
    [project]
    name = "Simple"
    version = "1.0.0"
    target = { type = "xlsm", path = "targets/xlsm" }
    ` + '\n';
  
  expect(result).toEqual(expected);
});

test('should respect inlineTableStart setting when adding nested objects to existing table sections', () => {
  // This test is skipped because the functionality is not yet implemented
  // The current patch logic doesn't support adding nested objects to existing table sections
  
  const existing = dedent`
    [project]
    name = "Simple"
    version = "1.0.0"
    ` + '\n';

  const newObject = {
    project: {
      name: "Simple",
      version: "1.0.0",
      target: {
        type: "xlsm",
        path: "targets/xlsm"
      }
    }
  };

  // Test with inlineTableStart = 0 (should keep everything inline, but existing section preserved)
  const patchedInline = patch(existing, newObject, { inlineTableStart: 0 });
  const expectedInline = dedent`
    [project]
    name = "Simple"
    version = "1.0.0"
    target = { type = "xlsm", path = "targets/xlsm" }
    ` + '\n';
  
  expect(patchedInline).toEqual(expectedInline);

  // Test with inlineTableStart = 2 (should create separate section for target)
  const patchedSections = patch(existing, newObject, { inlineTableStart: 2 });
  const expectedSections = dedent`
    [project]
    name = "Simple"
    version = "1.0.0"

    [project.target]
    type = "xlsm"
    path = "targets/xlsm"
    ` + '\n';
  
  expect(patchedSections).toEqual(expectedSections);
});

test('should respect inlineTableStart setting for deeply nested objects', () => {
  // Future enhancement: when inlineTableStart = 1, 
  // ALL nested objects should be converted to multi-line tables, not just top-level ones
  
  const existing = dedent`
    name = "Simple"
    ` + '\n';

  const newObject = {
    name: "Simple",
    project: {
      target: {
        type: "xlsm",
        path: "targets/xlsm"
      }
    }
  };

  // Test with inlineTableStart = 0 (all inline)
  const patchedInline = patch(existing, newObject, { inlineTableStart: 0 });
  const expectedInline = dedent`
    name = "Simple"
    project = { target = { type = "xlsm", path = "targets/xlsm" } }
    ` + '\n';
  
  expect(patchedInline).toEqual(expectedInline);

  // Test with inlineTableStart = 2 (should create sections for project and target, but currently has a bug)
  // TODO: Fix the patch function to properly handle creation of multiple nested sections from scratch
  const patchedSections = patch(existing, newObject, { inlineTableStart: 2 });
  const expectedSections = dedent`
    name = "Simple"

    [project]
    ` + '\n';
  
  expect(patchedSections).toEqual(expectedSections);
});

test('should patch date by increasing it by one day', () => {
  const existing = dedent`
    # Configuration with date
    name = "Test App"
    created_date = 2024-01-15T10:30:00Z
    
    [settings]
    enabled = true
    ` + '\n';

  const value = parse(existing);
  
  // Get the current date and add one day
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
  // Use a simplified version of the example TOML focusing on the date field
  const existing = dedent`
    title = "TOML Example"

    [owner]
    name = "Tom Preston-Werner"
    dob = 1979-05-27T07:32:00Z # First class dates? Why not?

    [database]
    enabled = true
    ` + '\n';

  const value = parse(existing);
  
  // Get the date of birth and add one day
  const currentDob = value.owner.dob as Date;
  const nextDay = new Date(currentDob);
  nextDay.setDate(nextDay.getDate() + 1);
  
  value.owner.dob = nextDay;

  const patched = patch(existing, value);

  expect(patched).toEqual(dedent`
    title = "TOML Example"

    [owner]
    name = "Tom Preston-Werner"
    dob = 1979-05-28T07:32:00Z     # First class dates? Why not?

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
  
  // Get the current date and add one day using LocalDate
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

test('should upgrade date-only field to datetime when patching with Date that has time components', () => {
  const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_date = 2024-01-15
    
    [venue]
    name = "Convention Center"
    ` + '\n';

  const value = parse(existing);
  
  // Set a date-only field with a Date that has time components
  // This should upgrade the field from date-only to local datetime
  const dateWithTime = new Date('2024-01-16T14:30:00.000Z'); // Has time: 14:30:00
  value.start_date = dateWithTime;

  const patched = patch(existing, value);

  // The field should be upgraded to local datetime format (with T separator)
  expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_date = 2024-01-16T14:30:00
    
    [venue]
    name = "Convention Center"
    ` + '\n');
});

test('should upgrade date-only field to datetime with milliseconds when patching with Date that has milliseconds', () => {
  const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_date = 2024-01-15
    
    [venue]
    name = "Convention Center"
    ` + '\n';

  const value = parse(existing);
  
  // Set a date-only field with a Date that has time and millisecond components
  const dateWithTime = new Date('2024-01-16T14:30:00.123Z'); // Has time: 14:30:00.123
  value.start_date = dateWithTime;

  const patched = patch(existing, value);

  // The field should be upgraded to local datetime format with milliseconds
  expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_date = 2024-01-16T14:30:00.123
    
    [venue]
    name = "Convention Center"
    ` + '\n');
});

test('should upgrade date-only field to offset datetime when patching with OffsetDateTime', () => {
  const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_date = 2024-01-15
    
    [venue]
    name = "Convention Center"
    ` + '\n';

  const value = parse(existing);
  
  // Set a date-only field with an OffsetDateTime
  const offsetDateTime = new OffsetDateTime('2024-01-16T14:30:00-07:00', false);
  value.start_date = offsetDateTime;

  const patched = patch(existing, value);

  // The field should be upgraded to offset datetime format
  expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_date = 2024-01-16T14:30:00-07:00
    
    [venue]
    name = "Convention Center"
    ` + '\n');
});

test('should upgrade date-only field to offset datetime with Z timezone', () => {
  const existing = dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_date = 2024-01-15
    
    [venue]
    name = "Convention Center"
    ` + '\n';

  const value = parse(existing);
  
  // Set a date-only field with an OffsetDateTime using Z (UTC)
  const offsetDateTime = new OffsetDateTime('2024-01-16T14:30:00Z', false);
  value.start_date = offsetDateTime;

  const patched = patch(existing, value);

  // The field should be upgraded to offset datetime format with Z
  expect(patched).toEqual(dedent`
    # Event configuration
    event_name = "Annual Conference"
    start_date = 2024-01-16T14:30:00Z
    
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
  
  // Get the current datetime and add one day using LocalDateTime
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
  
  // Get the current datetime and add one day using LocalDateTime with space separator
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
  
  // Update the offset datetime by adding one day
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
  
  // Update the offset datetime by adding one day, keeping same time and offset
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
  
  // Update with new datetime that has milliseconds
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

describe('should preserve all TOML date/time formats when patching', () => {
  const testCases = [
    {
      name: 'Local Date',
      input: 'event_date = 2024-01-15',
      expected: 'event_date = 2024-01-16'
    },
    {
      name: 'Local DateTime with T separator',
      input: 'event_datetime = 2024-01-15T10:30:00',
      expected: 'event_datetime = 2024-01-16T10:30:00'
    },
    {
      name: 'Local DateTime with space separator', 
      input: 'event_datetime = 2024-01-15 10:30:00',
      expected: 'event_datetime = 2024-01-16 10:30:00'
    },
    {
      name: 'Local DateTime with milliseconds',
      input: 'event_datetime = 2024-01-15T10:30:00.999',
      expected: 'event_datetime = 2024-01-16T10:30:00.999'
    },
    {
      name: 'Offset DateTime with T and Z',
      input: 'event_datetime = 2024-01-15T10:30:00Z',
      expected: 'event_datetime = 2024-01-16T10:30:00Z'
    },
    {
      name: 'Offset DateTime with space and Z',
      input: 'event_datetime = 2024-01-15 10:30:00Z',
      expected: 'event_datetime = 2024-01-16 10:30:00Z'
    },
    {
      name: 'Offset DateTime with timezone offset',
      input: 'event_datetime = 2024-01-15T10:30:00-07:00',
      expected: 'event_datetime = 2024-01-16T10:30:00-07:00' // Note: preserves the original offset
    }
  ];

  testCases.forEach(({ name, input, expected }) => {
    test(name, () => {
    const parsed = parse(input);
    const key = Object.keys(parsed)[0];
    const originalDate = parsed[key] as Date;
    
    // Add one day
    const nextDayTime = originalDate.getTime() + 24 * 60 * 60 * 1000;
    let nextDay: Date;
    
    // Use the appropriate custom date class based on the original type
    if ((originalDate as any).isDate) {
      nextDay = new LocalDate(new Date(nextDayTime).toISOString().split('T')[0]);
    } else if ((originalDate as any).isTime) {
      const timeString = new Date(nextDayTime).toISOString().split('T')[1].split('Z')[0];
      nextDay = new LocalTime(timeString, timeString);
    } else if ((originalDate as any).isFloating) {
      const useSpaceSeparator = (originalDate as any).useSpaceSeparator;
      const isoString = new Date(nextDayTime).toISOString().replace('Z', '');
      const dateTimeString = useSpaceSeparator ? isoString.replace('T', ' ') : isoString;
      nextDay = new LocalDateTime(dateTimeString, useSpaceSeparator);
    } else if ((originalDate as any).useSpaceSeparator || (originalDate as any).originalOffset) {
      const useSpaceSeparator = (originalDate as any).useSpaceSeparator;
      const originalOffset = (originalDate as any).originalOffset;
      
      // For offset datetime, we need to preserve the local time in the original timezone
      // Add 24 hours to the original date string representation, not the UTC time
      const originalISOString = originalDate.toISOString();
      const datePart = originalISOString.split(useSpaceSeparator ? ' ' : 'T')[0];
      const timePart = originalISOString.split(useSpaceSeparator ? ' ' : 'T')[1].replace(originalOffset || 'Z', '');
      
      // Parse the date part and add one day
      const [year, month, day] = datePart.split('-').map(Number);
      const nextDate = new Date(year, month - 1, day + 1);
      const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
      
      const separator = useSpaceSeparator ? ' ' : 'T';
      const dateTimeString = `${nextDateStr}${separator}${timePart}${originalOffset || 'Z'}`;
      nextDay = new OffsetDateTime(dateTimeString, useSpaceSeparator);
    } else {
      // Fallback to regular Date
      nextDay = new Date(nextDayTime);
    }
    
    parsed[key] = nextDay;
    const patched = patch(input, parsed);
    
    expect(patched.trim()).toEqual(expected);
    });
  });
});

test('should patch local time values while preserving format', () => {
  const existing = dedent`
    # Daily schedule
    meeting_time = 10:30:00
    lunch_time = 12:00:00.500
    
    [schedule]
    active = true
    ` + '\n';

  const value = parse(existing);
  
  // Add 1 hour to meeting time using LocalTime
  const meetingTime = value.meeting_time as Date;
  const newMeetingTime = new Date(meetingTime.getTime() + 60 * 60 * 1000); // Add 1 hour
  value.meeting_time = newMeetingTime;

  const patched = patch(existing, value);

  expect(patched).toEqual(dedent`
    # Daily schedule
    meeting_time = 11:30:00
    lunch_time = 12:00:00.500
    
    [schedule]
    active = true
    ` + '\n');
});

test('should preserve zero time component when patching date with zero time', () => {
  // Test that when the original TOML has a date with time component at zero,
  // and we patch it to a new date, the time component is preserved
  const existing = dedent`
    event_start = 2024-01-15T00:00:00.000Z
    event_name = "Conference"
    ` + '\n';

  const value = parse(existing);
  
  // Change to a different date, also with zero time components
  value.event_start = new Date('2024-02-20T00:00:00.000Z');

  const patched = patch(existing, value);

  // The result should keep the time component (not truncate to date-only)
  expect(patched).toEqual(dedent`
    event_start = 2024-02-20T00:00:00.000Z
    event_name = "Conference"
    ` + '\n');
});

test('should preserve datetime format when patching to zero time component', () => {
  // Test that when the original TOML has a date with non-zero time component,
  // and we patch it to a date with zero time components,
  // the resulting TOML shows the zero-time component (not just the date)
  const existing = dedent`
    event_start = 2024-01-15T10:30:45.000Z
    event_name = "Workshop"
    ` + '\n';

  const value = parse(existing);
  
  // Change to a date with zero time components
  value.event_start = new Date('2024-02-20T00:00:00.000Z');

  const patched = patch(existing, value);

  // The result should show the full timestamp with zero time, not just the date
  expect(patched).toEqual(dedent`
    event_start = 2024-02-20T00:00:00.000Z
    event_name = "Workshop"
    ` + '\n');
});

test('should not affect time-only values with truncateZeroTimeInDates option (non-zero time)', () => {
  // Test that truncateZeroTimeInDates doesn't affect LocalTime values (time-only, no date component)
  const existing = dedent`
    meeting_time = 14:30:00
    event_name = "Team Meeting"
    ` + '\n';

  const value = parse(existing);
  
  // Change to a different time
  const meetingTime = value.meeting_time as Date;
  const newMeetingTime = new Date(meetingTime.getTime() + 2 * 60 * 60 * 1000); // Add 2 hours
  value.meeting_time = newMeetingTime;

  const patched = patch(existing, value, { truncateZeroTimeInDates: true });

  // The result should show the time as-is, not affected by truncateZeroTimeInDates
  expect(patched).toEqual(dedent`
    meeting_time = 16:30:00
    event_name = "Team Meeting"
    ` + '\n');
});

test('should not affect time-only values with truncateZeroTimeInDates option (zero time)', () => {
  // Test that truncateZeroTimeInDates doesn't affect LocalTime values even when time is 00:00:00
  const existing = dedent`
    start_time = 23:00:00
    event_name = "Late Event"
    ` + '\n';

  const value = parse(existing);
  
  // Change to midnight (00:00:00)
  const startTime = value.start_time as Date;
  const newStartTime = new Date(startTime.getTime() + 1 * 60 * 60 * 1000); // Add 1 hour to get 00:00:00
  value.start_time = newStartTime;

  const patched = patch(existing, value, { truncateZeroTimeInDates: true });

  // The result should show 00:00:00 as-is, not be truncated or affected
  expect(patched).toEqual(dedent`
    start_time = 00:00:00
    event_name = "Late Event"
    ` + '\n');
});

test('should preserve time component for offset datetime even when UTC equivalent is zero time', () => {
  // Test that an OffsetDateTime with non-zero local time but zero UTC time
  // keeps its time component with truncateZeroTimeInDates: true
  // Example: 2024-01-15T02:00:00+02:00 = 2024-01-15T00:00:00Z in UTC
  const existing = dedent`
    event_start = 2024-01-15T02:00:00+02:00
    event_name = "Morning Event"
    ` + '\n';

  const value = parse(existing);
  
  // Change to a different date, also with time that is zero in UTC but non-zero locally
  // We add 36 days, which keeps the same local time with the offset
  const eventStart = value.event_start as Date;
  const newEventStart = new Date(eventStart.getTime() + 36 * 24 * 60 * 60 * 1000); // Add 36 days
  value.event_start = newEventStart;

  const patched = patch(existing, value, { truncateZeroTimeInDates: true });

  // The result should keep the time component because the local time is 02:00:00, not 00:00:00
  // Even though in UTC it's 00:00:00, the local time has a non-zero component
  expect(patched).toEqual(dedent`
    event_start = 2024-02-20T02:00:00+02:00
    event_name = "Morning Event"
    ` + '\n');
});

test('should preserve time component for local datetime with non-zero time and truncateZeroTimeInDates', () => {
  // Test that a LocalDateTime (no timezone) with non-zero time keeps its time component
  const existing = dedent`
    event_start = 2024-01-15T14:30:00
    event_name = "Afternoon Meeting"
    ` + '\n';

  const value = parse(existing);
  
  // Change to a different date with same time
  const eventStart = value.event_start as Date;
  const newEventStart = new Date(eventStart.getTime() + 36 * 24 * 60 * 60 * 1000); // Add 36 days
  value.event_start = newEventStart;

  const patched = patch(existing, value, { truncateZeroTimeInDates: true });

  // The result should keep the time component
  expect(patched).toEqual(dedent`
    event_start = 2024-02-20T14:30:00
    event_name = "Afternoon Meeting"
    ` + '\n');
});

test('should preserve datetime format for local datetime with zero time component', () => {
  // Test that a LocalDateTime with T00:00:00 preserves the time component
  // even with truncateZeroTimeInDates: true, because the original format has time
  const existing = dedent`
    event_start = 2024-01-15T00:00:00
    event_name = "Midnight Event"
    ` + '\n';

  const value = parse(existing);
  
  // Change to a different date, also with zero time
  const eventStart = value.event_start as Date;
  const newEventStart = new Date(eventStart.getTime() + 36 * 24 * 60 * 60 * 1000); // Add 36 days
  value.event_start = newEventStart;

  const patched = patch(existing, value, { truncateZeroTimeInDates: true });

  // The result should keep T00:00:00 because the original format has time component
  // truncateZeroTimeInDates should not affect values from existing TOML
  expect(patched).toEqual(dedent`
    event_start = 2024-02-20T00:00:00
    event_name = "Midnight Event"
    ` + '\n');
});

test('should add new date with zero time as date-only when truncateZeroTimeInDates is true', () => {
  // Test adding a new date key-value that wasn't in the original TOML
  const existing = dedent`
    event_name = "Conference"
    location = "Seattle"
    ` + '\n';

  const value = parse(existing);
  
  // Add a new date with zero time components
  value.event_date = new Date('2024-01-15T00:00:00.000Z');

  const patched = patch(existing, value, { truncateZeroTimeInDates: true });

  // The new date should be added as date-only (no time component)
  expect(patched).toEqual(dedent`
    event_name = "Conference"
    location = "Seattle"
    event_date = 2024-01-15
    ` + '\n');
});

test('should add new date with zero time as full timestamp when truncateZeroTimeInDates is false (default)', () => {
  // Test adding a new date key-value with default behavior (truncateZeroTimeInDates: false)
  const existing = dedent`
    event_name = "Workshop"
    location = "Portland"
    ` + '\n';

  const value = parse(existing);
  
  // Add a new date with zero time components
  value.event_date = new Date('2024-01-15T00:00:00.000Z');

  const patched = patch(existing, value);

  // The new date should be added with full timestamp
  expect(patched).toEqual(dedent`
    event_name = "Workshop"
    location = "Portland"
    event_date = 2024-01-15T00:00:00.000Z
    ` + '\n');
});

test('should add new date with non-zero time as full timestamp regardless of truncateZeroTimeInDates', () => {
  // Test that non-zero time is always preserved
  const existing = dedent`
    event_name = "Meetup"
    location = "Austin"
    ` + '\n';

  const value = parse(existing);
  
  // Add a new date with non-zero time components
  value.event_datetime = new Date('2024-01-15T14:30:00.000Z');

  const patched = patch(existing, value, { truncateZeroTimeInDates: true });

  // The new date should be added with full timestamp since time is non-zero
  expect(patched).toEqual(dedent`
    event_name = "Meetup"
    location = "Austin"
    event_datetime = 2024-01-15T14:30:00.000Z
    ` + '\n');
});

// TOML v1.1.0 - Multiline inline tables with newlines and trailing commas
test('should preserve multiline inline table format (TOML 1.1.0)', () => {
  const existing = dedent`
    name = "production"
    point = {
        x = 1,
        y = 2,
    }
    ` + '\n';

  const value = parse(existing);
  value.point.z = 3;

  const patched = patch(existing, value);

  // Should preserve multiline inline table format with trailing comma
  expect(patched).toContain('point = {');
  expect(patched).toContain('x = 1,');
  expect(patched).toContain('y = 2,');
  expect(patched).toContain('z = 3,');
  expect(patched).toContain('}');
});

//TOML v1.1.0 - More tests for multiline inline tables
test('should parse and patch nested multiline inline tables (TOML 1.1.0)', () => {
  // This is the exact example from TOML 1.1.0 spec
  const existing = dedent`
    tbl = {
        key      = "a string",
        moar-tbl =  {
            key = 1,
        },
    }
    ` + '\n';

  const value = parse(existing);
  // Access nested table using bracket notation for hyphenated keys
  value.tbl['moar-tbl'].key = 2;
  value.tbl.another = "value";

  const patched = patch(existing, value);

  // Should preserve the nested multiline inline table structure
  expect(patched).toContain('tbl = {');
  expect(patched).toContain('key      = "a string"');
  expect(patched).toContain('moar-tbl');
  expect(patched).toContain('key = 2');
  expect(patched).toContain('another');
});

// TOML v1.1.0 - Inline tables with comments
test('should handle inline tables with comments (TOML 1.1.0)', () => {
  const existing = dedent`
    server = {
        # Server configuration
        host = "localhost",
        port = 8080,
    }
    ` + '\n';

  const value = parse(existing);
  value.server.timeout = 5000;

  const patched = patch(existing, value);

  // Should preserve comments in inline tables (TOML 1.1.0 feature)
  expect(patched).toContain('# Server configuration');
  expect(patched).toContain('host = "localhost"');
  expect(patched).toContain('port = 8080');
  expect(patched).toContain('timeout = 5000');
});

test('should add new properties to multiline inline table (TOML 1.1.0)', () => {
  const existing = dedent`
    [database]
    connection = {
        host = "192.168.1.1",
        port = 5432,
    }
    enabled = true
    ` + '\n';

  const value = parse(existing);
  value.database.connection.user = "admin";
  value.database.connection.password = "secret";

  const patched = patch(existing, value);

  expect(patched).toContain('connection = {');
  expect(patched).toContain('host = "192.168.1.1"');
  expect(patched).toContain('port = 5432');
  expect(patched).toContain('user = "admin"');
  expect(patched).toContain('password = "secret"');
});

test('should preserve single-line inline table when updating (backward compatibility)', () => {
  const existing = dedent`
    point = { x = 1, y = 2 }
    ` + '\n';

  const value = parse(existing);
  value.point.z = 3;

  const patched = patch(existing, value);

  // Should preserve single-line format when possible
  expect(patched).toContain('point = { x = 1, y = 2, z = 3 }');
});

test('should add key to nested inline table', () => {
  const existing = 'config = { server = { host = "localhost" } }\n';

  const value = parse(existing);
  value.config.server.port = 8080;

  const patched = patch(existing, value);
  expect(patched).toContain('port = 8080');
});

// ------ Edge cases: KV + table section ordering during removal ------

test('should remove leading KV and preserve table section', () => {
  const existing = dedent`
    title = "My App"
    [server]
    host = "localhost"
    port = 8080
  ` + '\n';

  const patched = patch(existing, {
    server: { host: 'localhost', port: 8080 },
  });

  expect(patched).not.toContain('title');
  expect(patched).toContain('[server]');
  expect(patched).toContain('host = "localhost"');
  expect(patched).toContain('port = 8080');
});

test('should remove table section and preserve leading KV', () => {
  const existing = dedent`
    title = "My App"
    [server]
    host = "localhost"
    port = 8080
  ` + '\n';

  const patched = patch(existing, { title: 'My App' });

  expect(patched).toContain('title = "My App"');
  expect(patched).not.toContain('[server]');
  expect(patched).not.toContain('host');
  expect(patched).not.toContain('port');
});

test('should remove multiple leading KVs and preserve table section', () => {
  const existing = dedent`
    a = 1
    b = 2
    c = 3
    [config]
    debug = true
  ` + '\n';

  const patched = patch(existing, { config: { debug: true } });

  expect(patched).not.toContain('a = 1');
  expect(patched).not.toContain('b = 2');
  expect(patched).not.toContain('c = 3');
  expect(patched).toContain('[config]');
  expect(patched).toContain('debug = true');
});

// BUG: Same as validate-ast 'remove table array after leading KV' —
// findByPath fails for whole-table-array removal path ['tasks'].
test('should remove table array and preserve leading KV', () => {
  const existing = dedent`
    title = "Project"
    [[tasks]]
    name = "build"
    [[tasks]]
    name = "test"
  ` + '\n';

  const patched = patch(existing, { title: 'Project' });

  expect(patched).toContain('title = "Project"');
  expect(patched).not.toContain('[[tasks]]');
  expect(patched).not.toContain('name');
});

test('should remove leading KV and preserve table array', () => {
  const existing = dedent`
    title = "Project"
    [[tasks]]
    name = "build"
    [[tasks]]
    name = "test"
  ` + '\n';

  const patched = patch(existing, {
    tasks: [{ name: 'build' }, { name: 'test' }],
  });

  expect(patched).not.toContain('title');
  expect(patched).toContain('[[tasks]]');
  expect(patched).toContain('name = "build"');
  expect(patched).toContain('name = "test"');
});

test('should remove all tables and keep multiple root KVs', () => {
  const existing = dedent`
    name = "app"
    version = "1.0"
    [database]
    host = "db"
    [cache]
    ttl = 60
  ` + '\n';

  const patched = patch(existing, { name: 'app', version: '1.0' });

  expect(patched).toContain('name = "app"');
  expect(patched).toContain('version = "1.0"');
  expect(patched).not.toContain('[database]');
  expect(patched).not.toContain('[cache]');
});

test('should remove all root KVs and keep all tables', () => {
  const existing = dedent`
    name = "app"
    version = "1.0"
    [database]
    host = "db"
    [cache]
    ttl = 60
  ` + '\n';

  const patched = patch(existing, {
    database: { host: 'db' },
    cache: { ttl: 60 },
  });

  expect(patched).not.toContain('name =');
  expect(patched).not.toContain('version =');
  expect(patched).toContain('[database]');
  expect(patched).toContain('host = "db"');
  expect(patched).toContain('[cache]');
  expect(patched).toContain('ttl = 60');
});

test('should edit leading KV and remove table entry simultaneously', () => {
  const existing = dedent`
    version = 1
    [server]
    host = "localhost"
    port = 8080
  ` + '\n';

  const patched = patch(existing, {
    version: 2,
    server: { host: 'localhost' },
  });

  expect(patched).toContain('version = 2');
  expect(patched).toContain('[server]');
  expect(patched).toContain('host = "localhost"');
  expect(patched).not.toContain('port');
});

test('should replace KV value and delete table in same patch', () => {
  const existing = dedent`
    name = "old"
    [config]
    debug = true
    verbose = false
  ` + '\n';

  const patched = patch(existing, { name: 'new' });

  expect(patched).toContain('name = "new"');
  expect(patched).not.toContain('[config]');
  expect(patched).not.toContain('debug');
});

test('should remove everything leaving empty document', () => {
  const existing = dedent`
    a = 1
    [section]
    key = "value"
  ` + '\n';

  const patched = patch(existing, {});
  // Should be empty or just whitespace
  expect(patched.trim()).toBe('');
});

// ==========================================
// TOML v1.1 Multiline Inline Table Tests
// Based on toml-test spec:
//   tests/valid/inline-table/newline.toml
//   tests/valid/inline-table/newline-comment.toml
//   src/__fixtures__/multiline-inline-table.toml
// ==========================================

describe('TOML v1.1 multiline inline tables - edit operations (newline.toml spec)', () => {

  test('should edit a value in a simple trailing-comma multiline inline table', () => {
    const existing = dedent`
      trailing-comma-1 = {
              c = 1,
      }
      ` + '\n';

    const value = parse(existing);
    value['trailing-comma-1'].c = 42;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      trailing-comma-1 = {
              c = 42,
      }
      ` + '\n');
  });

  test('should add a key to a trailing-comma multiline inline table', () => {
    const existing = dedent`
      trailing-comma-1 = {
              c = 1,
      }
      ` + '\n';

    const value = parse(existing);
    value['trailing-comma-1'].d = 2;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      trailing-comma-1 = {
              c = 1,
              d = 2,
      }
      ` + '\n');
  });

  test('should delete a key from a two-key multiline inline table', () => {
    const existing = dedent`
      tbl-1 = {
              hello = "world",
              b = 2,
      }
      ` + '\n';

    const value = parse(existing);
    delete value['tbl-1'].hello;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl-1 = {
              b = 2,
      }
      ` + '\n');
  });

  test('should edit a nested value inside a multiline inline table', () => {
    const existing = dedent`
      tbl-1 = {
              tbl = {
                       k = 1,
              }
      }
      ` + '\n';

    const value = parse(existing);
    value['tbl-1'].tbl.k = 99;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl-1 = {
              tbl = {
                       k = 99,
              }
      }
      ` + '\n');
  });

  test('should delete a nested inline table key leaving empty nested table', () => {
    const existing = dedent`
      tbl-1 = {
              tbl = {
                       k = 1,
              }
      }
      ` + '\n';

    const value = parse(existing);
    delete value['tbl-1'].tbl.k;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl-1 = {
              tbl = {

              }
      }
      ` + '\n');
  });

  test('should delete an entire nested inline table entry', () => {
    const existing = dedent`
      tbl-1 = {
              hello = "world",
              tbl = {
                       k = 1,
              }
      }
      ` + '\n';

    const value = parse(existing);
    delete value['tbl-1'].tbl;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl-1 = {
              hello = "world"
      }
      ` + '\n');
  });

  test('should edit a value in an inline table that contains a multiline string value', () => {
    // Verifies that preserveFormatting preserves the structural suffix of a multiline string:
    // the line-continuation backslash and the closing indent must be preserved.
    //
    // Note: dedent eats `\<LF>` sequences (its raw-string cleanup regex), so these
    // strings are written with explicit concatenation to control every character exactly.
    //
    // The TOML `        Hello \<LF>        ` encodes value `        Hello `
    // (8 spaces + "Hello " — the `\<LF><spaces>` is trimmed as a line continuation).
    const existing =
      'tbl-2 = {\n' +
      '        k = """\\\n' +
      '        Hello \\\n' +
      '        """\n' +
      '}\n';

    const value = parse(existing);
    // Sanity-check: line continuation trims backslash+newline+indent, leaving the trailing space.
    expect(value['tbl-2'].k).toEqual('Hello ');

    value['tbl-2'].k = 'Goodbye ';
    const patched = patch(existing, value);

    expect(patched).toEqual(
      'tbl-2 = {\n' +
      '        k = """\\\n' +
      '        Goodbye \\\n' +
      '        """\n' +
      '}\n'
    );
    expect(parse(patched)['tbl-2'].k).toEqual('Goodbye ');
  });

    test('should edit a value in an inline table that contains a multiline string value 2', () => {
    const existing =
      'tbl-2 = {\n' +
      '        k = """\\\n' +
      '        Hello \\\n' +
      '        World.\\\n' +
      '        """\n' +
      '}\n';

    const value = parse(existing);
    // The `\<LF><indent>` sequences are line continuations: they trim the backslash,
    // newline and following whitespace, joining everything into one value.
    expect(value['tbl-2'].k).toEqual('Hello World.');

    value['tbl-2'].k = 'Bonjour World.';
    const patched = patch(existing, value);

    expect(patched).toEqual(
      'tbl-2 = {\n' +
      '        k = """\\\n' +
      '        Bonjour \\\n' +
      '        World.\\\n' +
      '        """\n' +
      '}\n'
    );
    expect(parse(patched)['tbl-2'].k).toEqual('Bonjour World.');
  });

      test('should edit a value in an inline table that contains a multiline string value 3', () => {
    // Uses """\n (leading newline) format — NOT """\\ (leading line-continuation).
    // The body contains line-continuation backslashes with blank lines and mixed indentation.
    const existing =
      'tbl-2 = {\n' +
      '        k = """\n' +
      'The quick brown \\\n' +
      '\n' +
      '\n' +
      '  fox jumps over \\\n' +
      '    the lazy dog."""\n' +
      '}\n';

    const value = parse(existing);
    // Line-continuation trims `\`, newline(s) and following whitespace:
    //   "The quick brown " + "fox jumps over " + "the lazy dog."
    expect(value['tbl-2'].k).toEqual('The quick brown fox jumps over the lazy dog.');

    value['tbl-2'].k = 'The quick brown cat jumps over the lazy dog.';
    const patched = patch(existing, value);

    expect(patched).toEqual(
      'tbl-2 = {\n' +
      '        k = """\n' +
      'The quick brown \\\n' +
      '\n' +
      '\n' +
      '  cat jumps over \\\n' +
      '    the lazy dog."""\n' +
      '}\n'
    );
    expect(parse(patched)['tbl-2'].k).toEqual('The quick brown cat jumps over the lazy dog.');
  });

      test('should edit a value in an inline table that contains a multiline string value 4', () => {
    // Uses """content (no newline after delimiter) with line-continuation in the body.
    const existing =
      'tbl-2 = {\n' +
      '        k = """The quick brown \\\n' +
      '  fox jumps over \\\n' +
      '    the lazy dog."""\n' +
      '}\n';

    const value = parse(existing);
    expect(value['tbl-2'].k).toEqual('The quick brown fox jumps over the lazy dog.');

    value['tbl-2'].k = 'The quick brown cat jumps over the lazy dog.';
    const patched = patch(existing, value);

    expect(patched).toEqual(
      'tbl-2 = {\n' +
      '        k = """The quick brown \\\n' +
      '  cat jumps over \\\n' +
      '    the lazy dog."""\n' +
      '}\n'
    );
    expect(parse(patched)['tbl-2'].k).toEqual('The quick brown cat jumps over the lazy dog.');
  });

  test('should preserve no-trailing-newline-before-brace format when editing', () => {
    // no-newline-before-brace from newline.toml: last key on same line as }
    const existing = dedent`
      no-newline-before-brace = {
      a = 1,
      b = 2}
      ` + '\n';

    const value = parse(existing);
    value['no-newline-before-brace'].a = 10;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      no-newline-before-brace = {
      a = 10,
      b = 2}
      ` + '\n');
  });

  test('should preserve no-trailing-newline-before-brace-with-comma format when editing', () => {
    // no-newline-before-brace-with-comma from newline.toml
    const existing = dedent`
      no-newline-before-brace-with-comma = {
      a = 1,
      b = 2,}
      ` + '\n';

    const value = parse(existing);
    value['no-newline-before-brace-with-comma'].b = 20;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      no-newline-before-brace-with-comma = {
      a = 1,
      b = 20,}
      ` + '\n');
  });
});

describe('TOML v1.1 multiline inline tables - trailing comma preservation', () => {

  test('should preserve trailing comma on last item when editing last item', () => {
    const existing = dedent`
      t = {
          a = 1,
          b = 2,
      }
      ` + '\n';

    const value = parse(existing);
    value.t.b = 99;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      t = {
          a = 1,
          b = 99,
      }
      ` + '\n');
  });

  test('should preserve trailing comma when adding a new key to multiline inline table', () => {
    const existing = dedent`
      t = {
          a = 1,
          b = 2,
      }
      ` + '\n';

    const value = parse(existing);
    value.t.c = 3;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      t = {
          a = 1,
          b = 2,
          c = 3,
      }
      ` + '\n');
  });

  test('should preserve trailing comma when deleting non-last key from multiline inline table', () => {
    const existing = dedent`
      t = {
          a = 1,
          b = 2,
      }
      ` + '\n';

    const value = parse(existing);
    delete value.t.a;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      t = {
          b = 2,
      }
      ` + '\n');
  });

  test('should NOT add trailing comma when original format has no trailing comma', () => {
    const existing = dedent`
      t = {
          a = 1,
          b = 2
      }
      ` + '\n';

    const value = parse(existing);
    value.t.b = 99;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      t = {
          a = 1,
          b = 99
      }
      ` + '\n');
  });
});

describe('TOML v1.1 multiline inline tables with comments (newline-comment.toml spec)', () => {

  test('should edit value and preserve inline comments in multiline inline table', () => {
    const existing = dedent`
      trailing-comma-1 = {#comment
              # comment
              c = 1,#comment
              #comment
      }#comment
      ` + '\n';

    const value = parse(existing);
    value['trailing-comma-1'].c = 100;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      trailing-comma-1 = {#comment
              # comment
              c = 100,#comment
              #comment
      }#comment
      ` + '\n');
  });

  test('should delete a key from a commented multiline inline table preserving remaining comments', () => {
    const existing = dedent`
      tbl-1 = {#comment
              hello = "world",#comment
              b = 2,#comment
      }#comment
      ` + '\n';

    const value = parse(existing);
    delete value['tbl-1'].hello;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl-1 = {#comment
              b = 2,#comment
      }#comment
      ` + '\n');
  });

  test('should add a key to a commented multiline inline table', () => {
    const existing = dedent`
      trailing-comma-1 = {#comment
              # comment
              c = 1,#comment
              #comment
      }#comment
      ` + '\n';

    const value = parse(existing);
    value['trailing-comma-1'].d = 99;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      trailing-comma-1 = {#comment
              # comment
              c = 1,#comment
              d = 99,
              #comment
      }#comment
      ` + '\n');
  });

  test('should edit nested table value preserving all inline comments', () => {
    const existing = dedent`
      tbl-1 = {#comment
              tbl = {#comment
                       k = 1,#comment
              }#comment
      }#comment
      ` + '\n';

    const value = parse(existing);
    value['tbl-1'].tbl.k = 7;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl-1 = {#comment
              tbl = {#comment
                       k = 7,#comment
              }#comment
      }#comment
      ` + '\n');
  });
});

describe('TOML v1.1 multiline inline tables - fixture (multiline-inline-table.toml)', () => {

  test('should edit the top-level key in a deeply nested multiline inline table', () => {
    const existing = dedent`
      tbl = {
          key      = "a string",
          moar-tbl =  {
              key = 1,
          },
      }
      ` + '\n';

    const value = parse(existing);
    value.tbl.key = 'updated string';
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl = {
          key      = "updated string",
          moar-tbl =  {
              key = 1,
          },
      }
      ` + '\n');
  });

  test('should edit the nested key in a deeply nested multiline inline table', () => {
    const existing = dedent`
      tbl = {
          key      = "a string",
          moar-tbl =  {
              key = 1,
          },
      }
      ` + '\n';

    const value = parse(existing);
    value.tbl['moar-tbl'].key = 42;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl = {
          key      = "a string",
          moar-tbl =  {
              key = 42,
          },
      }
      ` + '\n');
  });

  test('should delete the nested table entry entirely', () => {
    const existing = dedent`
      tbl = {
          key      = "a string",
          moar-tbl =  {
              key = 1,
          },
      }
      ` + '\n';

    const value = parse(existing);
    delete value.tbl['moar-tbl'];
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl = {
          key      = "a string",
      }
      ` + '\n');
  });

  test('should add a sibling key to the outer multiline inline table', () => {
    const existing = dedent`
      tbl = {
          key      = "a string",
          moar-tbl =  {
              key = 1,
          },
      }
      ` + '\n';

    const value = parse(existing);
    value.tbl['new-key'] = 'added';
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl = {
          key      = "a string",
          moar-tbl =  {
              key = 1,
          },
          new-key = "added",
      }
      ` + '\n');
  });

  test('should add a key inside the nested multiline inline table', () => {
    const existing = dedent`
      tbl = {
          key      = "a string",
          moar-tbl =  {
              key = 1,
          },
      }
      ` + '\n';

    const value = parse(existing);
    value.tbl['moar-tbl']['extra'] = 2;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl = {
          key      = "a string",
          moar-tbl =  {
              key = 1,
              extra = 2,
          },
      }
      ` + '\n');
  });

  test('should edit value in inline table with comment using fixture format', () => {
    const existing = dedent`
      trailing-comma-1 = {#comment
          # comment
          c = 1,#comment
          #comment
      }#comment
      ` + '\n';

    const value = parse(existing);
    value['trailing-comma-1'].c = 55;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      trailing-comma-1 = {#comment
          # comment
          c = 55,#comment
          #comment
      }#comment
      ` + '\n');
  });
});

describe('undefined handling in patch', () => {
  test('should remove a key from a table when its value is set to undefined', () => {
    const existing = dedent`
      [owner]
      name = "Tom Preston-Werner"
      organization = "GitHub"
      bio = "Developer"
      ` + '\n';

    const obj = parse(existing);
    obj.owner.organization = undefined;

    expect(patch(existing, obj)).toEqual(dedent`
      [owner]
      name = "Tom Preston-Werner"
      bio = "Developer"
      ` + '\n');
  });

  test('should remove a top-level key when its value is set to undefined', () => {
    const existing = dedent`
      title = "TOML Example"
      debug = true
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    obj.debug = undefined;

    expect(patch(existing, obj)).toEqual(dedent`
      title = "TOML Example"
      version = "1.0.0"
      ` + '\n');
  });

  test('should remove a key from an inline table when its value is set to undefined', () => {
    const existing = dedent`
      count = { a = 1, b = 2, c = 3 }
      ` + '\n';

    const obj = parse(existing);
    obj.count.b = undefined;

    expect(patch(existing, obj)).toEqual(dedent`
      count = { a = 1, c = 3 }
      ` + '\n');
  });

  test('should remove an entire table section when set to undefined', () => {
    const existing = dedent`
      [owner]
      name = "Tom"
      org = "GitHub"

      [database]
      server = "localhost"
      ` + '\n';

    const obj = parse(existing);
    obj.owner = undefined;

    expect(patch(existing, obj)).toEqual('\n' + dedent`
      [database]
      server = "localhost"
      ` + '\n');
  });

  test('should leave an empty table header when its only key is set to undefined', () => {
    const existing = dedent`
      title = "hello"

      [owner]
      name = "Tom"
      ` + '\n';

    const obj = parse(existing);
    obj.owner.name = undefined;

    expect(patch(existing, obj)).toEqual(dedent`
      title = "hello"

      [owner]
      ` + '\n');
  });

  test('should throw when patching with undefined inside an array', () => {
    const existing = dedent`
      ports = [ 8001, 8002, 8003 ]
      ` + '\n';

    expect(() => patch(existing, { ports: [8001, undefined, 8003] })).toThrow(
      '"undefined" values are not supported inside arrays'
    );
  });

  test('should not throw when an array contains objects with undefined keys', () => {
    const existing = dedent`
      [[products]]
      name = "Hammer"
      color = "red"

      [[products]]
      name = "Nail"
      color = "gray"
      ` + '\n';

    const obj = parse(existing);
    obj.products[0].color = undefined;

    expect(patch(existing, obj)).toEqual(dedent`
      [[products]]
      name = "Hammer"

      [[products]]
      name = "Nail"
      color = "gray"
      ` + '\n');
  });

  // Removing a key from an inline table (object) inside an inline array (e.g. deleting a property
  // directly without undefined). This is the minimal repro for the bug that was
  // previously triggered via undefined: the parent at path ["items", 0] was an
  // InlineItem wrapping an InlineTable, and patch.ts wasn't unwrapping that case.
  test('should remove a key from an object inside an inline array', () => {
    const existing = dedent`
      items = [ { name = "Hammer", color = "red" }, { name = "Nail", color = "gray" } ]
      ` + '\n';

    const obj = parse(existing);
    delete obj.items[0].color;

    expect(patch(existing, obj)).toEqual(dedent`
      items = [ { name = "Hammer" }, { name = "Nail", color = "gray" } ]
      ` + '\n');
  });

  // Deeper nesting: inline array → inline tables → inline array → inline tables.
  // Removing a key from an inline table at depth 4.
  test('should remove a key from a deeply nested inline table (array → objects → array → objects)', () => {
    const existing = dedent`
      items = [ { name = "Hammer", tags = [ { key = "material", value = "steel" }, { key = "color", value = "red" } ] }, { name = "Nail", tags = [ { key = "color", value = "gray" } ] } ]
      ` + '\n';

    const obj = parse(existing);
    delete obj.items[0].tags[0].value;

    expect(patch(existing, obj)).toEqual(dedent`
      items = [ { name = "Hammer", tags = [ { key = "material" }, { key = "color", value = "red" } ] }, { name = "Nail", tags = [ { key = "color", value = "gray" } ] } ]
      ` + '\n');
  });

  // Same deep nesting but with TOML v1.1 multiline inline arrays and tables.
  test('should remove a key from a deeply nested inline table with multiline formatting (TOML v1.1)', () => {
    const existing = dedent`
      items = [
        {
          name = "Hammer",
          tags = [
            { key = "material", value = "steel" },
            { key = "color", value = "red" }
          ]
        },
        {
          name = "Nail",
          tags = [
            { key = "color", value = "gray" }
          ]
        }
      ]
      ` + '\n';

    const obj = parse(existing);
    delete obj.items[0].tags[0].value;

    expect(patch(existing, obj)).toEqual(dedent`
      items = [
        {
          name = "Hammer",
          tags = [
            { key = "material" },
            { key = "color", value = "red" }
          ]
        },
        {
          name = "Nail",
          tags = [
            { key = "color", value = "gray" }
          ]
        }
      ]
      ` + '\n');
  });

  // An inline array of objects where one object has an undefined key should now
  // work correctly after the InlineItem-wrapping-InlineTable fix.
  test('should silently drop an undefined key from an object inside an inline array', () => {
    const existing = dedent`
      items = [ { name = "Hammer", color = "red" }, { name = "Nail", color = "gray" } ]
      ` + '\n';

    expect(patch(existing, { items: [{ name: 'Hammer', color: undefined }, { name: 'Nail', color: 'gray' }] })).toEqual(dedent`
      items = [ { name = "Hammer" }, { name = "Nail", color = "gray" } ]
      ` + '\n');
  });

  test('should throw when patching with undefined inside an array in an inline table', () => {
    const existing = dedent`
      config = { ports = [ 8001, 8002, 8003 ] }
      ` + '\n';

    expect(() => patch(existing, { config: { ports: [8001, undefined, 8003] } })).toThrow(
      '"undefined" values are not supported inside arrays'
    );
  });

  test('should throw when patching with undefined inside an array in a regular table', () => {
    const existing = dedent`
      [database]
      ports = [ 8001, 8002, 8003 ]
      ` + '\n';

    const obj = parse(existing);
    obj.database.ports = [8001, undefined, 8003];

    expect(() => patch(existing, obj)).toThrow(
      '"undefined" values are not supported inside arrays'
    );
  });

  test('should handle move-like scenario: remove key from one table, add to another', () => {
    const existing = dedent`
      [alpha]
      color = "red"
      name = "Alpha"

      [beta]
      name = "Beta"
      ` + '\n';

    const obj = parse(existing);
    obj.alpha.color = undefined;
    obj.beta.color = 'red';

    expect(patch(existing, obj)).toEqual(dedent`
      [alpha]
      name = "Alpha"

      [beta]
      name = "Beta"
      color = "red"
      ` + '\n');
  });

  // A table array element is technically "inside a JS array", but it
  // represents a TOML [[table-array]] entry rather than an inline array element.
  // The library currently throws in this case (same as inline arrays). The
  // The current way to remove a table array element is via splice().
  test('should throw when a table array element is set to undefined (use splice to remove instead)', () => {
    const existing = dedent`
      [[products]]
      name = "Hammer"
      sku = 738594937

      [[products]]
      name = "Nail"
      sku = 284758393

      [[products]]
      name = "Screwdriver"
      sku = 123456
      ` + '\n';

    const obj = parse(existing);
    obj.products[1] = undefined;

    expect(() => patch(existing, obj)).toThrow(
      '"undefined" values are not supported inside arrays'
    );
  });

  // This is just to illustrate the intended way to remove a table array element, 
  // since setting to undefined is not supported. 
  test('should remove a table array element via splice', () => {
    const existing = dedent`
      [[products]]
      name = "Hammer"
      sku = 738594937

      [[products]]
      name = "Nail"
      sku = 284758393

      [[products]]
      name = "Screwdriver"
      sku = 123456
      ` + '\n';

    const obj = parse(existing);
    obj.products.splice(1, 1);

    expect(patch(existing, obj)).toEqual(dedent`
      [[products]]
      name = "Hammer"
      sku = 738594937

      [[products]]
      name = "Screwdriver"
      sku = 123456
      ` + '\n');
  });
});
