import patch from '../patch';
import { parse, stringify } from '../';
import { LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from '../parse-toml';
import { example } from '../__fixtures__';
import dedent from 'dedent';
import { TomlFormat } from '../toml-format';

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

test('should remove key-value with inline comment from table', () => {
  const input = dedent`
    [database]
    server = "192.168.1.1"
    enabled = true # enable this feature
    ports = [8001, 8001, 8002]
  `;
  const value = parse(input);
  delete value.database.enabled;

  expect(patch(input, value)).toEqual(dedent`
    [database]
    server = "192.168.1.1"
    ports = [8001, 8001, 8002]
  `);
});

test('should preserve trailing comment on single-line inline table when deleting a key', () => {
  // Regression for: the orphaned-comment cleanup in writer.ts must NOT fire for
  // single-line inline tables. For a single-line table the parser does not extract
  // comments into root.items — any trailing `# comment` remains a root-level item
  // associated with the KV line, not the inline table. Incorrectly dropping it by
  // matching `commentLine === removedLine` would silently delete user comments.
  const input = dedent`
    t = { a = 1, b = 2 } # keep this comment
  `;
  const value = parse(input);
  delete value.t.a;

  expect(patch(input, value)).toEqual(dedent`
    t = { b = 2 } # keep this comment
  `);
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

test('should indent a relocated first element to match its sibling rows', () => {
  // Removing a non-last element of an already-multi-line array requires a Move
  // (compareArrays re-matches surviving elements by value), which relocates an
  // element into the array's first slot. calculateInlinePositioning() used to
  // fall back to the array's own opening-bracket column there, since there is no
  // previous sibling to line up against; it now matches the following row.
  const input = dedent`
    xs = [
      1,
      2,
      3,
    ]
  ` + '\n';

  const value = parse(input);
  value.xs.splice(0, 1);

  expect(patch(input, value)).toEqual(dedent`
    xs = [
      2,
      3,
    ]
  ` + '\n');
});

// The indent has to be *derived* from the sibling row, not assumed. Every other multi-line
// array fixture in the suite happens to use two spaces, so an implementation that simply
// hardcoded 2 would pass all of them — these pin the width to whatever the document uses.
describe('new first row derives its indent from the existing rows', () => {

  test('should match a 4-space indent when prepending', () => {
    const input = dedent`
      xs = [
          1,
          2,
      ]
    ` + '\n';

    expect(patch(input, { xs: [0, 1, 2] })).toEqual(dedent`
      xs = [
          0,
          1,
          2,
      ]
    ` + '\n');
  });

  test('should match a 4-space indent when the first element is removed', () => {
    const input = dedent`
      xs = [
          1,
          2,
          3,
      ]
    ` + '\n';

    expect(patch(input, { xs: [2, 3] })).toEqual(dedent`
      xs = [
          2,
          3,
      ]
    ` + '\n');
  });

  // The `\t` escapes resolve before dedent measures the common prefix, so the surrounding
  // two-space source indent strips cleanly and the tab survives into the fixture.
  test('should match tab-indented rows when prepending', () => {
    const input = dedent`
      xs = [
      \t1,
      \t2,
      ]
    ` + '\n';

    expect(patch(input, { xs: [0, 1, 2] })).toEqual(dedent`
      xs = [
      \t0,
      \t1,
      \t2,
      ]
    ` + '\n');
  });

  test('should match tab-indented rows when the first element is removed', () => {
    const input = dedent`
      xs = [
      \t1,
      \t2,
      \t3,
      ]
    ` + '\n';

    expect(patch(input, { xs: [2, 3] })).toEqual(dedent`
      xs = [
      \t2,
      \t3,
      ]
    ` + '\n');
  });

  // Boundary: with a single existing row there is exactly one sibling to align to. Worth
  // pinning because the lookup skips the just-spliced child by index, so an off-by-one
  // there would leave nothing to match and silently fall back to the bracket column.
  test('should align to the only existing row when prepending into a one-row array', () => {
    const input = dedent`
      xs = [
        1,
      ]
    ` + '\n';

    expect(patch(input, { xs: [0, 1] })).toEqual(dedent`
      xs = [
        0,
        1,
      ]
    ` + '\n');
  });

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

test('should collapse mlbs with leading newline and multiple content lines to single-line value', () => {
  // Original has leading newline ("""\n) and three lines of content.
  // New value has no newlines at all, so the generated raw has ONE embedded newline
  // (the preserved leading newline) and the else-branch of endLocation is NOT reached —
  // the multiline branch fires with lineCount=1, endLocation={ line:2, column:3 }.
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
  // Original has NO leading newline ("""content) and multiple lines via embedded literal newlines.
  // New value has no newlines, so raw becomes """single line value""" with NO \n at all.
  // This hits the else-branch: endLocation = { line: 1, column: raw.length }.
  // column: raw.length is correct here — the closing """ is part of the same line,
  // not on its own line, so column: 3 would be wrong.
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

test('should patch mlbs without leading newline to another multi-line value (end-column correctness)', () => {
  // Original has content on the same line as the opening """ (no leading newline).
  // New value also has a newline, so raw = """Hello\nWorld""". The closing """ shares
  // the last line with "World", so loc.end.column must be len("World\"\"\"") = 8,
  // not 3. A wrong column would shift the following key-value to the wrong position.
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
//   - `existing` (from the original CST) is an InlineItem<KeyValue>  — i.e. a named key
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
  const existing = 'title = "test"\r\nversion = "1.0"\r\n\r\n';

  const value = parse(existing);
  value.author = "Test Author";

  const patched = patch(existing, value);

  expect(patched).toContain('\r\n');
  expect(patched.endsWith('\r\n\r\n')).toBe(true);
  
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

test('should normalize bare LF in new value to CRLF to match the document line endings', () => {
  const existing = '[description]\r\ntext = """\r\nFirst line\r\nSecond line\r\n"""\r\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('First line\r\nSecond line\r\n');

  value.description.text = 'Hello world\nand goodbye world\n';
  const patched = patch(existing, value);

  // The TOML structure uses CRLF. The bare \n in the value is normalized to \r\n
  // so the output has no mixed line endings.
  expect(patched).not.toContain('\r\r\n');
  expect(patched.split('\r\n').join('').includes('\n')).toBe(false);
  expect(patched).toEqual('[description]\r\ntext = """\r\nHello world\r\nand goodbye world\r\n"""\r\n');
  expect(parse(patched).description.text).toEqual('Hello world\r\nand goodbye world\r\n');
});

test('should normalize CRLF in new value to LF to match the document line endings', () => {
  const existing = '[description]\ntext = """\nFirst line\nSecond line\n"""\n';

  const value = parse(existing);
  value.description.text = 'Hello world\r\nand goodbye world\r\n';
  const patched = patch(existing, value);

  // The TOML structure uses LF. The \r\n in the value is normalized to \n
  // so the output has no mixed line endings.
  expect(patched).not.toContain('\r\n');
  expect(patched).toEqual('[description]\ntext = """\nHello world\nand goodbye world\n"""\n');
  expect(parse(patched).description.text).toEqual('Hello world\nand goodbye world\n');
});

test('should keep literal \\n and \\r\\n sequences while normalizing real newlines to CRLF', () => {
  const existing = '[description]\r\ntext = """\r\nFirst line\r\n"""\r\n';

  const value = parse(existing);
  value.description.text = 'literal \\n and literal \\r\\n plus real\nline\r\nend';
  const patched = patch(existing, value);

  // The TOML structure uses CRLF. Literal backslash sequences (\n, \r\n) in the value
  // are preserved as \\n / \\r\\n. The real \n and \r\n in the value are both
  // normalized to structural \r\n so the output has no mixed line endings.
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

  // The TOML structure uses LF. Literal backslash sequences (\n, \r\n) in the value
  // are preserved as \\n / \\r\\n. The real \r\n and \n in the value are both
  // normalized to structural \n so the output has no mixed line endings.
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

  // Test with inlineTableStart = 2 (should create sections for project and target)
  const patchedSections = patch(existing, newObject, { inlineTableStart: 2 });
  const expectedSections = dedent`
    name = "Simple"

    [project]

    [project.target]
    type = "xlsm"
    path = "targets/xlsm"
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

  // Test with inlineTableStart = 3 (should create separate sections for all levels)
  const patchedSections = patch(existing, newObject, { inlineTableStart: 3 });
  const expectedSections = dedent`
    name = "Simple"

    [project]

    [project.build]

    [project.build.config]
    mode = "release"
    optimization = true

    [project.build.target]
    type = "xlsm"
    path = "targets/xlsm"
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

  // Test with inlineTableStart = 2 (should create sections for project and target)
  const patchedSections = patch(existing, newObject, { inlineTableStart: 2 });
  const expectedSections = dedent`
    name = "Simple"

    [project]

    [project.target]
    type = "xlsm"
    path = "targets/xlsm"
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

test('should preserve aligned inline comments when patching mixed date kinds with regular Date values', () => {
  const existing = dedent`
    # Demo fixture covering TOML date and time value kinds
    title = "Date parser demo"

    [dates]
    offset_date_time = 1979-05-28T07:32:00-08:00   # offset date-time
    local_date_time  = 1979-05-28T07:32:00         # local date-time
    local_date       = 1979-05-28                  # local date
    local_time       = 07:32:00                    # local time

    [events]
    published_at     = 2026-04-17T09:15:30Z        # UTC timestamp
    cutoff_time      = 18:45:00                    # time only
    release_day      = 2026-05-02                  # date only
    ` + '\n';

  type Operation = { keyPath: string; changed: boolean };

  const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
  const TIME_ONLY_RE = /^\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/u;
  const value = parse(existing);
  const operations: Operation[] = [];

  const incrementDateValues = (input: Record<string, unknown>, pathParts: string[]) => {
    for (const [key, nestedValue] of Object.entries(input)) {
      const nextPath = [...pathParts, key];

      if (nestedValue instanceof Date && TIME_ONLY_RE.test(nestedValue.toISOString())) {
        operations.push({ keyPath: nextPath.join('.'), changed: false });
        continue;
      }

      if (nestedValue instanceof Date) {
        input[key] = new Date(nestedValue.getTime() + ONE_DAY_IN_MS);
        operations.push({ keyPath: nextPath.join('.'), changed: true });
        continue;
      }

      if (!nestedValue || typeof nestedValue !== 'object') {
        continue;
      }

      incrementDateValues(nestedValue as Record<string, unknown>, nextPath);
    }
  };

  incrementDateValues(value as Record<string, unknown>, []);

  expect(operations.filter(operation => operation.changed).map(operation => operation.keyPath)).toEqual([
    'dates.offset_date_time',
    'dates.local_date_time',
    'dates.local_date',
    'events.published_at',
    'events.release_day'
  ]);

  expect(operations.filter(operation => !operation.changed).map(operation => operation.keyPath)).toEqual([
    'dates.local_time',
    'events.cutoff_time'
  ]);

  const patched = patch(existing, value);

  expect(patched).toEqual(dedent`
    # Demo fixture covering TOML date and time value kinds
    title = "Date parser demo"

    [dates]
    offset_date_time = 1979-05-29T07:32:00-08:00   # offset date-time
    local_date_time  = 1979-05-29T07:32:00         # local date-time
    local_date       = 1979-05-29                  # local date
    local_time       = 07:32:00                    # local time

    [events]
    published_at     = 2026-04-18T09:15:30Z        # UTC timestamp
    cutoff_time      = 18:45:00                    # time only
    release_day      = 2026-05-03                  # date only
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

// BUG: Same as validate-CST 'remove table array after leading KV' —
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

  test('should correctly shift a sibling key when patching a no-leading-newline MLBS in a multiline inline table', () => {
    // Regression test for the generateString endLocation column bug.
    //
    // When a MLBS has NO leading newline, its closing """ shares a line with content
    // (e.g. `a = """line1\nlonger text""", b = "x"`). The old code always stored
    // column: 3 (the delimiter length) as the end column for any MLBS with newlines.
    // The correct value is the actual last-line length.
    //
    // A wrong column means the writer computes the wrong shift delta for `b = "x"`,
    // which is on the same line as the closing """. Here the MLBS last line shortens
    // from len('longer text"""') = 14 to len('b"""') = 4 — a delta of -10. With the
    // bug, the delta was 3 - 14 = -11 (off by one), shifting `b` one column too far
    // to the left and corrupting the output.
    const existing =
      'tbl = {'                 + '\n' +
      '    a = """short'        + '\n' +
      'longer text""", b = "x"' + '\n' +
      '}'                       + '\n';

    const obj = parse(existing);
    expect(obj.tbl.a).toEqual('short\nlonger text');
    expect(obj.tbl.b).toEqual('x');

    obj.tbl.a = 'a\nb';
    const patched = patch(existing, obj);

    expect(patched).toEqual(
      'tbl = {'                 + '\n' +
      '    a = """a'            + '\n' +
      'b""", b = "x"'           + '\n' +
      '}'                       + '\n'
    );
    expect(parse(patched).tbl.b).toEqual('x');
  });

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


  test('should delete the only key from a multiline inline table and leave it empty', () => {
    const existing = dedent`
      tbl-1 = {
              only = 1,
      }
      ` + '\n';

    const value = parse(existing);
    delete value['tbl-1'].only;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl-1 = {
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

  test('should preserve multiline inline table formatting when replacing the whole value', () => {
    const existing = dedent`
      t = {
          a = 1,
          b = 2,
      }
      ` + '\n';

    const patched = patch(existing, {
      t: {
        b: 20,
        c: 3,
      },
    });

    expect(patched).toEqual(dedent`
      t = {
          b = 20,
          c = 3,
      }
      ` + '\n');
  });

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

  test('should delete the only key from a commented multiline inline table and preserve surrounding comments', () => {
    const existing = dedent`
      tbl-1 = {#comment
              only = 1,#comment
              #comment
      }#comment
      ` + '\n';

    const value = parse(existing);
    delete value['tbl-1'].only;
    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      tbl-1 = {#comment
              #comment
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

    expect(patch(existing, obj)).toEqual(dedent`
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

  // The same principle as the test above — an emptied table survives as a header — but the
  // parent here is *implicit*: `[a.b]` declares `a` only by virtue of `b` existing under it.
  // Remove `b` and there is no node left to keep `a` alive, so the document comes back as
  // `{}` rather than `{ a: {} }`. Materialising the parent is the missing piece.
  //
  // Not specific to array-of-tables: `[a.b]` and `[[a.b]]` behave identically, and an
  // explicitly declared `[a]` already survives. Found while reviewing #266; see
  // https://github.com/DecimalTurn/toml-patch/pull/266 for the discussion.
  test('should keep an implicit parent table when its only child is removed', () => {
    const fromTable = dedent`
      [a.b]
      n = 1
    ` + '\n';
    const resultTable = patch(fromTable, { a: {} });
    expect(resultTable).toEqual(dedent`
      [a]
    ` + '\n');
    expect(parse(resultTable)).toEqual({ a: {} });

    const fromArrayOfTables = dedent`
      [[a.b]]
      n = 1
    ` + '\n';
    const resultAot = patch(fromArrayOfTables, { a: {} });
    expect(resultAot).toEqual(dedent`
      [a]
    ` + '\n');
    expect(parse(resultAot)).toEqual({ a: {} });
  });

  // In response to https://github.com/DecimalTurn/toml-patch/pull/270#discussion_r3710438584
  // The implicit-parent materialisation guard (isObject + zero keys) replaced a looser
  // inline check (typeof === 'object' && !Array.isArray) that would accept Date, Regexp,
  // and non-empty plain objects as grounds to insert an empty table header.  Each test
  // below exercises one boundary of the guard.
  describe('implicit-parent materialisation guard', () => {

    test('materialises when parent is an empty object', () => {
      const src = dedent`
        [a.b]
        n = 1
      ` + '\n';
      expect(patch(src, { a: {} })).toEqual(dedent`
        [a]
      ` + '\n');
    });

    test('does not materialise when parent has enumerable keys via a sibling Add', () => {
      // `{ a: { c: 2 } }` — the old check would pass, but the guard sees
      // Object.keys({ c: 2 }).length === 1 and skips materialisation.  The Add handler
      // reuses the materialised table today, but the guard is still the right check.
      const src = dedent`
        [a.b]
        n = 1
      ` + '\n';
      expect(patch(src, { a: { c: 2 } })).toEqual(dedent`
        [a]
        c = 2
      ` + '\n');
    });

    test('does not materialise when parent is a scalar (number)', () => {
      // A scalar at the parent path would pass neither old nor new check.
      const src = dedent`
        [a.b]
        n = 1
      ` + '\n';
      expect(patch(src, { a: 42 })).toEqual(dedent`
        a = 42
      ` + '\n');
    });

    test('does not materialise when target value is null (parseJS rejects)', () => {
      // `parseJS` throws on null values before diffing starts.
      const src = dedent`
        [a.b]
        n = 1
      ` + '\n';
      expect(() => patch(src, { a: null })).toThrow('"null" values are not supported');
    });

    test('does not materialise when parent is an array', () => {
      const src = dedent`
        [a.b]
        n = 1
      ` + '\n';
      expect(patch(src, { a: [1, 2] })).toEqual(dedent`
        a = [ 1, 2 ]
      ` + '\n');
    });

    test('materialises when parent is a null-prototype empty object', () => {
      // parse() returns Object.create(null) — the guard must handle these.
      const src = dedent`
        [a.b]
        n = 1
      ` + '\n';
      const obj = parse(src);
      delete obj.a.b;
      expect(patch(src, obj)).toEqual(dedent`
        [a]
      ` + '\n');
    });

    test('does not materialise when parent has remaining siblings (another table)', () => {
      const src = dedent`
        [a.b]
        n = 1
        [a.c]
        m = 2
      ` + '\n';
      // Remove a.b, keep a.c.  remainingSiblings at ["a"] is non-empty, so the guard
      // is never reached.
      expect(patch(src, { a: { c: { m: 3 } } })).toEqual(dedent`
        [a.c]
        m = 3
      ` + '\n');
    });

    test('materialises implicit parent from AOT child removal', () => {
      const src = dedent`
        [[a.b]]
        n = 1
      ` + '\n';
      expect(patch(src, { a: {} })).toEqual(dedent`
        [a]
      ` + '\n');
    });

    // ── same boundaries, but with TOML comments ──────────────────────────
    // Comments make the issue more visible: a missing [a] header drops its
    // preceding comments, a mis-materialised header lands in the wrong spot,
    // and comment-ownership determines which header claims which comment.

    test('with comments: materialises when parent is an empty object', () => {
      const src = dedent`
        # top comment
        [a.b]
        # child comment
        n = 1
      ` + '\n';
      expect(patch(src, { a: {} })).toEqual(dedent`
        # top comment
        [a]
      ` + '\n');
    });



    test('with comments: no blank line before materialised parent when sibling is added', () => {
      const src = dedent`
        # top comment
        [a.b]
        n = 1
      ` + '\n';
      expect(patch(src, { a: { c: 2 } })).toEqual(dedent`
        # top comment
        [a]
        c = 2
      ` + '\n');
    });

    test('with comments: materialises implicit parent from AOT child removal', () => {
      const src = dedent`
        # top comment
        [[a.b]]
        n = 1
      ` + '\n';
      expect(patch(src, { a: {} })).toEqual(dedent`
        # top comment
        [a]
      ` + '\n');
    });

    test('with comments: does not materialise when parent is an array', () => {
      const src = dedent`
        # top comment
        [a.b]
        n = 1
      ` + '\n';
      expect(patch(src, { a: [1, 2] })).toEqual(dedent`
        # top comment
        a = [ 1, 2 ]
      ` + '\n');
    });

    test('with comments: materialises null-prototype empty object', () => {
      const src = dedent`
        # top comment
        [a.b]
        n = 1
      ` + '\n';
      const obj = parse(src);
      delete obj.a.b;
      expect(patch(src, obj)).toEqual(dedent`
        # top comment
        [a]
      ` + '\n');
    });

    // R3: a blank line severs ownership.  The comment is unowned and pinned,
    // so it does not transfer to the materialised parent.
    test('with comments: blank line severs ownership, comment does not transfer', () => {
      const src = dedent`
        # top comment

        [a.b]
        n = 1
      ` + '\n';
      expect(patch(src, { a: {} })).toEqual(dedent`
        # top comment

        [a]
      ` + '\n');
    });

    // R1: trailing comment on the same line as the header shouldn't be kept.
    // This comment ownership is ambiguous, but considering that the comment is to the right
    // of the header, it is more likely to be about the LEAF than about the table itself.
    // The materialised parent is not a leaf, so the comment is dropped.
    test('with comments: trailing comment on header line does not survive materialisation', () => {
      const src = dedent`
        [a.b] # header note
        n = 1
      ` + '\n';
      expect(patch(src, { a: {} })).toEqual(dedent`
        [a]
      ` + '\n');
    });

    // Multiple AOT entries with a preceding comment.
    test('with comments: materialises implicit parent from multiple AOT entries', () => {
      const src = dedent`
        # top comment
        [[a.b]]
        n = 1

        [[a.b]]
        n = 2
      ` + '\n';
      expect(patch(src, { a: {} })).toEqual(dedent`
        # top comment
        [a]
      ` + '\n');
    });

    // Multiple AOT entries with a preceding comment (with single deletion).
    // In this context, we are ok with a blank line before the materialised parent, 
    // because the comment could be about the entire AOT section, so we don't necessarly want 
    // it deleted, but we also don't want to make it owned by the other AOT entry, 
    // so we leave it unowned and pinned.  The blank line is the only way to do that.
    test('with comments: materialises implicit parent from multiple AOT entries for single deletion', () => {
      const src = dedent`
        # top comment
        [[a.b]]
        n = 1

        [[a.b]]
        n = 2
      ` + '\n';
      expect(patch(src, { a: { b: [ { n: 2 }] } })).toEqual(dedent`
        # top comment

        [[a.b]]
        n = 2
      ` + '\n');
    });

    // R2: when AOT entries are converted to a Table in-place, the node's
    // When the AOT in-place path converts [[a.b]] to [a], the node's loc.end
    // must be shrunk to the header span so subsequent operations in the same
    // patch (like adding a sibling table) position content correctly.
    test('AOT in-place + add sibling: no spurious blank line before new table', () => {
      const src = dedent`
        # top comment
        [[a.b]]
        n = 1

        [[a.b]]
        n = 2
      ` + '\n';
      expect(patch(src, { a: {}, x: { v: 1 } })).toEqual(dedent`
        # top comment
        [a]

        [x]
        v = 1
      ` + '\n');
    });

  });

  test('reordering of AOT entries with comments - with table header', () => {
    const src = dedent`
      [a]
      # first entry comment
      [[a.b]]
      n = 1

      # second entry comment
      [[a.b]]
      n = 2
    ` + '\n';

    const fmt = TomlFormat.default();
    fmt.updateOrder = true;

    expect(patch(src, { a: { b: [ { n: 2 }, { n: 1 } ] } }, fmt )).toEqual(dedent`
      [a]
      # second entry comment
      [[a.b]]
      n = 2

      # first entry comment
      [[a.b]]
      n = 1
    ` + '\n');
  });

    test('reordering of AOT entries with comments - with table header - compact form', () => {
    const src = dedent`
      [a]

      # first entry comment
      [[a.b]]
      n = 1
      # second entry comment
      [[a.b]]
      n = 2
    ` + '\n';

    const fmt = TomlFormat.default();
    fmt.updateOrder = true;

    expect(patch(src, { a: { b: [ { n: 2 }, { n: 1 } ] } }, fmt )).toEqual(dedent`
      [a]

      # second entry comment
      [[a.b]]
      n = 2
      # first entry comment
      [[a.b]]
      n = 1
    ` + '\n');
  });

  // We want to keep the comments with their respective entries
  // even if there is no table header for the parent table, and even 
  // if the order of the entries is changed , so the order of the comments 
  // should follow the order of the entries.  
  test('reordering of AOT entries with comments', () => {
    const src = dedent`
      # first entry comment
      [[a.b]]
      n = 1

      # second entry comment
      [[a.b]]
      n = 2
    ` + '\n';

    const fmt = TomlFormat.default();
    fmt.updateOrder = true;

    expect(patch(src, { a: { b: [ { n: 2 }, { n: 1 } ] } }, fmt )).toEqual(dedent`
      # second entry comment
      [[a.b]]
      n = 2

      # first entry comment
      [[a.b]]
      n = 1
    ` + '\n');
  });

  // Blank line between comment and its entry on both entries.
  // A blank line severs comment ownership (R3), so comments stay
  // in their original positions and the second entry moves up to the first position.
  // This looks like the comment remains at the end. It's not ideal, but
  // it's the only way I can think of that doesn't violate R3.
  test('reordering of AOT entries with comments - blank lines between comments and entries', () => {
    const src = dedent`
      [a]

      # first entry comment

      [[a.b]]
      n = 1

      # second entry comment

      [[a.b]]
      n = 2
    ` + '\n';

    const fmt = TomlFormat.default();
    fmt.updateOrder = true;

    expect(patch(src, { a: { b: [ { n: 2 }, { n: 1 } ] } }, fmt )).toEqual(dedent`
      [a]

      # first entry comment

      [[a.b]]
      n = 2

      [[a.b]]
      n = 1

      # second entry comment
    ` + '\n');

      
  });

  // Mixed: first entry has blank between comment and entry (severed),
  // second doesn't (comment travels with entry).
  test('reordering of AOT entries with comments - mixed blank lines', () => {
    const src = dedent`
      [a]

      # first entry comment

      [[a.b]]
      n = 1
      # second entry comment
      [[a.b]]
      n = 2
    ` + '\n';

    const fmt = TomlFormat.default();
    fmt.updateOrder = true;

    // # first is severed by blank line, stays in place.
    // # second travels with its entry.
    expect(patch(src, { a: { b: [ { n: 2 }, { n: 1 } ] } }, fmt )).toEqual(dedent`
      [a]

      # first entry comment
      
      # second entry comment
      [[a.b]]
      n = 2
      [[a.b]]
      n = 1
    ` + '\n');
  });

  // No table header, compact form
  test('reordering of AOT entries with comments - no header compact form', () => {
    const src = dedent`
      # first entry comment
      [[a.b]]
      n = 1
      # second entry comment
      [[a.b]]
      n = 2
    ` + '\n';

    const fmt = TomlFormat.default();
    fmt.updateOrder = true;

    expect(patch(src, { a: { b: [ { n: 2 }, { n: 1 } ] } }, fmt )).toEqual(dedent`
      # second entry comment
      [[a.b]]
      n = 2
      # first entry comment
      [[a.b]]
      n = 1
    ` + '\n');
  });

  // No table header, blank lines between comments and entries.
  // Blank lines sever ownership — comments stay, entries swap.
  test('reordering of AOT entries with comments - no header blank lines between comments and entries', () => {
    const src = dedent`
      # first entry comment

      [[a.b]]
      n = 1

      # second entry comment

      [[a.b]]
      n = 2
    ` + '\n';

    const fmt = TomlFormat.default();
    fmt.updateOrder = true;

    expect(patch(src, { a: { b: [ { n: 2 }, { n: 1 } ] } }, fmt )).toEqual(dedent`
      # first entry comment

      [[a.b]]
      n = 2

      [[a.b]]
      n = 1

      # second entry comment
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

  test('should preserve multiline inline table formatting when replacing an object inside a multiline inline array', () => {
    const existing = dedent`
      items = [
        {
          name = "Hammer",
          color = "red",
        },
        {
          name = "Nail",
          color = "gray",
        }
      ]
      ` + '\n';

    const obj = parse(existing);
    obj.items[0] = { name: 'Hammer', sku: 'H1' };

    expect(patch(existing, obj)).toEqual(dedent`
      items = [
        {
          name = "Hammer",
          sku = "H1",
        },
        {
          name = "Nail",
          color = "gray",
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

describe('quoted keys', () => {

  describe('simple quoted keys', () => {

    const existing = dedent`
      "quoted key" = "value"
      ` + '\n';

    test('existing value is parsed correctly', () => {
      const obj = parse(existing);
      expect(obj['quoted key']).toEqual('value');
    });

    test('should edit a quoted key and preserve the quotes', () => {

      const obj = parse(existing);
      obj['quoted key'] = 'new value';

      expect(patch(existing, obj)).toEqual(dedent`
        "quoted key" = "new value"
        ` + '\n');
    });

    test('should rename a quoted key and preserve the value', () => {

      const obj = parse(existing);
      obj['renamed key'] = obj['quoted key'];
      delete obj['quoted key'];

      expect(patch(existing, obj)).toEqual(dedent`
        "renamed key" = "value"
        ` + '\n');
    });

  });

  // Add entries here to automatically run all three tests for each escape sequence.
  // - tomlEscape   : raw escape chars as they appear inside a TOML basic-string key,
  //                  used for both TOML input and expected patch output (e.g. '\\n').
  // - jsParsedChar : the JS character that TOML produces after decoding the escape.
  const escapeSequenceCases = [
    { tomlEscape: '\\n',     jsParsedChar: '\n' },
    { tomlEscape: '\\u263A', jsParsedChar: '\u263A' },
    { tomlEscape: '\\t',     jsParsedChar: '\t' },
  ];

  describe.each(escapeSequenceCases)(
    'quoted key with $tomlEscape escape sequence',
    ({ tomlEscape, jsParsedChar }) => {
      const existing     = '"quoted' + tomlEscape + 'key" = "value"\n';
      const jsKey        = 'quoted'  + jsParsedChar + 'key';
      const renamedJsKey = 'renamed' + jsParsedChar + 'key';

      test('existing value is parsed correctly', () => {
        expect(existing).toEqual('"quoted' + tomlEscape + 'key" = "value"\n');
        const obj = parse(existing);
        expect(obj[jsKey]).toEqual('value');
      });

      test('should edit the value and preserve the escaped key', () => {
        const obj = parse(existing);
        obj[jsKey] = 'new value';
        expect(patch(existing, obj)).toEqual('"quoted' + tomlEscape + 'key" = "new value"\n');
      });

      test('should rename the key and preserve the value', () => {
        const obj = parse(existing);
        obj[renamedJsKey] = obj[jsKey];
        delete obj[jsKey];
        const patched = patch(existing, obj);
        expect(patched).toEqual('"renamed' + tomlEscape + 'key" = "value"\n');
      });
    }
  );

});

describe('basic string escape preservation', () => {
  test('should preserve escaped emoji sequence when editing a basic string value', () => {
    const existing = 'message = "hello ' + '\\u263A' + '"\n';

    const obj = parse(existing);
    expect(obj.message).toEqual('hello ☺');

    obj.message = obj.message + ' updated';

    // Regression expectation: preserve the original escape sequence instead of emitting raw emoji.
    expect(patch(existing, obj)).toEqual('message = "hello ' + '\\u263A' + ' updated"\n');
  });

  test('should preserve \\U0001F600 long-form escape in basic string value after patching', () => {
    // \U0001F600 is the long-form (8-digit) Unicode escape for 😀.
    // After parse→patch the long form must survive, not be normalised to a raw emoji.
    const existing = 'emoji = "Hello ' + '\\U0001F600' + '"\n';

    const obj = parse(existing);
    expect(obj.emoji).toEqual('Hello \u{1F600}');

    obj.emoji = 'Bonjour \u{1F600}';

    expect(patch(existing, obj)).toEqual('emoji = "Bonjour ' + '\\U0001F600' + '"\n');
  });

  test('should prefer first-seen escape form when same char has two escape representations', () => {
    // The raw string has \u263A (4-digit form) before \U0000263A (8-digit form).
    // collectPreferredEscapes records the first seen form per decoded character,
    // so \u263A should be the preferred form for all ☺ occurrences in the output.
    const existing = 'msg = "' + '\\u263A' + ' and ' + '\\U0000263A' + '"\n';

    const obj = parse(existing);
    expect(obj.msg).toEqual('☺ and ☺');

    obj.msg = '☺ twice updated';

    // \u263A was recorded first, so it is used for every ☺ in the new value.
    expect(patch(existing, obj)).toEqual('msg = "' + '\\u263A' + ' twice updated"\n');
  });

  test('should apply escape preference even when the char also appears literally in the original', () => {
    // The raw contains a literal ☺ first, then \u263A as an escape.
    // collectPreferredEscapes only processes \-sequences, so it records \u263A.
    // When the new value contains ☺, the preferred escape form (\u263A) wins.
    const existing = 'msg = "☺ and ' + '\\u263A' + '"\n';

    const obj = parse(existing);
    expect(obj.msg).toEqual('☺ and ☺');

    obj.msg = '☺ updated';

    // The escaped form (\u263A) is preferred because it is the only escape
    // recorded by collectPreferredEscapes; the leading literal ☺ has no effect.
    expect(patch(existing, obj)).toEqual('msg = "' + '\\u263A' + ' updated"\n');
  });

  test('should preserve \\xHH escape (TOML 1.1) in basic string value after patching', () => {
    // \x41 decodes to 'A'. After parse→patch the short hex escape must survive.
    const existing = 'key = "\\x41"\n';

    const obj = parse(existing);
    expect(obj.key).toEqual('A');

    obj.key = 'A+';

    expect(patch(existing, obj)).toEqual('key = "\\x41+"\n');
  });
});

describe('multi-line basic string escape preservation', () => {
  test('should preserve escaped emoji sequence when editing a multi-line basic string value', () => {
    const existing = 'message = """hello ' + '\\u263A' + '"""\n';

    const obj = parse(existing);
    expect(obj.message).toEqual('hello ☺');

    obj.message = obj.message + ' updated';

    // Regression expectation: preserve the original escape sequence instead of emitting raw emoji.
    expect(patch(existing, obj)).toEqual('message = """hello ' + '\\u263A' + ' updated"""\n');
  });

  test('should preserve \\t escape in multiline basic string value after patching', () => {
    // In a multiline basic string, a tab character is allowed *literally* (not mandatory to escape).
    // If the author chose to write \t as an explicit escape, that preference must be preserved.
    // This is the meaningful coverage for \t escape-preference — unlike singleline basic strings
    // where \t is a mandatory escape and would always be rendered as \t regardless.
    const existing = 'key = """col1' + '\\t' + 'col2"""\n';

    const obj = parse(existing);
    expect(obj.key).toEqual('col1\tcol2');

    obj.key = 'col1\tupdated';

    expect(patch(existing, obj)).toEqual('key = """col1' + '\\t' + 'updated"""\n');
  });

  test('should escape embedded triple double quotes when patching a multiline basic string value', () => {
    // TOML spec allows at most two consecutive unescaped double quotes inside a MLBS.
    // A value containing """ must have at least one quote escaped: ""\" or "\""
    const existing = dedent`
      msg = """hello world"""
    ` + '\n';

    const obj = parse(existing);
    expect(obj.msg).toEqual('hello world');

    obj.msg = 'Three quotes: """';

    expect(patch(existing, obj)).toEqual(dedent`
      msg = """Three quotes: ""\""""
    ` + '\n');
  });

  test('should preserve \\xHH escape (TOML 1.1) in multiline basic string value after patching', () => {
    // \\x41 decodes to 'A'. In MLBS \\x is optional but if the author chose it, preserve it.
    const existing = 'key = """\\x41"""\n';

    const obj = parse(existing);
    expect(obj.key).toEqual('A');

    obj.key = 'A updated';

    expect(patch(existing, obj)).toEqual('key = """\\x41 updated"""\n');
  });
});

describe('mandatory escape characters through patch', () => {
  // These tests verify that control characters which are *forbidden* in raw TOML strings
  // are always escaped in the output, regardless of escape-preference. Coverage is at the
  // patch() integration level to ensure the full pipeline (parse → mutate → generate → write)
  // produces valid TOML for these edge-case characters.

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
    // In a singleline basic string, \r is forbidden as a literal and must be escaped.
    const existing = 'msg = "hello"\n';

    const obj = parse(existing);
    obj.msg = 'line\rend';

    const patched = patch(existing, obj);
    expect(patched).toBe('msg = "line\\rend"\n');
    expect(parse(patched).msg).toEqual('line\rend');
  });

  test('should escape an arbitrary disallowed control character (ESC, \\x1b) as \\uXXXX', () => {
    // U+001B (ESC) is in the 0x00–0x1F range that is forbidden in basic strings.
    // It has no named short escape, so it must be rendered as \u001b.
    // Note: the fast path (no preferred escapes → JSON.stringify) emits lowercase hex.
    const existing = 'msg = "hello"\n';

    const obj = parse(existing);
    obj.msg = 'esc\x1Bchar';

    const patched = patch(existing, obj);
    expect(patched).toBe('msg = "esc\\u001bchar"\n');
    expect(parse(patched).msg).toEqual('esc\x1Bchar');
  });

  test('should escape DEL (\\x7f) as \\u007F when patching a basic string value', () => {
    // U+007F is explicitly disallowed in TOML basic strings and has no named escape.
    // Note: JSON.stringify does not escape U+007F (it only escapes U+0000-U+001F),
    // so the fast path in escapeStringContent must handle it explicitly.
    const existing = 'msg = "hello"\n';

    const obj = parse(existing);
    obj.msg = 'del\x7Fchar';

    const patched = patch(existing, obj);
    expect(patched).toBe('msg = "del\\u007Fchar"\n');
    expect(parse(patched).msg).toEqual('del\x7Fchar');
  });

  test('should escape disallowed control characters in a multiline basic string', () => {
    // In MLBS mode, only a stricter set of controls are forbidden (0x00–0x07, 0x0B,
    // 0x0E–0x1F, 0x7F). Tab (0x09), LF (0x0A) and CR (0x0D) are allowed literally.
    // Backspace (0x08) is still forbidden and must be escaped.
    const existing = 'msg = """hello"""\n';

    const obj = parse(existing);
    obj.msg = 'back\x08space';

    const patched = patch(existing, obj);
    expect(patched).toBe('msg = """back\\bspace"""\n');
    expect(parse(patched).msg).toEqual('back\x08space');
  });
});


describe('Mixed line endings', () => {
  test('should preserve mixed escaped line endings when editing a value', () => {
    const existing = 
      'key = "line1\\r\\nline2\\nline3\\rline4"' + '\n';

    const obj = parse(existing);
    expect(obj.key).toEqual('line1\r\nline2\nline3\rline4');

    obj.key = 'updated\r\nvalue';

    expect(patch(existing, obj)).toEqual('key = "updated\\r\\nvalue"\n');
  });

  
  test.each([
    { updateValue: 'updated\r\nvalue', description: 'CRLF' },
    { updateValue: 'updated\nvalue', description: 'LF' }
  ])('should normalize line endings when editing a MLBS value. - CRLF document with $description update', ({ updateValue }) => {
    const existing = 'key = """line1\r\nline2\nline3"""\n';

    const obj = parse(existing);
    expect(obj.key).toEqual('line1\r\nline2\nline3');

    obj.key = updateValue;

    // detectNewline finds \r\n first (inside the MLBS value), so the document format
    // is CRLF. The single trailing \n is counted as 1 trailing newline and output as \r\n.
    expect(patch(existing, obj)).toEqual('key = """updated\r\nvalue"""\r\n');
  });


  test.each([
    { updateValue: 'updated\r\nvalue', description: 'CRLF' },
    { updateValue: 'updated\nvalue', description: 'LF' }
  ])('should normalize line endings when editing a MLBS value. - LF document with $description update', ({ updateValue }) => {
    const existing = 'key = """line1\nline2\r\nline3"""\r\n';

    const obj = parse(existing);
    expect(obj.key).toEqual('line1\nline2\r\nline3');

    obj.key = updateValue;

    // detectNewline finds \n first (inside the MLBS value), so the document format
    // is LF. The single trailing \r\n is counted as 1 trailing newline and output as \n.
    // Note that even when we updated using a CRLF format string, the output is still
    // LF because the original document format is LF.
    expect(patch(existing, obj)).toEqual('key = """updated\nvalue"""\n');
  });
});

describe('Root key-value placement', () => {
  test('should add new root key-value before existing table section', () => {
    const existing = dedent`
      [section]
      key = "value"
    ` + '\n';

    const patched = patch(existing, {
      new_root: 42,
      section: { key: 'value' }
    });

    expect(patched).toEqual(dedent`
      new_root = 42

      [section]
      key = "value"
    ` + '\n');
  });

  // Default (updateOrder off): patch() does not reorder existing keys to match JS object
  // order -- new_root is a genuinely new key, so it's simply appended after mytable, which
  // keeps its original position. See docs/PLAN-Update-Order.md.
  test('should append new root key-value after existing inline table when updateOrder is off', () => {
    const existing = dedent`
      mytable = {
         key = "value"
      }
      ` + '\n';

    const patched = patch(existing, {
      new_root: 42,
      mytable: { key: 'value' }
    });

    expect(patched).toEqual(dedent`
      mytable = {
         key = "value"
      }
      new_root = 42
    ` + '\n');
  });

  // With updateOrder: true, patch() honours the JS object's key order: new_root appeared
  // before mytable in the patched object, so it's hoisted before it in the output. This is
  // the plan's canonical Add-plus-reorder case (docs/PLAN-Update-Order.md).
  test('should add new root key-value before inline table if appearing before in the patched object', () => {
    const existing = dedent`
      mytable = {
         key = "value"
      }
      ` + '\n';

    const patched = patch(existing, {
      new_root: 42,
      mytable: { key: 'value' }
    }, { updateOrder: true });

    expect(patched).toEqual(dedent`
      new_root = 42
      mytable = {
         key = "value"
      }
    ` + '\n');
  });

  test('should add new root key-value before existing table section - Even if the new key is added after the section in the patched object', () => {
    const existing = dedent`
      [section]
      key = "value"
    ` + '\n';

    const patched = patch(existing, {
      section: { key: 'value' },
      new_root: 42,
    });

    expect(patched).toEqual(dedent`
      new_root = 42

      [section]
      key = "value"
    ` + '\n');
  });

  test('should add new root key-value before existing table section while preserving existing root keys', () => {
    const existing = dedent`
      name = "foo"

      [section]
      key = "value"
    ` + '\n';

    const patched = patch(existing, {
      name: 'foo',
      project_doc_max_bytes: 65536,
      section: { key: 'value' }
    });

    expect(patched).toEqual(dedent`
      name = "foo"
      project_doc_max_bytes = 65536

      [section]
      key = "value"
    ` + '\n');
  });

  test('should add 2 new root key-value pairs before existing table section', () => {
    const existing = dedent`
      [section]
      key = "value"
    ` + '\n';

    const patched = patch(existing, {
      name: 'foo',
      age: 30,
      section: { key: 'value' }
    });

    expect(patched).toEqual(dedent`
      name = "foo"
      age = 30

      [section]
      key = "value"
    ` + '\n');
  });

  test('should add new root key-value before existing AOT section', () => {
    const existing = dedent`
      [[tasks]]
      name = "build"
    ` + '\n';

    const patched = patch(existing, {
      version: '1.0.0',
      tasks: [{ name: 'build' }]
    });

    expect(patched).toEqual(dedent`
      version = "1.0.0"

      [[tasks]]
      name = "build"
    ` + '\n');
  });
});

describe('implicit intermediate key removal (dotted table keys)', () => {
  test('should remove a section whose key is an implicit parent of a dotted table key', () => {
    const existing = dedent`
      [project]
      name = "test"

      [references.VBIDE]
      version = "5.3"
      guid = "{0002E157-0000-0000-C000-000000000046}"
    ` + '\n';

    const patched = patch(existing, { project: { name: 'test-updated' } });

    expect(patched).toContain('[project]');
    expect(patched).toContain('name = "test-updated"');
    expect(patched).not.toContain('[references.VBIDE]');
    expect(patched).not.toContain('version');
    expect(patched).not.toContain('guid');
  });

  test('should remove a deeply nested section when implicit parent key is absent from patch', () => {
    const existing = dedent`
      [project]
      name = "test"

      [x.y.z]
      value = 42
    ` + '\n';

    const patched = patch(existing, { project: { name: 'test-updated' } });

    expect(patched).toContain('[project]');
    expect(patched).toContain('name = "test-updated"');
    expect(patched).not.toContain('[x.y.z]');
    expect(patched).not.toContain('value');
  });

  test('should remove a section whose dotted key matches exactly a missing key path', () => {
    // Here the table key is ["deeply", "nested"] and the removed key is "deeply".
    // No CST node has key ["deeply"] alone — it's the implicit parent of ["deeply","nested"].
    const existing = dedent`
      [deeply.nested]
      value = 1
    ` + '\n';

    const patched = patch(existing, {});

    expect(patched).not.toContain('deeply');
    expect(patched).not.toContain('nested');
    expect(patched).not.toContain('value');
  });

  test('should remove a mix of root KVs and implicit-parent table sections', () => {
    const existing = dedent`
      title = "My App"
      [server]
      host = "localhost"
      [references.VBIDE]
      version = "5.3"
    ` + '\n';

    const patched = patch(existing, { title: 'My App' });

    expect(patched).toContain('title = "My App"');
    expect(patched).not.toContain('[server]');
    expect(patched).not.toContain('[references.VBIDE]');
  });

  test('should preserve a section when its implicit parent IS provided in the patch', () => {
    // When the patch explicitly includes the parent key, the section should survive.
    const existing = dedent`
      [references.VBIDE]
      version = "5.3"
    ` + '\n';

    const patched = patch(existing, {
      references: { VBIDE: { version: '5.3' } }
    });

    expect(patched).toContain('[references.VBIDE]');
    expect(patched).toContain('version = "5.3"');
  });

  test('should remove multiple tables sharing the same implicit parent prefix', () => {
    // When multiple dotted tables share the same implicit parent, removing that
    // parent should remove all of them.
    const existing = dedent`
      [references.VBIDE]
      version = "5.3"

      [references.other]
      value = 42
    ` + '\n';

    const patched = patch(existing, {});

    expect(patched).not.toContain('[references.VBIDE]');
    expect(patched).not.toContain('version');
    expect(patched).not.toContain('[references.other]');
    expect(patched).not.toContain('value');
  });

  test('should remove at an intermediate level of a deeply dotted key', () => {
    // Table key is ["x", "y", "z"]. Removing at path ['x', 'y'] should still
    // match and remove the table — neither ['x'] nor ['x','y'] has its own node.
    const existing = dedent`
      [x.y.z]
      value = 1
    ` + '\n';

    const patched = patch(existing, {});

    expect(patched).not.toContain('x');
    expect(patched).not.toContain('value');
  });

  test('should remove a table array whose key starts with the implicit parent path', () => {
    // [[products.variants]] creates a TableArray with key ["products", "variants"].
    // Removing at path ['products'] should find it via prefix match.
    const existing = dedent`
      title = "Catalog"

      [[products.variants]]
      sku = 123
    ` + '\n';

    const patched = patch(existing, { title: 'Catalog' });

    expect(patched).toContain('title = "Catalog"');
    expect(patched).not.toContain('[[products.variants]]');
    expect(patched).not.toContain('sku');
  });

  test('should remove table arrays with an implicitly-keyed parent alongside other removals', () => {
    // Combined scenario: edit a root KV, remove a simple table section, and
    // remove an implicitly-keyed table array in a single patch.
    const existing = dedent`
      title = "original"
      version = 1

      [server]
      host = "localhost"

      [[products.variants]]
      sku = 999
    ` + '\n';

    const patched = patch(existing, { title: 'updated' });

    expect(patched).toContain('title = "updated"');
    expect(patched).not.toContain('version');
    expect(patched).not.toContain('[server]');
    expect(patched).not.toContain('[[products.variants]]');
    expect(patched).not.toContain('sku');
  });

  test('should remove everything via empty patch when both simple and dotted tables exist', () => {
    const existing = dedent`
      name = "app"
      [server]
      host = "localhost"
      [references.VBIDE]
      version = "5.3"
      [[products.variants]]
      sku = 123
    ` + '\n';

    const patched = patch(existing, {});

    expect(patched.trim()).toBe('');
  });
});




describe('Temporal.ZonedDateTime handling', () => {

    test('should preserve zero offset after editing date', () => {
    const existing = dedent`
      date = 2023-01-01T00:00:00Z
    ` + '\n';
   
    const parsed = parse(existing, { temporal: true });
    expect(parsed.date).toBeInstanceOf(Temporal.ZonedDateTime);
    parsed.date = parsed.date.add({ days: 1 });

    const patched = patch(existing, parsed);

    expect(patched).toEqual(dedent`
      date = 2023-01-02T00:00:00Z
    ` + '\n');
  });

  test('should preserve zero offset after editing date', () => {
    const existing = dedent`
      date = 2023-01-01T00:00:00+00:00
    ` + '\n';
   
    const parsed = parse(existing, { temporal: true });
    expect(parsed.date).toBeInstanceOf(Temporal.ZonedDateTime);
    parsed.date = parsed.date.add({ days: 1 });

    const patched = patch(existing, parsed);

    expect(patched).toEqual(dedent`
      date = 2023-01-02T00:00:00+00:00
    ` + '\n');
  });

    test('should preserve negative zero offset after editing date', () => {
    const existing = dedent`
      date = 2023-01-01T00:00:00-00:00
    ` + '\n';
   
    const parsed = parse(existing, { temporal: true });
    expect(parsed.date).toBeInstanceOf(Temporal.ZonedDateTime);
    parsed.date = parsed.date.add({ days: 1 });

    const patched = patch(existing, parsed);

    expect(patched).toEqual(dedent`
      date = 2023-01-02T00:00:00-00:00
    ` + '\n');
  });

});

describe('BigInt handling', () => {

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

describe('commented multiline array edge cases', () => {

  test('should preserve closing bracket when adding new key after commented multiline array', () => {
    const src = 'arr = [\n  1, # one\n  2, # two\n]\n';
    const result = patch(src, { arr: [1, 2], z: 1 });
    expect(result).toEqual(dedent`
      arr = [
        1, # one
        2, # two
      ]
      z = 1
    ` + '\n');
  });

  test('should correctly empty a commented multiline array', () => {
    const src = 'arr = [\n  1, # one\n  2, # two\n]\n';
    const result = patch(src, { arr: [] });
    // Should produce valid TOML, not mangled output
    expect(() => parse(result)).not.toThrow();
    // Should contain the key with an empty array
    expect(result).toContain('arr');
    expect(result).toContain('[');
    expect(result).toContain(']');
  });

});

describe('table to scalar replacement', () => {

  test('should hoist scalar above preceding table section when replacing a table', () => {
    const src = dedent`
      [s]
      k = "v"

      [u]
      m = 3
    ` + '\n';
    const result = patch(src, { s: { k: 'v' }, u: false });
    // Re-parsing should give u as a top-level key, not nested under s
    const reparsed = parse(result);
    expect(reparsed.u).toBe(false);
    expect(reparsed.s).toEqual({ k: 'v' });
    // The output should not nest u under s
    expect(result).not.toMatch(/\[s\][\s\S]*u = false/);
  });

  test('should correctly handle table-to-scalar when table is first', () => {
    const src = dedent`
      [u]
      m = 3

      [s]
      k = "v"
    ` + '\n';
    const result = patch(src, { u: false, s: { k: 'v' } });
    const reparsed = parse(result);
    expect(reparsed.u).toBe(false);
    expect(reparsed.s).toEqual({ k: 'v' });
  });

  // BUG (reported via GitHub Copilot PR review on #260): a structural table->scalar edit
  // regenerates a fresh KV/Table node via writer.ts's replace(), in-place at the original's
  // position. When that same patch also reorders root entries (updateOrder: true),
  // applyContainerMoves's isEligibleForLeading check (src/update-order.ts) keys R2 adjacency
  // ownership off prePatchNodes identity -- so the fresh replacement node is wrongly treated
  // as ineligible, same as a genuinely new (Added) entry. The leading comment above it gets
  // left pinned at its old physical position instead of travelling with the entry to its new
  // spot. Fixed by treating structural-replacement nodes as eligible too, not just
  // pre-existing ones.
  test('should carry the leading comment along when a table->scalar edit is combined with a reorder', () => {
    const src = dedent`
      # comment about w
      [x.y.z.w]
      a = 1

      [other]
      b = 2
    ` + '\n';

    const result = patch(src, {
      other: { b: 2 },
      x: { y: { z: { w: 42 } } }
    }, { updateOrder: true });

    expect(result).toEqual(dedent`
      [other]
      b = 2

      # comment about w
      [x.y.z]
      w = 42
    ` + '\n');
  });

  // Same bug as above, but through the single-segment replace() call site (table becomes a
  // root-level scalar directly, rather than a fresh nested table).
  test('should carry the leading comment along when a single-segment table->scalar edit is combined with a reorder', () => {
    const src = dedent`
      foo = 1

      # comment about w
      [w]
      a = 1
    ` + '\n';

    const result = patch(src, {
      w: 42,
      foo: 1
    }, { updateOrder: true });

    expect(result).toEqual(dedent`
      # comment about w
      w = 42

      foo = 1
    ` + '\n');
  });

});

describe('inlineTableStart nested table handling', () => {

  test('should preserve nested tables with inlineTableStart >= 2', () => {
    const src = dedent`
      [project]
      name = "my-app"
    ` + '\n';
    const value = parse(src);
    value.tool = { ruff: { line_length: 88 } };
    const result = patch(src, value, { inlineTableStart: 2 });
    // Re-parse should see the nested table structure
    const reparsed = parse(result);
    expect(reparsed.tool).toBeDefined();
    expect(reparsed.tool.ruff).toBeDefined();
    expect(reparsed.tool.ruff.line_length).toBe(88);
  });

  test('should preserve nested tables with inlineTableStart = 3', () => {
    const src = dedent`
      [project]
      name = "my-app"
    ` + '\n';
    const value = parse(src);
    value.tool = { ruff: { line_length: 88 } };
    const result = patch(src, value, { inlineTableStart: 3 });
    const reparsed = parse(result);
    expect(reparsed.tool).toBeDefined();
    expect(reparsed.tool.ruff).toBeDefined();
    expect(reparsed.tool.ruff.line_length).toBe(88);
  });

});

describe('array element comment association', () => {

  test('should keep # a comment on element 1 when truncating to [1]', () => {
    const src = dedent`
      arr = [
        1, # a
        2, # b
        3, # c
      ]
    ` + '\n';
    const result = patch(src, { arr: [1] });
    expect(result).toEqual(dedent`
      arr = [
        1, # a
      ]
    ` + '\n');
  });

  test('should keep # a and # b comments when truncating to [1, 2]', () => {
    const src = dedent`
      arr = [
        1, # a
        2, # b
        3, # c
      ]
    ` + '\n';
    const result = patch(src, { arr: [1, 2] });
    expect(result).toEqual(dedent`
      arr = [
        1, # a
        2, # b
      ]
    ` + '\n');
  });

  // Dropping the first element forces the survivor into the array's first slot via a Move.
  // Both the comment ownership (# b travels with 2, # c with 3) and the relocated row's
  // indentation are checked here — see the first-slot handling in
  // calculateInlinePositioning().
  test('should keep # b and # c comments when shifting to [2, 3]', () => {
    const src = dedent`
      arr = [
        1, # a
        2, # b
        3, # c
      ]
    ` + '\n';
    const result = patch(src, { arr: [2, 3] });
    expect(result).toEqual(dedent`
      arr = [
        2, # b
        3, # c
      ]
    ` + '\n');
  });

  test('should not shift comments down when appending element', () => {
    const src = dedent`
      arr = [
        1, # a
        2, # b
        3, # c
      ]
    ` + '\n';
    const result = patch(src, { arr: [1, 2, 3, 4] });
    expect(result).toEqual(dedent`
      arr = [
        1, # a
        2, # b
        3, # c
        4,
      ]
    ` + '\n');
  });

  // Prepending inserts a brand-new element at index 0, reaching the same first-slot
  // positioning path as the relocation case above without anything being relocated.
  test('should keep comments on original elements when prepending', () => {
    const src = dedent`
      arr = [
        1, # a
        2, # b
        3, # c
      ]
    ` + '\n';
    const result = patch(src, { arr: [0, 1, 2, 3] });
    expect(result).toEqual(dedent`
      arr = [
        0,
        1, # a
        2, # b
        3, # c
      ]
    ` + '\n');
  });

});

describe('array of inline tables', () => {

  test('should keep the array inline when the first element is removed', () => {
    const src = dedent`
      xs = [
        { a = 1 },
        { b = 2 },
      ]
    ` + '\n';

    expect(patch(src, { xs: [{ b: 2 }] })).toEqual(dedent`
      xs = [
        { b = 2 },
      ]
    ` + '\n');
  });

  // parseJS renders an array of objects as [[xs]] sections at the default inlineTableStart,
  // so an Add resolved against the updated document arrived as a section while `xs = [...]`
  // stayed put — defining the key twice, and re-parsing as the original array nested inside
  // the new element ({"xs":[{"z":0,"xs":[...]}]}). The document's own shape has to win.
  //
  // It was filed as a prepend bug, but position had nothing to do with it: appending and
  // mid-inserting failed identically, as did the single-line array form. Only a root-level
  // key was affected — nested under a [table], parseJS already kept the array inline.
  test('should append an element without duplicating the key', () => {
    const src = dedent`
      xs = [
        { a = 1 },
      ]
    ` + '\n';

    const result = patch(src, { xs: [{ a: 1 }, { z: 0 }] });
    expect(result).toEqual(dedent`
      xs = [
        { a = 1 },
        { z = 0 },
      ]
    ` + '\n');
    expect(parse(result)).toEqual({ xs: [{ a: 1 }, { z: 0 }] });
  });

  test('should prepend an element without duplicating the key', () => {
    const src = dedent`
      xs = [
        { a = 1 },
        { b = 2 },
      ]
    ` + '\n';

    const result = patch(src, { xs: [{ z: 0 }, { a: 1 }, { b: 2 }] });
    expect(result).toEqual(dedent`
      xs = [
        { z = 0 },
        { a = 1 },
        { b = 2 },
      ]
    ` + '\n');
    expect(parse(result)).toEqual({ xs: [{ z: 0 }, { a: 1 }, { b: 2 }] });
  });

  test('should insert an element in the middle without duplicating the key', () => {
    const src = dedent`
      xs = [
        { a = 1 },
        { b = 2 },
      ]
    ` + '\n';

    const result = patch(src, { xs: [{ a: 1 }, { z: 0 }, { b: 2 }] });
    expect(result).toEqual(dedent`
      xs = [
        { a = 1 },
        { z = 0 },
        { b = 2 },
      ]
    ` + '\n');
    expect(parse(result)).toEqual({ xs: [{ a: 1 }, { z: 0 }, { b: 2 }] });
  });

  test('should add to a single-line array of inline tables', () => {
    const src = dedent`
      xs = [{ a = 1 }]
    ` + '\n';

    const result = patch(src, { xs: [{ a: 1 }, { z: 0 }] });
    expect(result).toEqual(dedent`
      xs = [{ a = 1 }, { z = 0 }]
    ` + '\n');
    expect(parse(result)).toEqual({ xs: [{ a: 1 }, { z: 0 }] });
  });

  test('should add to an empty inline array', () => {
    // No sibling to copy a style from, so the format's own defaults apply.
    const src = dedent`
      xs = []
    ` + '\n';

    const result = patch(src, { xs: [{ z: 0 }] });
    expect(result).toEqual(dedent`
      xs = [{z = 0}]
    ` + '\n');
    expect(parse(result)).toEqual({ xs: [{ z: 0 }] });
  });

  test('should match its siblings\' bracket spacing on a single-line array', () => {
    const src = dedent`
      xs = [{ a = 1 }]
    ` + '\n';

    expect(patch(src, { xs: [{ a: 1 }, { z: 0 }] })).toEqual(dedent`
      xs = [{ a = 1 }, { z = 0 }]
    ` + '\n');
  });

  test('should add several elements at once', () => {
    const src = dedent`
      xs = [
        { a = 1 },
      ]
    ` + '\n';

    const result = patch(src, { xs: [{ a: 1 }, { z: 0 }, { y: 9 }] });
    expect(result).toEqual(dedent`
      xs = [
        { a = 1 },
        { z = 0 },
        { y = 9 },
      ]
    ` + '\n');
    expect(parse(result)).toEqual({ xs: [{ a: 1 }, { z: 0 }, { y: 9 }] });
  });

  // `format.trailingComma` is one flag read off whichever separator the detector saw first.
  // `[ { a = 1 }, ]` sets it from the comma *after* the table, and that same flag then chose
  // the comma *inside* the added one — `{ z = 0, }` beside `{ a = 1 }`. The two are
  // independent, so the inner one is taken from a sibling table.
  test('should not add an inner trailing comma its siblings do not have', () => {
    const src = dedent`
      xs = [
        { a = 1 },
      ]
    ` + '\n';

    expect(patch(src, { xs: [{ a: 1 }, { z: 0 }] })).toEqual(dedent`
      xs = [
        { a = 1 },
        { z = 0 },
      ]
    ` + '\n');
  });

  test('should keep an inner trailing comma its siblings do have', () => {
    const src = dedent`
      xs = [
        { a = 1, },
      ]
    ` + '\n';

    expect(patch(src, { xs: [{ a: 1 }, { z: 0 }] })).toEqual(dedent`
      xs = [
        { a = 1, },
        { z = 0, },
      ]
    ` + '\n');
  });

  test('should match sibling comma style for a multi-key element', () => {
    const src = dedent`
      xs = [
        { a = 1 },
      ]
    ` + '\n';

    expect(patch(src, { xs: [{ a: 1 }, { z: 0, w: 2 }] })).toEqual(dedent`
      xs = [
        { a = 1 },
        { z = 0, w = 2 },
      ]
    ` + '\n');
  });

  // The document's shape wins in both directions: a real [[xs]] source must keep producing
  // sections, not get rewritten into an inline array.
  test('should still append a section to a genuine array-of-tables', () => {
    const src = dedent`
      [[xs]]
      a = 1
    ` + '\n';

    const result = patch(src, { xs: [{ a: 1 }, { z: 0 }] });
    expect(result).toEqual(dedent`
      [[xs]]
      a = 1

      [[xs]]
      z = 0
    ` + '\n');
    expect(parse(result)).toEqual({ xs: [{ a: 1 }, { z: 0 }] });
  });

  test('should still append a section to a nested array-of-tables', () => {
    const src = dedent`
      [[a.b]]
      n = 1
    ` + '\n';

    const result = patch(src, { a: { b: [{ n: 1 }, { z: 0 }] } });
    expect(result).toEqual(dedent`
      [[a.b]]
      n = 1

      [[a.b]]
      z = 0
    ` + '\n');
    expect(parse(result)).toEqual({ a: { b: [{ n: 1 }, { z: 0 }] } });
  });

});

describe('emptying array-of-tables', () => {

  test('should degrade to inline empty array when emptying a single AOT entry', () => {
    const src = dedent`
      [[b]]
      n = 1
    ` + '\n';
    const result = patch(src, { b: [] });
    const reparsed = parse(result);
    expect(reparsed.b).toEqual([]);
  });

  test('should degrade to inline empty array when emptying multiple AOT entries', () => {
    const src = dedent`
      [[i]]
      n = 1

      [[i]]
      n = 2
    ` + '\n';
    const result = patch(src, { i: [] });
    const reparsed = parse(result);
    expect(reparsed.i).toEqual([]);
  });

  // A root key-value that physically follows a [table] header parses as a member of that
  // section, not of the root table. replaceEmptiedTableArrays appended the empty-array KV at
  // the very end of the document, so whenever any section existed the emptied key was silently
  // reparented into it -- real data corruption, not just cosmetic placement. Reproduces with
  // updateOrder off. See docs/bug-notes/comment-eligibility-on-structural-replace.md.
  test('should keep an emptied AOT key at root level when a table section precedes it', () => {
    const src = dedent`
      [other]
      b = 2

      [[tasks]]
      name = "a"
    ` + '\n';
    const result = patch(src, { other: { b: 2 }, tasks: [] });
    expect(parse(result)).toEqual({ other: { b: 2 }, tasks: [] });
  });

  test('should keep an emptied AOT key at root level when it originally preceded a table section', () => {
    const src = dedent`
      [[tasks]]
      name = "a"

      [other]
      b = 2
    ` + '\n';
    const result = patch(src, { tasks: [], other: { b: 2 } });
    expect(parse(result)).toEqual({ tasks: [], other: { b: 2 } });
  });

  test('should keep multiple emptied AOT keys at root level, in order', () => {
    const src = dedent`
      [other]
      b = 2

      [[x]]
      n = 1

      [[y]]
      m = 2
    ` + '\n';
    const result = patch(src, { other: { b: 2 }, x: [], y: [] });
    expect(parse(result)).toEqual({ other: { b: 2 }, x: [], y: [] });
    expect(result.indexOf('x = []')).toBeLessThan(result.indexOf('y = []'));
  });

});

describe('structural type replacements', () => {

  // ── helper ──────────────────────────────────────────────────────────

  /**
   * Asserts that patching `src` with `updated` does not throw, produces the
   * exact `expectedToml` string, and that reparsing it deep-equals `updated`
   * (a sanity check that `expectedToml` itself round-trips correctly).
   */
  function expectPatchResult(src: string, updated: Record<string, any>, expectedToml: string) {
    let result: string;
    expect(() => { result = patch(src, updated); }).not.toThrow();
    expect(result!).toBe(expectedToml);
    const reparsed = parse(result!);
    expect(reparsed).toEqual(updated);
  }

  // ── Table → scalar ──────────────────────────────────────────────────
  // These trigger handleStructuralEdit because the Table key (e.g.
  // ['a','b']) is longer than the change path (['a']).

  test('[a.b] → a = 42', () => {
    const src = dedent`
      [a.b]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: 42 }, dedent`
      a = 42
    ` + '\n');
  });

  test('[a.b.c] → a = 42 (deep nested table)', () => {
    const src = dedent`
      [a.b.c]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: 42 }, dedent`
      a = 42
    ` + '\n');
  });

  test('[a.b] + [a.c] → a = 42 (multiple sibling tables)', () => {
    const src = dedent`
      [a.b]
      x = 1

      [a.c]
      y = 2
    ` + '\n';
    expectPatchResult(src, { a: 42 }, dedent`
      a = 42
    ` + '\n');
  });

  test('[a.b] → a = 42 with preceding section (hoist check)', () => {
    const src = dedent`
      [s]
      k = "v"

      [a.b]
      x = 1
    ` + '\n';
    expectPatchResult(src, { s: { k: 'v' }, a: 42 }, dedent`
      a = 42

      [s]
      k = "v"
    ` + '\n');
  });

  // ── Table → array ───────────────────────────────────────────────────

  test('[a.b] → a = [1, 2, 3]', () => {
    const src = dedent`
      [a.b]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: [1, 2, 3] }, dedent`
      a = [ 1, 2, 3 ]
    ` + '\n');
  });

  test('[a.b.c] → a = [true, false] (deep nested → array)', () => {
    const src = dedent`
      [a.b.c]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: [true, false] }, dedent`
      a = [ true, false ]
    ` + '\n');
  });

  // ── Table → object ──────────────────────────────────────────────────

  test('[a.b] → a = { x: 1 } (table to inline object)', () => {
    const src = dedent`
      [a.b]
      old = "gone"
    ` + '\n';
    expectPatchResult(src, { a: { x: 1 } }, dedent`
      [a]
      x = 1
    ` + '\n');
  });

  test('[a.b.c] → a = { d: "hi" } (deep nested to inline object)', () => {
    const src = dedent`
      [a.b.c]
      old = "gone"
    ` + '\n';
    expectPatchResult(src, { a: { d: 'hi' } }, dedent`
      [a]
      d = "hi"
    ` + '\n');
  });

  // ── AOT → scalar ────────────────────────────────────────────────────
  // These also trigger handleStructuralEdit because TableArray keys
  // include the array index (e.g. ['i',0]) and are longer than the path.

  test('[[i]] (single entry) → i = 42', () => {
    const src = dedent`
      [[i]]
      n = 1
    ` + '\n';
    expectPatchResult(src, { i: 42 }, dedent`
      i = 42
    ` + '\n');
  });

  test('[[i]] × 2 (multiple entries) → i = 42', () => {
    const src = dedent`
      [[i]]
      n = 1

      [[i]]
      n = 2
    ` + '\n';
    expectPatchResult(src, { i: 42 }, dedent`
      i = 42
    ` + '\n');
  });

  test('[[a.b]] (nested single entry) → a = 42', () => {
    const src = dedent`
      [[a.b]]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: 42 }, dedent`
      a = 42
    ` + '\n');
  });

  test('[[a.b]] × 2 → a = 42', () => {
    const src = dedent`
      [[a.b]]
      x = 1

      [[a.b]]
      y = 2
    ` + '\n';
    expectPatchResult(src, { a: 42 }, dedent`
      a = 42
    ` + '\n');
  });

  test('[[a.b.c]] → a = 42 (deep nested AOT)', () => {
    const src = dedent`
      [[a.b.c]]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: 42 }, dedent`
      a = 42
    ` + '\n');
  });

  // ── AOT → array ─────────────────────────────────────────────────────

  test('[[i]] → i = [9] (AOT to different-length array)', () => {
    const src = dedent`
      [[i]]
      n = 1

      [[i]]
      n = 2
    ` + '\n';
    expectPatchResult(src, { i: [9] }, dedent`
      i = [ 9 ]
    ` + '\n');
  });

  test('[[i]] → i = [1, 2, 3] (AOT to array)', () => {
    const src = dedent`
      [[i]]
      n = 1
    ` + '\n';
    expectPatchResult(src, { i: [1, 2, 3] }, dedent`
      i = [ 1, 2, 3 ]
    ` + '\n');
  });

  test('[[a.b]] → a = [1, 2] (nested AOT to array)', () => {
    const src = dedent`
      [[a.b]]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: [1, 2] }, dedent`
      a = [ 1, 2 ]
    ` + '\n');
  });

  // ── AOT → object ────────────────────────────────────────────────────

  test('[[i]] → i = { x: 1 } (AOT to inline object)', () => {
    const src = dedent`
      [[i]]
      n = 1
    ` + '\n';
    expectPatchResult(src, { i: { x: 1 } }, dedent`
      [i]
      x = 1
    ` + '\n');
  });

  test('[[a.b]] → a = { c: 3 } (nested AOT to inline object)', () => {
    const src = dedent`
      [[a.b]]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: { c: 3 } }, dedent`
      [a]
      c = 3
    ` + '\n');
  });

  // ── Mixed / complex ─────────────────────────────────────────────────

  test('[a.b] + [[a.c]] → a = 42 (mixed Table + AOT siblings)', () => {
    const src = dedent`
      [a.b]
      x = 1

      [[a.c]]
      y = 2
    ` + '\n';
    expectPatchResult(src, { a: 42 }, dedent`
      a = 42
    ` + '\n');
  });

  test('[a.b] + [a.c.d] → a = 42 (mixed-depth sibling tables)', () => {
    const src = dedent`
      [a.b]
      x = 1

      [a.c.d]
      y = 2
    ` + '\n';
    expectPatchResult(src, { a: 42 }, dedent`
      a = 42
    ` + '\n');
  });

  test('multiple AOT sequences + table siblings → scalar', () => {
    const src = dedent`
      [[a.b]]
      x = 1

      [[a.b]]
      x = 2

      [a.c]
      y = 3

      [[a.d]]
      z = 4
    ` + '\n';
    expectPatchResult(src, { a: 99 }, dedent`
      a = 99
    ` + '\n');
  });

  // ── Intermediate-path replacements (deeper than root) ───────────────
  // When the change path has 2+ segments but is still shorter than the
  // existing Table/TableArray key.

  test('[a.b.c] → a.b = 42 (intermediate path)', () => {
    const src = dedent`
      [a.b.c]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: { b: 42 } }, dedent`
      [a]
      b = 42
    ` + '\n');
  });

  test('[[a.b.c]] → a.b = 42 (nested AOT, intermediate path)', () => {
    const src = dedent`
      [[a.b.c]]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: { b: 42 } }, dedent`
      [a]
      b = 42
    ` + '\n');
  });

  // ── Edge: change path matches existing KV key length ─────────────────
  // These do NOT go through handleStructuralEdit (existing is found), but
  // verify they still work correctly.

  test('[a] → a = 42 (single-segment table, isTable handler)', () => {
    const src = dedent`
      [a]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: 42 }, dedent`
      a = 42
    ` + '\n');
  });

  test('[a.b] → a.b = 99 (path matches table key, isTable handler)', () => {
    const src = dedent`
      [a.b]
      x = 1
    ` + '\n';
    expectPatchResult(src, { a: { b: 99 } }, dedent`
      [a]
      b = 99
    ` + '\n');
  });

  test('[[i]] → i = 99 (single-segment AOT, handleStructuralEdit)', () => {
    const src = dedent`
      [[i]]
      n = 1
    ` + '\n';
    expectPatchResult(src, { i: 99 }, dedent`
      i = 99
    ` + '\n');
  });

  // ── Safeguard: unrelated content preserved ──────────────────────────

  test('unrelated tables survive the structural replacement', () => {
    const src = dedent`
      [keep]
      v = 1

      [a.b]
      x = 2

      [other]
      w = 3
    ` + '\n';
    expectPatchResult(src, { keep: { v: 1 }, a: 42, other: { w: 3 } }, dedent`
      a = 42

      [keep]
      v = 1

      [other]
      w = 3
    ` + '\n');
  });

  test('unrelated AOT entries survive', () => {
    const src = dedent`
      [[keep]]
      n = 1

      [[a.b]]
      x = 1

      [[other]]
      m = 2
    ` + '\n';
    expectPatchResult(src, { keep: [{ n: 1 }], a: 42, other: [{ m: 2 }] }, dedent`
      a = 42

      [[keep]]
      n = 1

      [[other]]
      m = 2
    ` + '\n');
  });

  // ── Replaced node is the document's FIRST item, section survives ─────
  // The hoist tests above all keep an item ahead of the replaced one ([s], [keep]), so the
  // document's leading slot is never vacated. When the replaced node IS the first item and a
  // section survives after it, that slot is emptied and then prepended back into — which
  // caught a crash in to-toml.ts (insert() positioning the replacement against neighbour loc
  // values that still carried the removal's pending offsets). handleStructuralEdit now flushes
  // those writes first, but only in this case: doing it unconditionally changes the
  // blank-line bookkeeping for the fully-emptied document the other tests cover.

  test('[a.b] → a = 42 as first item, section survives after', () => {
    const src = dedent`
      [a.b]
      x = 1

      [s]
      k = "v"
    ` + '\n';
    expectPatchResult(src, { a: 42, s: { k: 'v' } }, dedent`
      a = 42

      [s]
      k = "v"
    ` + '\n');
  });

  test('[[i]] × 2 → i = 42 as first item, section survives after', () => {
    const src = dedent`
      [[i]]
      n = 1

      [[i]]
      n = 2

      [s]
      k = "v"
    ` + '\n';
    expectPatchResult(src, { i: 42, s: { k: 'v' } }, dedent`
      i = 42

      [s]
      k = "v"
    ` + '\n');
  });

  test('[[i]] → i = [1, 2] as first item, section survives after', () => {
    const src = dedent`
      [[i]]
      n = 1

      [s]
      k = "v"
    ` + '\n';
    expectPatchResult(src, { i: [1, 2], s: { k: 'v' } }, dedent`
      i = [ 1, 2 ]

      [s]
      k = "v"
    ` + '\n');
  });

  test('[[i]] → i = { x: 1 } as first item, section survives after', () => {
    const src = dedent`
      [[i]]
      n = 1

      [s]
      k = "v"
    ` + '\n';
    expectPatchResult(src, { i: { x: 1 }, s: { k: 'v' } }, dedent`
      [i]
      x = 1

      [s]
      k = "v"
    ` + '\n');
  });

  // ── Existing (kept) ─────────────────────────────────────────────────

  test('should empty array within a table', () => {
    const src = dedent`
      [t]
      y = [1, 2]
    ` + '\n';
    expect(() => patch(src, { t: { y: [] } })).not.toThrow();
  });

  // Same root cause as the emptied-AOT placement bug above: handleStructuralEdit appended the
  // regenerated KV at the end of the document, so an existing section header swallowed it.
  // The pre-existing no-throw test above only covers a document with no other sections, so it
  // never caught this. See docs/bug-notes/comment-eligibility-on-structural-replace.md.
  test('should keep an AOT->scalar replacement at root level when a table section follows it', () => {
    const src = dedent`
      [[i]]
      n = 1

      [other]
      b = 2
    ` + '\n';
    const result = patch(src, { i: 42, other: { b: 2 } });
    expect(parse(result)).toEqual({ i: 42, other: { b: 2 } });
  });

  // Hoisting the KV back above the section header also reunites it with the leading comment
  // that stayed behind at the top of the document when the old AOT node was removed.
  test('should carry the leading comment with an AOT->scalar replacement hoisted above a section', () => {
    const src = dedent`
      # comment about i
      [[i]]
      n = 1

      [other]
      b = 2
    ` + '\n';
    const result = patch(src, { i: 42, other: { b: 2 } });
    expect(parse(result)).toEqual({ i: 42, other: { b: 2 } });
    expect(result).toMatch(/# comment about i\r?\ni = 42/);
  });

});

// Both of these were once internal TypeErrors ("reading 'substring' of undefined",
// "reading 'length' of undefined") and were parked asserting that a *clearer* error be
// thrown instead. Neither throws any more, so they now assert the output they should have
// produced all along.
describe('removals that used to throw', () => {

  test('should empty a document whose only key is a commented array', () => {
    const src = dedent`
      arr = [
        1, # one
      ]
    ` + '\n';

    const result = patch(src, {});
    expect(result).toEqual('\n');
    expect(parse(result)).toEqual({});
  });

  test('should delete an array-of-tables while adding an unrelated key', () => {
    const src = dedent`
      [[i]]
      n = 1

      [[i]]
      n = 2
    ` + '\n';

    const result = patch(src, { other: 1 });
    expect(result).toEqual(dedent`
      other = 1
    ` + '\n');
    expect(parse(result)).toEqual({ other: 1 });
  });

});

describe('deleting an array-of-tables key', () => {

  // Removing every entry is how both "emptied to []" and "deleted outright" reach the
  // patcher, so the key was re-materialised as `key = []` either way — putting back a key
  // the caller had deleted. Plain arrays and plain tables were always removed correctly;
  // only array-of-tables resurrected.
  test('should remove the key entirely when it is deleted', () => {
    const src = dedent`
      [[i]]
      n = 1
    ` + '\n';

    expect(parse(patch(src, {}))).toEqual({});
  });

  test('should remove the key entirely when deleted alongside a surviving sibling', () => {
    const src = dedent`
      [[i]]
      n = 1

      k = 5
    ` + '\n';

    const result = patch(src, { k: 5 });
    expect(result).toEqual(dedent`
      k = 5
    ` + '\n');
    expect(parse(result)).toEqual({ k: 5 });
  });

  test('should still degrade to an inline empty array when explicitly emptied', () => {
    const src = dedent`
      [[i]]
      n = 1
    ` + '\n';

    const result = patch(src, { i: [] });
    expect(result).toEqual(dedent`
      i = []
    ` + '\n');
    expect(parse(result)).toEqual({ i: [] });
  });

  // Nested AOTs go through the same emptiedAotKeys path, but the key has to survive as
  // segments. Joining it to `"a.b"` and handing that to parseJS reads the dot as part of a
  // single JS key, emitting the quoted `"a.b" = []` — a root key literally named `a.b`
  // rather than `b` nested under `a`.
  test('should remove a nested key entirely when it is deleted', () => {
    const src = dedent`
      [[a.b]]
      n = 1
    ` + '\n';

    expect(parse(patch(src, {}))).toEqual({});
  });

  test('should remove a nested key while a sibling under the same parent survives', () => {
    const src = dedent`
      [[a.b]]
      n = 1

      [a.c]
      m = 2
    ` + '\n';

    const result = patch(src, { a: { c: { m: 2 } } });
    expect(result).toEqual(dedent`
      [a.c]
      m = 2
    ` + '\n');
    expect(parse(result)).toEqual({ a: { c: { m: 2 } } });
  });

  test('should degrade a nested key to a dotted empty array when explicitly emptied', () => {
    const src = dedent`
      [[a.b]]
      n = 1
    ` + '\n';

    const result = patch(src, { a: { b: [] } });
    expect(result).toEqual(dedent`
      a.b = []
    ` + '\n');
    expect(parse(result)).toEqual({ a: { b: [] } });
  });

  test('should keep a surviving sibling when a nested key is emptied', () => {
    const src = dedent`
      [[a.b]]
      n = 1

      [a.c]
      m = 2
    ` + '\n';

    expect(parse(patch(src, { a: { b: [], c: { m: 2 } } }))).toEqual({ a: { b: [], c: { m: 2 } } });
  });

  test('should handle a key nested more than two levels deep', () => {
    const src = dedent`
      [[a.b.c]]
      n = 1
    ` + '\n';

    expect(parse(patch(src, {}))).toEqual({});
    expect(parse(patch(src, { a: { b: { c: [] } } }))).toEqual({ a: { b: { c: [] } } });
  });

});

// Removing a key whose value happens to equal an untouched sibling's was misread as a
// rename onto that sibling, so the removed key's node was renamed in place and the real
// target left alone — emitting the key twice, which does not parse.
// https://github.com/DecimalTurn/toml-patch/issues/262
describe('removing a key whose value matches a sibling (#262)', () => {

  test('should remove the key rather than duplicating its twin at root level', () => {
    const src = dedent`
      a = 1
      b = 1
    ` + '\n';

    const result = patch(src, { b: 1 });
    expect(result).toEqual(dedent`
      b = 1
    ` + '\n');
    expect(parse(result)).toEqual({ b: 1 });
  });

  test('should remove the key rather than duplicating its twin inside a table', () => {
    const src = dedent`
      [features]
      a = true
      b = true
    ` + '\n';

    const result = patch(src, { features: { b: true } });
    expect(result).toEqual(dedent`
      [features]
      b = true
    ` + '\n');
    expect(parse(result)).toEqual({ features: { b: true } });
  });

  test('should take the removed key\'s comment with it, not graft it onto the survivor', () => {
    const src = dedent`
      [f]
      # doc a
      a = true
      # doc b
      b = true
    ` + '\n';

    const result = patch(src, { f: { b: true } });
    expect(result).toEqual(dedent`
      [f]
      # doc b
      b = true
    ` + '\n');
    expect(parse(result)).toEqual({ f: { b: true } });
  });

  test('should still add a new key alongside such a removal', () => {
    // The misread rename consumed the whole change list, so `x` was silently dropped.
    const src = dedent`
      a = 1
      b = 1
    ` + '\n';

    expect(parse(patch(src, { b: 1, x: 1 }))).toEqual({ b: 1, x: 1 });
  });

  test('should handle string and array values, not just numbers', () => {
    expect(parse(patch('a = "x"\nb = "x"\n', { b: 'x' }))).toEqual({ b: 'x' });
    expect(parse(patch('a = [1]\nb = [1]\n', { b: [1] }))).toEqual({ b: [1] });
  });

  test('should handle sibling tables with equal contents', () => {
    // This shape threw `Item not found in parent for replace` rather than duplicating.
    const src = dedent`
      [t.a]
      n = 1

      [t.b]
      n = 1
    ` + '\n';

    expect(parse(patch(src, { t: { b: { n: 1 } } }))).toEqual({ t: { b: { n: 1 } } });
  });

  const renameKey = (obj: Record<string, unknown>, fromPath: string, toPath: string) => {
    const resolve = (path: string) => {
      const parts = path.split('.');
      let parent = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        parent = parent[parts[i]] as Record<string, unknown>;
      }
      return { parent, key: parts[parts.length - 1] };
    };

    const { parent: fromParent, key: fromKey } = resolve(fromPath);
    const { parent: toParent, key: toKey } = resolve(toPath);

    toParent[toKey] = fromParent[fromKey];
    delete fromParent[fromKey];
  };

  test('should leave a genuine rename alone', () => {
    const src = dedent`
      a = 1
      keep = 2
    ` + '\n';

    const obj = parse(src);
    renameKey(obj, 'a', 'z');

    const result = patch(src, obj);
    expect(result).toEqual(dedent`
      z = 1
      keep = 2
    ` + '\n');
  });

  // Rename matching resolved the target with `indexOf`, which always returns the first
  // match, so every equal-valued source claimed the same one. `{a:1,b:1} -> {z:1}` emitted
  // `Rename a->z` AND `Rename b->z`, and the second blanked its node's key, giving a key
  // with an empty name — `"  = 1\nz = 1\n"`, which does not parse. Claiming a target now
  // retires it, so the later source falls through to a Remove.
  test('should not emit an empty key when several equal-valued keys collapse onto one', () => {
    const src = dedent`
      a = 1
      b = 1
    ` + '\n';

    const result = patch(src, { z: 1 });
    expect(result).toEqual(dedent`
      z = 1
    ` + '\n');
    expect(parse(result)).toEqual({ z: 1 });
  });

  // This test demonstrates the current best-effort behaviour when several equal-valued
  // keys are renamed in a single patch call.  Only the first pair is matched as a rename
  // and keeps its comment; the second is treated as a remove.  To avoid losing comments or preserving the 
  // wrong comment, limit yourself to one rename per call to `patch()`.
  test('should keep the first paired comment when equal-valued keys collapse onto one', () => {
    const src = dedent`
      a = 1  # doc for a
      b = 1  # doc for b
    ` + '\n';

    const result = patch(src, { z: 1 });
    expect(result).toEqual(dedent`
      z = 1  # doc for a
    ` + '\n');
    expect(parse(result)).toEqual({ z: 1 });
  });

  test('should keep the first paired above-key comment when equal-valued keys collapse onto one', () => {
    const src = dedent`
      # doc for a
      a = 1
      # doc for b
      b = 1
    ` + '\n';

    const result = patch(src, { z: 1 });
    expect(result).toEqual(dedent`
      # doc for a
      z = 1
    ` + '\n');
    expect(parse(result)).toEqual({ z: 1 });
  });

  test('should handle three equal-valued keys collapsing onto one', () => {
    const src = dedent`
      a = 1
      b = 1
      c = 1
    ` + '\n';

    const result = patch(src, { z: 1 });
    expect(result).toEqual(dedent`
      z = 1
    ` + '\n');
    expect(parse(result)).toEqual({ z: 1 });
  });

  test('should collapse onto two targets without emitting an empty key', () => {
    const src = dedent`
      a = 1
      b = 1
    ` + '\n';

    const result = patch(src, { z: 1, y: 1 });
    expect(result).toEqual(dedent`
      z = 1
      y = 1
    ` + '\n');
    expect(parse(result)).toEqual({ z: 1, y: 1 });
  });

  test('should collapse equal-valued keys inside a table', () => {
    const src = dedent`
      [t]
      a = 1
      b = 1
    ` + '\n';

    const result = patch(src, { t: { z: 1 } });
    expect(result).toEqual(dedent`
      [t]
      z = 1
    ` + '\n');
    expect(parse(result)).toEqual({ t: { z: 1 } });
  });

  test('should collapse equal-valued string keys', () => {
    const src = dedent`
      a = "x"
      b = "x"
    ` + '\n';

    const result = patch(src, { z: 'x' });
    expect(result).toEqual(dedent`
      z = "x"
    ` + '\n');
    expect(parse(result)).toEqual({ z: 'x' });
  });

  // Pairing is greedy, so `a` and `b` are renamed onto `y` and `z` and only the leftover `c`
  // is removed. See comment-ownership.test.ts's `renaming` block for what that means for the
  // comments each key owns.
  test('should collapse three keys onto two targets', () => {
    const src = dedent`
      a = 1
      b = 1
      c = 1
    ` + '\n';

    const result = patch(src, { y: 1, z: 1 });
    expect(result).toEqual(dedent`
      y = 1
      z = 1
    ` + '\n');
    expect(parse(result)).toEqual({ y: 1, z: 1 });
  });

  // A KeyValue holds its Key directly; a [table] wraps it in a TableKey. The rename branch
  // read `.key.value` unconditionally, so for a section it got undefined and threw inside
  // preserveEscapedKeyRaw. Nothing to do with equal values — this is a single unambiguous
  // Rename, and it failed on `latest` too.
  test('should rename a key whose value is a table', () => {
    const src = dedent`
      [a]
      n = 1
    ` + '\n';

    const result = patch(src, { z: { n: 1 } });
    expect(result).toEqual(dedent`
      [z]
      n = 1
    ` + '\n');
    expect(parse(result)).toEqual({ z: { n: 1 } });
  });

  test('should rename a table without disturbing its siblings', () => {
    const src = dedent`
      [a]
      n = 1

      [keep]
      m = 2
    ` + '\n';

    const result = patch(src, { z: { n: 1 }, keep: { m: 2 } });
    expect(result).toEqual(dedent`
      [z]
      n = 1

      [keep]
      m = 2
    ` + '\n');
    expect(parse(result)).toEqual({ z: { n: 1 }, keep: { m: 2 } });
  });

  // Renaming the leaf of a dotted section key now correctly updates just the leaf
  // segment in place without dropping the prefix (e.g. [a.b] -> [a.z]).
  test('should rename the leaf segment of a dotted section key', () => {
    const src = dedent`
      [a.b]
      n = 1
    ` + '\n';

    expect(patch(src, { a: { z: { n: 1 } } })).toEqual(dedent`
      [a.z]
      n = 1
    ` + '\n');
  });

  // Renaming the ROOT segment does work, because the diff resolves it at the document level
  // where both sides are single-segment. Note the value is re-rendered as an inline table
  // rather than staying a `[x.y]` section — the data round-trips, the representation does
  // not survive.
  test('should rename the root segment of a dotted section key', () => {
    const src = dedent`
      [a.b]
      n = 1
    ` + '\n';

    const result = patch(src, { x: { y: { n: 1 } } });
    expect(result).toEqual(dedent`
      [x]
      y = { n = 1 }
    ` + '\n');
    expect(parse(result)).toEqual({ x: { y: { n: 1 } } });
  });

  test('should rename the root segment of a dotted section key - with comment', () => {
    const src = dedent`
      [a.b]
      # comment about n
      n = 1
    ` + '\n';

    const obj = parse(src);
    renameKey(obj, 'a', 'x');

    let result = patch(src, obj);
    expect(result).toEqual(dedent`
      [x.b]
      # comment about n
      n = 1
    ` + '\n');
    expect(parse(result)).toEqual({ x: { b: { n: 1 } } });
  
    // renameKey(obj, 'b', 'y');

    // result = patch(src, obj);
    // expect(result).toEqual(dedent`
    //   [x.y]
    //   # comment about n
    //   n = 1 
    // ` + '\n');
    // expect(parse(result)).toEqual({ x: { y: { n: 1 } } });
  });

  test('should rename the leaf segment of a dotted section key - with comment', () => {
    const src = dedent`
      [a.b]
      # comment about n
      n = 1
    ` + '\n';

    const obj = parse(src);
  
    renameKey(obj, 'a.b', 'a.y');

    const result = patch(src, obj);
    expect(result).toEqual(dedent`
      [a.y]
      # comment about n
      n = 1 
    ` + '\n');
    expect(parse(result)).toEqual({ a: { y: { n: 1 } } });
  });

  test('should rename an intermediate segment of a deeply nested dotted section key', () => {
    const src = dedent`
      [a.b.c]
      # comment about n
      n = 1
    ` + '\n';

    const obj = parse(src);
    renameKey(obj, 'a.b', 'a.x');

    const result = patch(src, obj);
    expect(result).toEqual(dedent`
      [a.x.c]
      # comment about n
      n = 1
    ` + '\n');
    expect(parse(result)).toEqual({ a: { x: { c: { n: 1 } } } });
  });

  test('should rename the leaf segment of a deeply nested dotted section key', () => {
    const src = dedent`
      [a.b.c]
      # comment about n
      n = 1
    ` + '\n';

    const obj = parse(src);
    renameKey(obj, 'a.b.c', 'a.b.z');

    const result = patch(src, obj);
    expect(result).toEqual(dedent`
      [a.b.z]
      # comment about n
      n = 1
    ` + '\n');
    expect(parse(result)).toEqual({ a: { b: { z: { n: 1 } } } });
  });

});

describe('blank line accumulation on table deletion', () => {

  test('should not accumulate blank lines when deleting tables one at a time', () => {
    let s = dedent`
      [a]
      x = 1

      [b]
      y = 2

      [c]
      z = 3

      [d]
      w = 4
    ` + '\n';

    for (const k of ['a', 'b', 'c']) {
      const o = parse(s);
      delete o[k];
      s = patch(s, o);
    }

    expect(s).toEqual(dedent`
      [d]
      w = 4
    ` + '\n');
  });

  // The separator reclaimed above is measured from what physically precedes the removed
  // section. A comment hoisted out of a multi-line inline table is filed *after* the
  // key-value it came from but keeps a loc pointing inside the braces, so it is the
  // immediately preceding sibling while ending far above the real content. Measuring from
  // it counted the inline table's body as blank space and pulled the next section up over
  // the closing brace, emitting a document that no longer parses.
  test('should not over-reclaim past a comment hoisted out of an earlier inline table', () => {
    const src = dedent`
      x = {
        a = 1, # interior
        b = 2
      }

      [t]
      z = 9

      [u]
      w = 1
    ` + '\n';

    const value = parse(src);
    delete value.t;
    const result = patch(src, value);

    expect(result).toEqual(dedent`
      x = {
        a = 1, # interior
        b = 2
      }

      [u]
      w = 1
    ` + '\n');
    expect(parse(result)).toEqual({ x: { a: 1, b: 2 }, u: { w: 1 } });
  });

});

describe('comment removal with section', () => {

  test('should remove comment that precedes a deleted table section', () => {
    const src = dedent`
      [a]
      x = 1

      # section about b
      [b]
      z = 3
    ` + '\n';

    const o = parse(src);
    delete o.b;
    const result = patch(src, o);

    expect(result).toEqual(dedent`
      [a]
      x = 1
    ` + '\n');
  });

});

describe('lone surrogate handling in stringify and patch', () => {

  // JS strings are UTF-16, so an astral character is legitimately stored as a surrogate
  // *pair* — those must keep working. An *unpaired* surrogate is not a Unicode scalar value,
  // has no valid UTF-8 encoding, and so cannot be represented in TOML at all. Rejected at the
  // two generation choke points (generateString for values, generateKey for keys), which both
  // stringify and patch funnel through.
  const HIGH = '\ud800';
  const LOW = '\udfff';

  test('should reject lone surrogates instead of emitting invalid TOML', () => {
    expect(() => stringify({ s: HIGH })).toThrow(/lone surrogate \(U\+D800\)/);
  });

  test('should reject a lone low surrogate', () => {
    expect(() => stringify({ s: LOW })).toThrow(/lone surrogate \(U\+DFFF\)/);
  });

  test('should reject a lone surrogate nested in a table or array', () => {
    expect(() => stringify({ a: { b: [HIGH] } })).toThrow(/lone surrogate/);
  });

  test('should reject a lone surrogate in a key', () => {
    expect(() => stringify({ [HIGH]: 1 })).toThrow(/lone surrogate/);
  });

  test('should reject a lone surrogate when patching an existing value', () => {
    expect(() => patch('s = "ok"\n', { s: HIGH })).toThrow(/lone surrogate/);
  });

  test('should reject a lone surrogate when patching in a new key', () => {
    expect(() => patch('a = 1\n', { a: 1, s: HIGH })).toThrow(/lone surrogate/);
    expect(() => patch('a = 1\n', { a: 1, [HIGH]: 2 })).toThrow(/lone surrogate/);
  });

  test('should still accept a valid astral character (surrogate pair)', () => {
    expect(stringify({ s: '\u{1F600}' })).toBe('s = "\u{1F600}"\n');
    expect(patch('s = "ok"\n', { s: '\u{1F600}' })).toBe('s = "\u{1F600}"\n');
    expect(patch('s = "\u{1F600}"\n', parse('s = "\u{1F600}"\n'))).toBe('s = "\u{1F600}"\n');
  });

});

describe('identity round-trip normalizations', () => {

  test('should preserve +nan sign through parse and round-trip', () => {
    const result = patch('a = +nan\n', parse('a = +nan\n'));
    expect(result).toBe('a = +nan\n');
  });

  test('should preserve existing +nan style when updated to another NaN value', () => {
    // Original TOML has +nan, patched object has NaN (e.g. from computation).
    // The existing formatting style (+nan) should be preserved.
    const src = 'a = +nan\n';
    const parsed = parse(src);
    parsed.a = NaN; // different NaN value, but still NaN
    const result = patch(src, parsed);
    expect(result).toBe('a = +nan\n');
  });

  test('should preserve existing -nan style when updated to a non-negative NaN value', () => {
    // Original TOML has -nan, patched object has regular NaN (no sign).
    // The sign style should be preserved, flipping to +nan.
    const src = 'a = -nan\n';
    const parsed = parse(src);
    parsed.a = NaN; // canonical NaN, no sign bit
    const result = patch(src, parsed);
    expect(result).toBe('a = +nan\n');
  });

  test('should preserve -nan sign through parse and round-trip', () => {
    // `-nan` should parse to a negative NaN distinguishable via IEEE 754 bit pattern
    const parsed = parse('a = -nan\n');
    expect(Number.isNaN(parsed.a)).toBe(true);

    // Verify it's negative NaN by checking the IEEE 754 sign bit
    const buf = new Float64Array([parsed.a]);
    const view = new DataView(buf.buffer);
    const highBits = view.getUint32(4, true); // high 32 bits in little-endian
    expect(highBits & 0x80000000).not.toBe(0); // sign bit set

    // And round-trip should preserve the `-nan` spelling
    const result = patch('a = -nan\n', parsed);
    expect(result).toBe('a = -nan\n');
  });

});

  test('Avoid including a commented out kv when there are comments around it', () => {
    const input = dedent`
      # doc for t
      [t]
      # enable when ready
      # a = 1
      # The z-value must always be specified
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
      # enable when ready
      # a = 1
    ` + '\n');
  });


  test('Do include the comment if the key inside the comment matches the key', () => {
    const input = dedent`
      # doc for t
      [t]
      # Switch this value when ready
      # z = 1
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
    ` + '\n');
  });

  test('Do not include the comment if the key inside the comment does not match the key', () => {
    const input = dedent`
      # doc for t
      [t]
      # Include this  value when ready
      # something = 1
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
      # Include this  value when ready
      # something = 1
    ` + '\n');
  });

  test('Do not include the comment if the commented KV inside the comment does not match the key + inline comment', () => {
    const input = dedent`
      # doc for t
      [t]
      # Include this  value when ready
      # something = 1 # some extra comment
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
      # Include this  value when ready
      # something = 1 # some extra comment
    ` + '\n');
  });

  test('does not treat a # inside a quoted value as an inline comment marker', () => {
    // `# k = "a # b" extra` has a # inside quotes — not an inline comment.
    // The old broad heuristic /#.*=.*#/ would wrongly classify this as a
    // barrier and keep the comment; the precise regex correctly treats it
    // as prose and removes it with z.
    const input = dedent`
      # doc for t
      [t]
      # k = "a # b" extra
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
    ` + '\n');
  });

  test('Do include the comment if the commented KV inside the comment is part of a sentence and would not be valid toml if commented out', () => {
    const input = dedent`
      # doc for t
      [t]
      # Include this  value when ready
      # something = 1 is something to consider
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
    ` + '\n');
  });

  // ── Edge cases for commented-out KV detection ──────────────────────

  test('keeps commented-out KV with quoted string value when key differs', () => {
    const input = dedent`
      # doc for t
      [t]
      # x = "hello world"
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
      # x = "hello world"
    ` + '\n');
  });

  test('removes commented-out KV with quoted string value when key matches', () => {
    const input = dedent`
      # doc for t
      [t]
      # z = "hello world"
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
    ` + '\n');
  });

  test('keeps commented-out KV with boolean value when key differs', () => {
    const input = dedent`
      # doc for t
      [t]
      # x = true
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
      # x = true
    ` + '\n');
  });

  test('keeps commented-out dotted key when key differs', () => {
    const input = dedent`
      # doc for t
      [t]
      # a.b = 1
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
      # a.b = 1
    ` + '\n');
  });

  test('removes commented-out dotted key when first segment matches', () => {
    const input = dedent`
      # doc for t
      [t]
      # z.x = 1
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
    ` + '\n');
  });

  test('treats commented-out KV with matching key + inline comment as part of the run', () => {
    // key matches → no barrier, entire run (including prose) is owned by z and removed
    const input = dedent`
      # doc for t
      [t]
      # Some context here
      # z = 1 # was the old default
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
    ` + '\n');
  });

  test('keeps commented-out KV with inline comment when key differs', () => {
    // key differs → barrier, both comments survive
    const input = dedent`
      # doc for t
      [t]
      # Some context here
      # x = 1 # was the old default
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.z;

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
      # Some context here
      # x = 1 # was the old default
    ` + '\n');
  });

  test('removes commented-out KV when the deleted key is quoted and matches', () => {
    const input = dedent`
      # doc for t
      [t]
      # "z key" = old value
      "z key" = 9
    ` + '\n';

    const value = parse(input);
    delete value.t['z key'];

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
    ` + '\n');
  });

  test('keeps commented-out KV when the deleted key is quoted and does not match', () => {
    const input = dedent`
      # doc for t
      [t]
      # "x key" = old value
      "z key" = 9
    ` + '\n';

    const value = parse(input);
    delete value.t['z key'];

    expect(patch(input, value)).toEqual(dedent`
      # doc for t
      [t]
      # "x key" = old value
    ` + '\n');
  });

describe('float exponent notation round-trip', () => {
  // Values that exceed MAX_SAFE_INTEGER must stay as floats through
  // parse → stringify → parse, not be promoted to bigint.  The original
  // TOML exponent notation (e.g. 743e+15) is unambiguously a float.

  test('743e+15 stays number through round-trip', () => {
    const obj1 = parse('x = 743e+15\n');
    expect(typeof obj1.x).toBe('number');
    const toml2 = stringify(obj1);
    const obj2 = parse(toml2);
    expect(typeof obj2.x).toBe('number');
  });

  test('-666e+14 stays number through round-trip', () => {
    const obj1 = parse('x = -666e+14\n');
    expect(typeof obj1.x).toBe('number');
    const toml2 = stringify(obj1);
    const obj2 = parse(toml2);
    expect(typeof obj2.x).toBe('number');
  });

  test('integer-keyed float above MAX_SAFE_INTEGER stays number', () => {
    const obj = { x: 9007199254740993 }; // > MAX_SAFE_INTEGER, whole number
    const toml = stringify(obj);
    // Must contain a decimal point so it's unambiguously a float
    expect(toml).toContain('.');
    const parsed = parse(toml);
    expect(typeof parsed.x).toBe('number');
  });

  test('value within safe integer range still stringifies as integer', () => {
    const toml = stringify({ x: 42 });
    expect(toml).toBe('x = 42\n');
  });

  test('MAX_SAFE_INTEGER itself stays as integer', () => {
    const toml = stringify({ x: Number.MAX_SAFE_INTEGER });
    expect(toml).toBe(`x = ${Number.MAX_SAFE_INTEGER}\n`);
  });
});
  // ── Tests documenting issues found by fuzz harness ──────────────────
  //
  // See docs/bug-notes/ISSUE-patch-cannot-extend-inline-table.md
  // See docs/bug-notes/ISSUE-patch-incompatible-child-type.md
  // See docs/bug-notes/ISSUE-patch-node-not-found.md
  //
  // These tests currently FAIL because modifying a nested value under a
  // dotted-key table header (e.g. [a.b.c]) causes patch() to emit an
  // inline table alongside the original header, producing conflicting
  // structures that fail to re-parse.
  //
  // When the bugs are fixed, these tests will start passing.

  // FIXED: Modifying a value inside [a.b] no longer emits conflicting
  // inline table + header. See docs/bug-notes/ISSUE-patch-cannot-extend-inline-table.md
  test('modifying nested dotted-key value (was: inline table conflict)', () => {
    const src = dedent`
      ["<~9".dd]
      13i.x1wdfu5_.o67ar6 = 11449
      zbr5.p-6c.aex4j = [1, 2, 3]
    ` + '\n';

    const obj = parse(src);
    obj['<~9'].dd['13i'].x1wdfu5_ = -4277;

    const result = patch(src, obj);

    expect(result).toEqual(dedent`
      ["<~9".dd]
      13i.x1wdfu5_ = -4277
      zbr5.p-6c.aex4j = [1, 2, 3]
    ` + '\n');

    expect(() => parse(result)).not.toThrow();
    // Key truncated from 13i.x1wdfu5_.o67ar6 to 13i.x1wdfu5_
    // (x1wdfu5_ changed from table to scalar, dropping last segment)
    expect(result).toContain('13i.x1wdfu5_');
    expect(result).not.toContain('o67ar6');
  });

  // BUG: Same pattern — modifying a deeply nested value under [a.b.c]
  // emits conflicting inline table + table header.
  // See docs/bug-notes/ISSUE-patch-incompatible-child-type.md
  test('modifying deeply nested value under dotted-key table (was: inline table conflict)', () => {
    const src = dedent`
      [d4v9qdab6p.")t--7".poln3sbu]
      xjcn = -inf
      qknixakrm.j = false
      "".swr.l1- = "R"
      hc."%1mya" = "CT]AJj]$HH"
    ` + '\n';

    const obj = parse(src);
    obj['d4v9qdab6p'][')t--7']['poln3sbu']['']['swr'] = 'changed';

    const result = patch(src, obj);

    expect(result).toEqual(dedent`
      [d4v9qdab6p.")t--7".poln3sbu]
      xjcn = -inf
      qknixakrm.j = false
      "".swr = "changed"
      hc."%1mya" = "CT]AJj]$HH"
    ` + '\n');
    
    expect(() => parse(result)).not.toThrow();
    // Key truncated from "".swr.l1- to "".swr (l1- removed)
    expect(result).toContain('"".swr');
    expect(result).not.toContain('l1-');
  });

  test('truncating indented dotted key preserves column alignment', () => {
    const src = dedent`
      [t]
          a.b.c = 1
      x = 2
    ` + '\n';

    const obj = parse(src);
    obj.t.a.b = 42; // truncate from a.b.c to a.b, change value

    expect(patch(src, obj)).toEqual(dedent`
      [t]
          a.b = 42
      x = 2
    ` + '\n');
    expect(() => parse(patch(src, obj))).not.toThrow();
  });

  // See docs/bug-notes/ISSUE-patch-node-not-found.md
  test('adding key to nested AOT element (was: Incompatible child type crash)', () => {
    const src = dedent`
      [[a.b]]
      x = 1

      [[a.b]]
      x = 2
    ` + '\n';

    const obj = parse(src);
    obj.a.b[0].y = 3;

    // Currently throws: Incompatible child type "InlineItem"
    expect(() => patch(src, obj)).not.toThrow();
    const result = patch(src, obj);
    // Desired output
    expect(result).toEqual(dedent`
      [[a.b]]
      x = 1
      y = 3

      [[a.b]]
      x = 2
    ` + '\n');
    expect(() => parse(result)).not.toThrow();
  });

  // This one works — modifying a value inside a table array element.
  test('adding key to table defined with [parent] syntax', () => {
    const src = dedent`
      [ef8fai0n]
      p8ou7aufb.at4 = "original value"
    ` + '\n';

    const obj = parse(src);
    obj.ef8fai0n.q3ytjt3s = 'new value';

    const result = patch(src, obj);
    expect(result).toContain('q3ytjt3s = "new value"');
    expect(() => parse(result)).not.toThrow();
  });

  // This one works — modifying a value inside a table array element.
  test('modifying value inside table array element', () => {
    const src = dedent`
      [[products]]
      name = "Hammer"
      sku = 123

      [[products]]
      name = "Nail"
      sku = 456
    ` + '\n';

    const obj = parse(src);
    obj.products[0].sku = 999;

    const result = patch(src, obj);
    expect(result).toContain('sku = 999');
    expect(() => parse(result)).not.toThrow();
  });

  // ── Tests documenting issues found by expanded fuzz harness ─────────

  // Regression: deleting a key from a triply-nested single-line inline table
  // requires post-order recalc so each parent reads the child's already-fixed
  // end column.  A pre-order traversal would read a stale innerEndCol and
  // leave trailing whitespace before the outer closing braces.
  test('recalcInlineContainerEnds post-order: triply nested inline table', () => {
    const src = dedent`
      outer = { mid = { inner = { k = "x" } } }
    ` + '\n';

    const obj = parse(src);
    delete obj.outer.mid.inner.k;

    const result = patch(src, obj);
    expect(result).toEqual(dedent`
      outer = { mid = { inner = {} } }
    ` + '\n');
    expect(() => parse(result)).not.toThrow();
  });

  // BUG: Deleting a deeply nested key inside a table with special characters
  // in the path throws "Unsupported parent type for remove".
  test('BUG: deleting deeply nested key with special chars throws Unsupported parent type for remove', () => {
    const src = dedent`
      [b-v0g]
      h6op4iwf5r = 42

      ["*TqS".hbm]
      "Il%aX^Mae"."O^oB3/]" = { vy2f-nr = { i3wjnp = "delete-me" } }
    ` + '\n';

    const obj = parse(src);
    delete obj['*TqS'].hbm['Il%aX^Mae']['O^oB3/]']['vy2f-nr'].i3wjnp;

    // Currently throws: Unsupported parent type for remove
    const result = patch(src, obj);
    expect(result).toEqual(dedent`
      [b-v0g]
      h6op4iwf5r = 42

      ["*TqS".hbm]
      "Il%aX^Mae"."O^oB3/]" = { vy2f-nr = {} }
    ` + '\n');
    expect(() => patch(src, obj)).not.toThrow();
  });

  // BUG: Adding an array item inside a deeply nested inline array throws
  // "Unsupported parent type 'InlineItem' for insert".
  test('BUG: adding to nested inline array throws Unsupported parent type InlineItem for insert', () => {
    const src = dedent`
      KeL = [18:45:20, false, ["a", "b"]]
    ` + '\n';

    const obj = parse(src);
    obj.KeL[2].push('c');

    // Currently throws: Unsupported parent type "InlineItem" for insert
    expect(() => patch(src, obj)).not.toThrow();
  });

  // BUG: Emptying a single-line inline array leaves trailing whitespace
  // between the brackets: `a = [   ]` instead of `a = []`.
  test('BUG: emptying single-line inline array leaves trailing whitespace', () => {
    const src = dedent`
      a = ["x"]
    ` + '\n';
    expect(patch(src, { a: [] })).toEqual(dedent`
      a = []
    ` + '\n');
  });

  // BUG: Emptying an inline array nested inside an inline table leaves
  // trailing whitespace before the closing bracket and brace.
  test('BUG: emptying nested inline array inside inline table leaves trailing whitespace', () => {
    const src = dedent`
      a = { b = ["x"] }
    ` + '\n';
    expect(patch(src, { a: { b: [] } })).toEqual(dedent`
      a = { b = [] }
    ` + '\n');
  });

  // BUG: Deleting the only key from an inline table inside an inline array
  // leaves trailing whitespace before the outer closing bracket.
  test('BUG: tightening inline table inside inline array leaves trailing whitespace', () => {
    const src = dedent`
      a = [ { b = "x" } ]
    ` + '\n';
    const obj = parse(src);
    delete obj.a[0].b;
    expect(patch(src, obj)).toEqual(dedent`
      a = [ {} ]
    ` + '\n');
  });

  // Changing a dotted-key value from object to empty array works correctly.
  test('changing dotted-key value from object to array', () => {
    const src = dedent`
      [w.dalac]
      vko.mucg."rDrfx:_" = 1974-01-11
    ` + '\n';

    const obj = parse(src);
    obj.w.dalac.vko = [];

    expect(patch(src, obj)).toEqual(dedent`
      [w.dalac]
      vko = []
    ` + '\n');
    expect(() => parse(patch(src, obj))).not.toThrow();
  });

// ---------------------------------------------------------------------------
// Copilot review #280: wasEmptied / hadNonLastRemoval compensation
//
// These tests exercise the insertOnNewLine path that compensates for
// accumulated removal offsets when a parent is emptied by remove() and
// then re-filled by insert() during patching.
//
// Key scenarios:
//  - Single removal (last item): skip extra blank line
//  - Multiple removal (non-last items): use full offset compensation
//  - Sequential patches: offsets accumulate across patch() calls
// ---------------------------------------------------------------------------

describe('wasEmptied compensation — empty table then add keys', () => {

  test('should add a single key to a table emptied by removing its only key', () => {
    const src = dedent`
      [server]
      host = "localhost"
    ` + '\n';

    const patched = patch(src, { server: { port: 8080 } });

    expect(patched).toEqual(dedent`
      [server]
      port = 8080
    ` + '\n');
    expect(parse(patched)).toEqual({ server: { port: 8080 } });
  });

  test('should add multiple keys to a table emptied by removing its only key', () => {
    const src = dedent`
      [server]
      host = "localhost"
    ` + '\n';

    const patched = patch(src, { server: { host: 'remote', port: 8080 } });

    expect(patched).toEqual(dedent`
      [server]
      host = "remote"
      port = 8080
    ` + '\n');
    expect(parse(patched)).toEqual({ server: { host: 'remote', port: 8080 } });
  });

  test('should add a key to a table emptied by removing ALL its keys (multiple removal)', () => {
    const src = dedent`
      [db]
      host = "localhost"
      port = 5432
      enabled = true
    ` + '\n';

    const patched = patch(src, { db: { name: 'prod' } });

    expect(patched).toEqual(dedent`
      [db]
      name = "prod"
    ` + '\n');
    expect(parse(patched)).toEqual({ db: { name: 'prod' } });
  });

  test('should add multiple keys to a table emptied by removing ALL its keys', () => {
    const src = dedent`
      [db]
      host = "localhost"
      port = 5432
      enabled = true
    ` + '\n';

    const patched = patch(src, { db: { host: 'remote', port: 3306 } });

    expect(patched).toEqual(dedent`
      [db]
      host = "remote"
      port = 3306
    ` + '\n');
    expect(parse(patched)).toEqual({ db: { host: 'remote', port: 3306 } });
  });

});

describe('wasEmptied compensation — remove non-last items, add keys', () => {

  test('should remove first key and add a new key to the same table', () => {
    const src = dedent`
      [s]
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const patched = patch(src, { s: { b: 2, c: 3, d: 4 } });

    expect(patched).toEqual(dedent`
      [s]
      b = 2
      c = 3
      d = 4
    ` + '\n');
    expect(parse(patched)).toEqual({ s: { b: 2, c: 3, d: 4 } });
  });

  test('should remove middle key and add a new key to the same table', () => {
    const src = dedent`
      [s]
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const patched = patch(src, { s: { a: 1, c: 3, d: 4 } });

    expect(patched).toEqual(dedent`
      [s]
      a = 1
      c = 3
      d = 4
    ` + '\n');
    expect(parse(patched)).toEqual({ s: { a: 1, c: 3, d: 4 } });
  });

  test('should remove multiple non-last keys and add keys to the same table', () => {
    const src = dedent`
      [s]
      a = 1
      b = 2
      c = 3
      d = 4
    ` + '\n';

    // Remove a and c, keep b and d, add e
    const patched = patch(src, { s: { b: 2, d: 4, e: 5 } });

    expect(patched).toEqual(dedent`
      [s]
      b = 2
      d = 4
      e = 5
    ` + '\n');
    expect(parse(patched)).toEqual({ s: { b: 2, d: 4, e: 5 } });
  });

  test('should remove first and middle keys, modify last, add new key', () => {
    const src = dedent`
      [s]
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const patched = patch(src, { s: { c: 99, d: 4 } });

    expect(patched).toEqual(dedent`
      [s]
      c = 99
      d = 4
    ` + '\n');
    expect(parse(patched)).toEqual({ s: { c: 99, d: 4 } });
  });

});

