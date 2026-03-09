import parseJS from '../parse-js';
import parseTOML from '../parse-toml';
import toTOML from '../to-toml';
import dedent from 'dedent';
import { NodeType, AST, Document } from '../ast';
import { TomlFormat } from '../toml-format';

function toDocument(ast: AST): Document {
  const items = [...ast];
  return {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    items,
  };
}

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

const fmt = TomlFormat.default();
fmt.bracketSpacing = false;
fmt.trailingComma = true;

test('it should be properly formatted', () => {
  expect(toTOML(parseJS(value).items, fmt)).toMatchSnapshot();

  expect(
    toTOML(parseJS(value, fmt).items, fmt)
  ).toMatchSnapshot();
});

test('it should perform reordering', () => {
  expect(toTOML(parseJS(valueMixedOrder).items, fmt)).toMatchSnapshot();
  expect(
    toTOML(parseJS(valueMixedOrder, fmt).items, fmt)
  ).toMatchSnapshot();
});

test('it should remove leading empty lines', () => {
  expect(toTOML(parseJS({ a: { b: 2 }, c: { d: 4 }, e: { f: 6 } }).items, fmt)).toMatchSnapshot();
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