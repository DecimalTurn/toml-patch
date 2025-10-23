import { stringify } from '../';
import dedent from 'dedent';
import parseTOML from '../parse-toml';
import parseJS from '../parse-js';
import toTOML from '../to-toml';

test('should stringify example from readme', () => {
  const toml = stringify(
    {
      title: 'TOML Example',
      owner: {
        name: 'Tim'
      }
    }
  );

  expect(toml).toEqual(dedent`
    title = "TOML Example"

    [owner]
    name = "Tim"
    ` + '\n'
  );

});

test('should stringify simple example', () => {

  //Stringify the object
  const toml = parseJS(
    {
      bar: 'baz',
      foo: {
        a: 'b'
      }
    }
  );

  //console.log(toml);
  let ouput = toTOML(toml.items);

  let expectedOutput = dedent`
    bar = "baz"

    [foo]
    a = "b"
    ` + '\n';

  const x = [...parseTOML(expectedOutput)];

  expect(ouput).toEqual(expectedOutput);

});

// We try with an object that has a simple value and an object
// There might be a bug in the algorithm when there are simple value that appears after the objects.
test('should stringify simple example with simple value at the end', () => {

  //Splitting the stringnify process into two steps

  const toml = parseJS(
    {
      foo: {
        a: 'b'
      },
      bar: 'baz'
    }
  );

  //console.log(toml);
  let ouput = toTOML(toml.items);

  let expectedOutput = dedent`
    bar = "baz"

    [foo]
    a = "b"
    ` + '\n';

  const x = [...parseTOML(expectedOutput)];

  expect(ouput).toEqual(expectedOutput);

});


// Simple toml with empty object and a simple value
// {
//   foo: {},
//   bar: 'baz'
// }
test('should stringify simple example with empty object', () => {
  
  //Splitting the stringnify process into two steps

  const toml = parseJS(
    {
      foo: {},
      bar: 'baz'
    }
  );

  //console.log(toml);
  let ouput = toTOML(toml.items);

  let expectedOutput = dedent`
    bar = "baz"

    [foo]
    ` + '\n';

  //Ensure that parsing the expected output doesn't throw
  const x = [...parseTOML(expectedOutput)];

  expect(ouput).toEqual(expectedOutput);

});

// Test for quoted key bug in table headers
test('should stringify object with quoted key in table header correctly', () => {
  
  // This represents the JS object that results from parsing: [dog  .  "tater.man"]
  const jsObject = {
    dog: {
      "tater.man": {
        type: {
          name: "pug"
        }
      }
    }
  };

  const result = stringify(jsObject);

  // The expected output should preserve the quoted key in the table header
  // and not convert it to an inline table
  const expectedOutput = dedent`
    [dog."tater.man"]
    type.name = "pug"
    ` + '\n';

  expect(result).toEqual(expectedOutput);
});

// TODO: Add test with TOML that has no key/value pairs at top level