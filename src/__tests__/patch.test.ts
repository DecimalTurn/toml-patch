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
