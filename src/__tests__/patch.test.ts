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
    authors = ["Tim Hall"]
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
    authors = ["Tim Hall"]
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
    pooler = { enabled = true, pool_mode = "transaction" }
    ` + '\n';
  
  expect(patched).toEqual(expectedOutput);
});