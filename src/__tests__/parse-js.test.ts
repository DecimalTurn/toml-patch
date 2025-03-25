import parseJS from '../parse-js';
import toTOML from '../to-toml';
import dedent from 'dedent';

const value = {
  a: '1',
  b: 2,
  c: 3.14,
  d: true,
  e: new Date('1979-05-27T07:32:00Z'),
  f: {
    g: ['h', 'i', 'j'],
    k: [
      { l: 'm' },
      {
        n: 'o',
        p: {
          toJSON() {
            return 'qrs';
          }
        }
      }
    ]
  },
  t: [{ u: 'v' }, { w: 'x' }, { y: 'z' }]
};

test('it should be properly formatted', () => {
  expect(toTOML(parseJS(value).items)).toMatchSnapshot();
  expect(
    toTOML(parseJS(value, { bracketSpacing: false, trailingComma: true }).items)
  ).toMatchSnapshot();
});

test('it should remove leading empty lines', () => {
  expect(toTOML(parseJS({ a: { b: 2 }, c: { d: 4 }, e: { f: 6 } }).items)).toMatchSnapshot();
});

test('simple JS Parsing', () => {
  const value = {
    a: 1
  };

  const parsed = parseJS(value);
  const serialized = JSON.stringify(parsed, null, 4);

  const expectedAST = 
  {
      type: "Document",
      loc: {
          start: {
              line: 1,
              column: 0
          },
          end: {
              line: 1,
              column: 5
          }
      },
      items: [
          {
              type: "KeyValue",
              loc: {
                  start: {
                      line: 1,
                      column: 0
                  },
                  end: {
                      line: 1,
                      column: 5
                  }
              },
              key: {
                  type: "Key",
                  loc: {
                      start: {
                          line: 1,
                          column: 0
                      },
                      end: {
                          line: 1,
                          column: 1
                      }
                  },
                  raw: "a",
                  value: [
                      "a"
                  ]
              },
              equals: 2,
              value: {
                  type: "Integer",
                  loc: {
                      start: {
                          line: 1,
                          column: 4
                      },
                      end: {
                          line: 1,
                          column: 5
                      }
                  },
                  raw: "1",
                  value: 1
              }
          }
      ]
  }

  const expectedOutput = JSON.stringify(expectedAST, null, 4);

  expect(serialized).toEqual(expectedOutput);
});
