import { stringify } from '../';
import dedent from 'dedent';
import parseTOML from '../parse-toml';
import parseJS from '../parse-js';
import toTOML from '../to-toml';
import { TomlFormat } from '../toml-format';

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
  let ouput = toTOML(toml.items, new TomlFormat());

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
  let ouput = toTOML(toml.items, new TomlFormat());

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
  let ouput = toTOML(toml.items, new TomlFormat());

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
    [dog]
    "tater.man" = { type = { name = "pug" } }
    ` + '\n';

  expect(result).toEqual(expectedOutput);
});

// Test for special float values (Infinity, -Infinity, NaN)
test('should stringify special float values correctly', () => {
  const jsObject = {
    positive_infinity: Infinity,
    negative_infinity: -Infinity,
    not_a_number: NaN
  };

  const result = stringify(jsObject);

  const expectedOutput = dedent`
    positive_infinity = inf
    negative_infinity = -inf
    not_a_number = nan
    ` + '\n';

  expect(result).toEqual(expectedOutput);
});

// Test for special float values in arrays
test('should stringify arrays with special float values correctly', () => {
  const jsObject = {
    special_floats: [1.5, Infinity, -Infinity, NaN, 3.14]
  };

  const result = stringify(jsObject);

  const expectedOutput = dedent`
    special_floats = [ 1.5, inf, -inf, nan, 3.14 ]
    ` + '\n';

  expect(result).toEqual(expectedOutput);
});

// Test for special float values in nested objects
test('should stringify nested objects with special float values correctly', () => {
  const jsObject = {
    math_constants: {
      infinity: Infinity,
      negative_infinity: -Infinity
    },
    calculations: {
      result: NaN
    }
  };

  const result = stringify(jsObject);

  const expectedOutput = dedent`
    [math_constants]
    infinity = inf
    negative_infinity = -inf

    [calculations]
    result = nan
    ` + '\n';

  expect(result).toEqual(expectedOutput);
});

// Test for mixed number types including special float values
test('should stringify mixed number types correctly', () => {
  const jsObject = {
    integer: 42,
    float: 3.14159,
    scientific: 1.23e-4,
    positive_infinity: Infinity,
    negative_infinity: -Infinity,
    not_a_number: NaN,
    zero: 0,
    negative_zero: -0
  };

  const result = stringify(jsObject);

  const expectedOutput = dedent`
    integer = 42
    float = 3.14159
    scientific = 0.000123
    positive_infinity = inf
    negative_infinity = -inf
    not_a_number = nan
    zero = 0
    negative_zero = -0.0
    ` + '\n';

  expect(result).toEqual(expectedOutput);
});

// Test for TOML that has no key/value pairs at top level (only sections)
test('should stringify object with no top-level key/value pairs', () => {
  const jsObject = {
    database: {
      server: "192.168.1.1",
      ports: [8001, 8001, 8002],
      connection_max: 5000,
      enabled: true
    },
    servers: {
      alpha: {
        ip: "10.0.0.1",
        dc: "eqdc10"
      },
      beta: {
        ip: "10.0.0.2",
        dc: "eqdc10"
      }
    }
  };

  const result = stringify(jsObject);

  const expectedOutput = dedent`
    [database]
    server = "192.168.1.1"
    ports = [ 8001, 8001, 8002 ]
    connection_max = 5000
    enabled = true

    [servers]
    alpha = { ip = "10.0.0.1", dc = "eqdc10" }
    beta = { ip = "10.0.0.2", dc = "eqdc10" }
    ` + '\n';

  expect(result).toEqual(expectedOutput);
});