describe('wasEmptied compensation — document root', () => {

  test('should remove all root KVs and add new ones', () => {
    const src = dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const patched = patch(src, { x: 10, y: 20 });

    expect(patched).toEqual(dedent`
      x = 10
      y = 20
    ` + '\n');
    expect(parse(patched)).toEqual({ x: 10, y: 20 });
  });

  test('should remove all root KVs and a table, add new root KVs', () => {
    const src = dedent`
      a = 1
      [s]
      k = "v"
    ` + '\n';

    const patched = patch(src, { x: 10 });

    expect(patched).toEqual(dedent`
      x = 10
    ` + '\n');
    expect(parse(patched)).toEqual({ x: 10 });
  });

  test('should remove a root KV, keep others, add a new root KV', () => {
    const src = dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const patched = patch(src, { a: 1, c: 3, d: 4 });

    expect(patched).toEqual(dedent`
      a = 1
      c = 3
      d = 4
    ` + '\n');
    expect(parse(patched)).toEqual({ a: 1, c: 3, d: 4 });
  });

});

describe('wasEmptied compensation — sequential patches (offset accumulation)', () => {

  test('should handle multiple sequential patches that remove then add to the same table', () => {
    let src = dedent`
      [t]
      a = 1
      b = 2
      c = 3
    ` + '\n';

    // Patch 1: remove a and c
    src = patch(src, { t: { b: 2 } });

    // Patch 2: add d and e
    src = patch(src, { t: { b: 2, d: 4, e: 5 } });

    expect(src).toEqual(dedent`
      [t]
      b = 2
      d = 4
      e = 5
    ` + '\n');
    expect(parse(src)).toEqual({ t: { b: 2, d: 4, e: 5 } });
  });

  test('should handle sequential patches: empty table, add back different keys', () => {
    let src = dedent`
      [t]
      a = 1
      b = 2
    ` + '\n';

    // Patch 1: empty the table entirely
    src = patch(src, { t: {} });

    // Patch 2: add new keys to the empty table
    src = patch(src, { t: { x: 10, y: 20 } });

    expect(src).toEqual(dedent`
      [t]
      x = 10
      y = 20
    ` + '\n');
    expect(parse(src)).toEqual({ t: { x: 10, y: 20 } });
  });

  test('should handle sequential patches: remove all, add single key', () => {
    let src = dedent`
      [db]
      host = "old"
      port = 1234
      name = "legacy"
    ` + '\n';

    // Patch 1: remove all keys
    src = patch(src, { db: {} });

    // Patch 2: add just one key
    src = patch(src, { db: { host: 'new' } });

    expect(src).toEqual(dedent`
      [db]
      host = "new"
    ` + '\n');
    expect(parse(src)).toEqual({ db: { host: 'new' } });
  });

  test('should handle three sequential patches with mixed operations', () => {
    let src = dedent`
      [cfg]
      debug = true
      verbose = false
      path = "/tmp"
      mode = "auto"
    ` + '\n';

    // Patch 1: remove debug and verbose (non-last items)
    src = patch(src, { cfg: { path: '/tmp', mode: 'auto' } });

    // Patch 2: change mode, add timeout
    src = patch(src, { cfg: { path: '/tmp', mode: 'manual', timeout: 30 } });

    // Patch 3: remove path, add retries
    src = patch(src, { cfg: { mode: 'manual', timeout: 30, retries: 3 } });

    expect(src).toEqual(dedent`
      [cfg]
      mode = "manual"
      timeout = 30
      retries = 3
    ` + '\n');
    expect(parse(src)).toEqual({ cfg: { mode: 'manual', timeout: 30, retries: 3 } });
  });

});

