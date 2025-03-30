import patch from '../patch';
import { parse } from '../';
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

test('should patch readme example', () => {
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
    ` + '\n');

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

  console.log (value.disableLanguages)
  for (var i = 0; i < value.disableLanguages.length; i++) {
          if (value.disableLanguages[i] === 'he') {
              value.disableLanguages.splice(i, 1);
              i--;
          }
      }
  console.log (value.disableLanguages)

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