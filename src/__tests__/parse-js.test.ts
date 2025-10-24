import parseJS from '../parse-js';
import parseTOML from '../parse-toml';
import toTOML from '../to-toml';
import dedent from 'dedent';
import { toDocument } from '../patch';

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


const valueMixedOrder = {
  f: {
    g: ['h', 'i', 'j'],
  },
  t: [{ u: 'v' }, { w: 'x' }, { y: 'z' }],
  a: '1',
  b: 2,
  c: 3.14,
  d: true,
  e: new Date('1979-05-27T07:32:00Z')
};

test('it should be properly formatted', () => {
  expect(toTOML(parseJS(value).items)).toMatchSnapshot();
  expect(
    toTOML(parseJS(value, { bracketSpacing: false, trailingComma: true }).items)
  ).toMatchSnapshot();
});

test('it should perform reordering', () => {
  expect(toTOML(parseJS(valueMixedOrder).items)).toMatchSnapshot();
  expect(
    toTOML(parseJS(valueMixedOrder, { bracketSpacing: false, trailingComma: true }).items)
  ).toMatchSnapshot();
});

test('it should remove leading empty lines', () => {
  expect(toTOML(parseJS({ a: { b: 2 }, c: { d: 4 }, e: { f: 6 } }).items)).toMatchSnapshot();
});

test('simple JS Parsing', () => {
  const value = {
    ab: 1
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
        column: 6
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
            column: 6
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
              column: 2
            }
          },
          raw: "ab",
          value: [
            "ab"
          ]
        },
        equals: 3,
        value: {
          type: "Integer",
          loc: {
            start: {
              line: 1,
              column: 5
            },
            end: {
              line: 1,
              column: 6
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



test('simple JS Parsing with table', () => {


  const valueString = dedent`
    [project]
    ab = 1
  `+ '\n';

  const value = toDocument(parseTOML(valueString));

  const serialized = JSON.stringify(value, null, 4);

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
        column: 0 //Why is it zero?
      }
    },
    items: [
      {
        type: "Table",
        loc: {
          start: {
            line: 1,
            column: 0
          },
          end: {
            line: 2,
            column: 6
          }
        },
        key: {
          type: "TableKey",
          loc: {
            start: {
              line: 1,
              column: 0
            },
            end: {
              line: 1,
              column: 9
            }
          },
          item: {
            type: "Key",
            loc: {
              start: {
                line: 1,
                column: 1
              },
              end: {
                line: 1,
                column: 8
              }
            },
            raw: "project",
            value: [
              "project"
            ]
          }
        },
        items: [
          {
            type: "KeyValue",
            key: {
              type: "Key",
              loc: {
                start: {
                  line: 2,
                  column: 0
                },
                end: {
                  line: 2,
                  column: 2
                }
              },
              raw: "ab",
              value: [
                "ab"
              ]
            },
            value: {
              type: "Integer",
              loc: {
                start: {
                  "line": 2,
                  "column": 5
                },
                end: {
                  "line": 2,
                  "column": 6
                }
              },
              raw: "1",
              value: 1
            },
            loc: {
              start: {
                line: 2,
                column: 0
              },
              end: {
                line: 2,
                column: 6
              }
            },
            equals: 3
          }
        ]
      }
    ]
  }

  const expectedOutput = JSON.stringify(expectedAST, null, 4);

  expect(serialized).toEqual(expectedOutput);
});