describe('wasEmptied compensation — with comments', () => {

  test('should remove all keys and comments, then add a new key', () => {
    const src = dedent`
      # server config
      [server]
      # the hostname
      host = "localhost"
      # the port number
      port = 8080
    ` + '\n';

    const patched = patch(src, { server: { name: 'main' } });

    // Comments owned by removed keys should be gone. The server header survives.
    expect(patched).toEqual(dedent`
      # server config
      [server]
      name = "main"
    ` + '\n');
    expect(parse(patched)).toEqual({ server: { name: 'main' } });
  });

  test('should remove non-last key (with its comment), keep others, add new key', () => {
    const src = dedent`
      [s]
      # doc for a
      a = 1
      # doc for b
      b = 2
      # doc for c
      c = 3
    ` + '\n';

    // Remove b (middle, non-last), keep a and c, add d
    const patched = patch(src, { s: { a: 1, c: 3, d: 4 } });

    expect(patched).toEqual(dedent`
      [s]
      # doc for a
      a = 1
      # doc for c
      c = 3
      d = 4
    ` + '\n');
    expect(parse(patched)).toEqual({ s: { a: 1, c: 3, d: 4 } });
  });

});

describe('wasEmptied compensation — multiple tables', () => {

  test('should empty one table and add keys to another in the same patch', () => {
    const src = dedent`
      [a]
      x = 1
      y = 2

      [b]
      u = 3
      v = 4
    ` + '\n';

    // Empty table a, modify table b
    const patched = patch(src, { a: {}, b: { u: 33, w: 5 } });

    // BUG: extra blank line — emptied [a] accumulates an extra \n before [b].
    // Expected: one blank line between sections.
    // Actual:   two blank lines (offset compensation not applied across tables).
    expect(patched).toEqual(dedent`
      [a]

      [b]
      u = 33
      w = 5
    ` + '\n');
    expect(parse(patched)).toEqual({ a: {}, b: { u: 33, w: 5 } });
  });

  test('should empty two tables and add keys to a third', () => {
    const src = dedent`
      [x]
      p = 1

      [y]
      q = 2

      [z]
      r = 3
    ` + '\n';

    const patched = patch(src, { x: {}, y: {}, z: { r: 33, s: 4 } });

    // BUG: same extra-blank-line issue — emptying two tables accumulates
    // extra \n before [z].
    expect(patched).toEqual(dedent`
      [x]

      [y]

      [z]
      r = 33
      s = 4
    ` + '\n');
    expect(parse(patched)).toEqual({ x: {}, y: {}, z: { r: 33, s: 4 } });
  });

  test('should empty first table without doubling gap to third table', () => {
    const src = dedent`
      [a]
      x = 1
      y = 2

      [b]
      u = 3
      v = 4

      [c]
      z = 9
    ` + '\n';

    // Empty table a, leave b and c as-is
    const patched = patch(src, { a: {}, b: { u: 3, v: 4 }, c: { z: 9 } });

    expect(patched).toEqual(dedent`
      [a]

      [b]
      u = 3
      v = 4

      [c]
      z = 9
    ` + '\n');
    expect(parse(patched)).toEqual({ a: {}, b: { u: 3, v: 4 }, c: { z: 9 } });
  });

  test('should replace a table with a scalar and add a new table', () => {
    const src = dedent`
      [old]
      a = 1
      b = 2
    ` + '\n';

    const patched = patch(src, { replaced: 42, newTable: { k: 'v' } });

    expect(patched).toEqual(dedent`
      replaced = 42

      [newTable]
      k = "v"
    ` + '\n');
    expect(parse(patched)).toEqual({ replaced: 42, newTable: { k: 'v' } });
  });

  // ─── Fuzz-discovered bugs ───────────────────────────────────────────

  // BUG: Changing a value inside a nested array within a multiline array
  // produces consecutive commas in the output (found by fuzz seed 485).
  test('BUG: changing nested array element in multiline array produces consecutive commas (fuzz #485)', () => {
    const src = dedent`
      a = [
          1,
          [true, "old"],
          2,
      ]
    ` + '\n';
    const obj = parse(src);
    obj.a[1][1] = 'new';
    const result = patch(src, obj);
    expect(result).toEqual(dedent`
      a = [
          1,
          [true, "new"],
          2,
      ]
    ` + '\n');
    expect(parse(result)).toEqual(obj);
  });

  // BUG: Changing a value inside a nested array where the inner array
  // contains a multiline string also produces consecutive commas (fuzz #485).
  test('BUG: changing nested array with multiline string produces consecutive commas (fuzz #485)', () => {
    const src = dedent`
      a = [
          1,
          ["""multiline""", "old"],
          2,
      ]
    ` + '\n';
    const obj = parse(src);
    obj.a[1][1] = -1990;
    const result = patch(src, obj);
    expect(result).toEqual(dedent`
      a = [
          1,
          ["""multiline""", -1990],
          2,
      ]
    ` + '\n');
    expect(parse(result)).toEqual(obj);
  });

  // BUG: Deleting the first segment of a dotted key combined with other
  // mutations throws "Unsupported parent type 'String' for remove".
  // Reproduced from fuzz seed 484 with 5 simultaneous mutations.
  //
  // FIXED (partial): The crash is resolved by detecting when findParent
  // returns the node itself via dotted-key prefix match and re-resolving
  // from one path segment higher.
  //
  // TODO: Implicit parent "y" (created by dotted key y.ic83) does not
  // survive when its last child is removed — "y": {} is dropped.
  test.fails('BUG: implicit parent of dotted KV does not survive child removal (fuzz #484)', () => {
    const src = dedent`
      y3.u9jt4 = 0b111101
      "pEjJDgj/n".y = 0xeb5034c
      ",]:3".c3gv1z38g_.vn1lxf = true

      [u."NgwYb3!rlF"]
      y.ic83 = """
      #sZ#tNV<X1%PphX4(o:Fu8jUvpv
      3 qD0/B4lie2,J[s-{AYbY"""
      njk8xvm-6x.W = "vHCCFC+$*?o<1mOc2S^$F4*7_/<jN"
      et."6/Kl%~!".x = '%z,Nm9;8#)XfKK_]q/%b2A1jNvZo\x60)<E(E[zFP?KN?<E[^C '
      ";-"."2x]Cif%<"."D8j1h+4:" = -110730
    ` + '\n';
    const obj = parse(src);
    // Apply all 5 mutations from the fuzzer
    obj.u['NgwYb3!rlF'].y.ic83 = 'CHANGED';
    obj[',]:3'].c3gv1z38g_.vn1lxf = false;
    delete obj['pEjJDgj/n'];
    obj[',]:3'].c3gv1z38g_ = 'xj-fOBz7';
    delete obj.u['NgwYb3!rlF'].y.ic83;
    const result = patch(src, obj);
    expect(() => parse(result)).not.toThrow();
    expect(parse(result)).toEqual(obj);
  });

  // BUG: Deleting keys from a table combined with other mutations
  // throws "Unsupported parent type 'Boolean' for remove".
  // Reproduced from fuzz seed 489 with 5 simultaneous mutations.
  test('BUG: multi-mutation delete inside table throws Unsupported parent type (fuzz #489)', () => {
    const src = dedent`
      "N&SXI1".el2p2s-m.j3 = 2045-07-18T11:00:10.256062
      q = -772872
      k4a5.ead = 'Fb&gu;:rUq&I{@Iet|K&.0K%| H l3<hHo\x60'
      mqxgy2dd.k1rn-ldy9."" = "[y~a0&sL:QFBWA(E^4@0KUt-^X67PWFicWIBqiusU"
      sde.obmro = 830_535
      "===".y0dqtn8.u = -26407.26473
      ajmjz0klb.di.ywrci_zil = "xbS2C+$XRg_|n^4- f!3dwG7"

      [gs."(85$X"]
      ovd7t07g8.sp = true

      ["#y".nlkaw9.yr]
      d5 = 0b010001010001000
      rqd.aw = false

      [sittwg3wnr]
      "}}Qv" = """
      N&$!/k$}GoJ\x60$:.E,
      *Nu"""
      hun7gm546- = ""
      "" = """
      $"""
      "DR.QfvN5N".aa9woa2t7 = ">b\x60w$GU>eb"
      m5-v0o = 1997-12-02T06:11:47Z
      "(z" = 'p%jH;/ep]8+0Y/!?2q>(sa'
      aqufgw5lze = false
      xuxn = 42
    ` + '\n';
    const obj = parse(src);
    // Apply all 5 mutations from the fuzzer
    if (!obj.a3K) obj.a3K = {};
    obj['a3K'].d = '2033-07-14T00:00:00.000Z';
    delete obj.sittwg3wnr.aqufgw5lze;
    delete obj.sittwg3wnr.xuxn;
    delete obj.sittwg3wnr[''];
    obj.gs['(85$X'].ovd7t07g8.sp = 'MrYC_R';
    const result = patch(src, obj);
    expect(() => parse(result)).not.toThrow();
    expect(parse(result)).toEqual(obj);
  });

  // BUG: Changing deeply nested values inside an inline table under a
  // section header produces a duplicate [kaes3f6] header.
  // Reproduced from fuzz seed 464 with 3 simultaneous mutations.
  //
  // The bug triggers when structural type changes (dotted-key table→scalar,
  // string→object, object→array) are applied to a deeply nested inline table
  // under a section header. The patcher emits a second [kaes3f6] header
  // instead of modifying the inline table in place.
  test.fails('BUG: structural changes in nested inline table under section produce duplicate header (fuzz #464)', () => {
    const src = dedent`
      [kaes3f6]
      rrc4z.r-dr3h3 = { bksb.eca7itb61.ismjjcc = false, aavr = { dvk1s.hiza = "x", 0.y2k2_.tgo = "" } }
    ` + '\n';
    const obj = parse(src);
    // Structural type changes:
    // 1. dotted-key table → scalar
    obj.kaes3f6.rrc4z['r-dr3h3'].bksb = -454861;
    // 2. string → object
    obj.kaes3f6.rrc4z['r-dr3h3'].aavr.dvk1s = { hiza: true };
    // 3. object → array
    obj.kaes3f6.rrc4z['r-dr3h3'].aavr['0'].y2k2_ = [1];
    const result = patch(src, obj);
    // Should produce valid TOML with a single [kaes3f6] header
    expect(() => parse(result)).not.toThrow();
    expect(parse(result)).toEqual(obj);
  });

  // BUG: Deleting a key from a nested inline table inside an array
  // can throw "Node not found in parent for removal" with certain
  // format options. Simple single-mutation works, but the fuzzer
  // found failures with format options like minimumDecimals (seed 483).
  test('BUG: deleting key from nested inline table in array should leave empty subtable (simple case, fuzz #483)', () => {
    const src = dedent`
      i6i6d5cuwt = [{ "ZQG<xH>I8" = { sgshmg = { k92 = 1 } } }]
    ` + '\n';
    const obj = parse(src);
    delete obj.i6i6d5cuwt[0]['ZQG<xH>I8'].sgshmg.k92;
    expect(patch(src, obj)).toEqual(dedent`
      i6i6d5cuwt = [{ "ZQG<xH>I8" = { sgshmg = {} } }]
    ` + '\n');
    expect(parse(patch(src, obj))).toEqual(obj);
  });

  // BUG: Changing a value inside a nested array within a multiline array
  // that contains a wider inner array also produces consecutive commas.
  // Found by fuzz seed 485 (multi-mutation scenario).
  test('BUG: changing nested array element in wide multiline array produces bad output (fuzz #485 multi)', () => {
    const src = dedent`
      kdp2j91 = [
          1265.69395,
          [true, 761028, ",,sYY(,N<1]=,+<g", 6924.16041],
          1996-05-17T21:40:33Z,
      ]
    ` + '\n';
    const obj = parse(src);
    obj.kdp2j91[1][2] = -1990;
    const result = patch(src, obj);
    expect(result).toEqual(dedent`
      kdp2j91 = [
          1265.69395,
          [true, 761028, -1990, 6924.16041],
          1996-05-17T21:40:33Z,
      ]
    ` + '\n');
    expect(parse(result)).toEqual(obj);
  });

});
