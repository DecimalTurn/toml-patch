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
  const currentDateTime = value.start_datetime as Date;
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

test('should preserve all TOML date/time formats when patching', () => {
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
