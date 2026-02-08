import parseTOML from '../parse-toml';
import { Table, KeyValue, InlineArray, DateTime, Document, AST } from '../ast';
import { example, fruit, hard_example, hard_example_unicode, kitchen_sink } from '../__fixtures__';
import dedent from 'dedent';

test('it should parse inline table', () => {
  expect([...parseTOML(`key = { end = true}`)]).toMatchSnapshot();
});

test('it should parse examples', () => {
  expect([...parseTOML(example)]).toMatchSnapshot();
  expect([...parseTOML(fruit)]).toMatchSnapshot();
});

test('it should parse kitchen sink', () => {
  const parsed = [...parseTOML(kitchen_sink)];

  // Normalize local dates and times
  const date_local = (parsed[2] as Table).items[5] as KeyValue;
  const array_items = (date_local.value as InlineArray<DateTime>).items;
  array_items.forEach(array_item => {
    // @ts-ignore Type 'string' is not assignable to type 'Date'
    array_item.item.value = `${Object.prototype.toString.call(array_item.item.value)}`;
  });

  expect(parsed).toMatchSnapshot();
});

test('it should parse hard examples', () => {
  expect([...parseTOML(hard_example)]).toMatchSnapshot();
  expect([...parseTOML(hard_example_unicode)]).toMatchSnapshot();
});

test('it should parse table key', () => {
  expect([...parseTOML(`[a.b.c]`)]).toMatchSnapshot();
});

test('it should parse table array key', () => {
  expect([...parseTOML(`[[a.b.c]]`)]).toMatchSnapshot();
});

test('it should parse -0', () => {
  expect([...parseTOML(`a = -0`)]).toMatchSnapshot();
});

test('should parse newlines in string', () => {
  expect([
    ...parseTOML(`
    a = "val\\nue"
    b = """value\\n"""
  `)
  ]).toMatchSnapshot();
});

test('should return correct error for invalid toml', () => {
  const invalid_toml = dedent`
  [package]
  name: Package Name
  `;

  const expected_error = dedent`
  Error parsing TOML (2, 5):

  name: Package Name
      ^
  Use '=' to separate keys and values, not ':'
  `;

  // Expect that calling parseTOML with invalid_toml throws an error
  expect(() => {
    // Convert generator to array to force execution
    Array.from(parseTOML(invalid_toml));
  }).toThrow(expected_error);
});

test('should return correct error for invalid escape sequence in string value', () => {
  const invalid_escape = `key = "\\q"`;
  
  expect(() => {
    Array.from(parseTOML(invalid_escape));
  }).toThrow(/Invalid escape sequence: \\q/);
});

test('should return correct error for invalid escape sequence in key', () => {
  const invalid_escape = `"key\\q" = "value"`;
  
  expect(() => {
    Array.from(parseTOML(invalid_escape));
  }).toThrow(/Invalid escape sequence: \\q/);
});

test('should return correct error for invalid escape sequence in table key', () => {
  const invalid_escape = `["table\\q"]`;
  
  expect(() => {
    Array.from(parseTOML(invalid_escape));
  }).toThrow(/Invalid escape sequence: \\q/);
});

test('should return correct error for invalid escape sequence in dotted key', () => {
  const invalid_escape = `a."b\\q".c = 1`;
  
  expect(() => {
    Array.from(parseTOML(invalid_escape));
  }).toThrow(/Invalid escape sequence: \\q/);
});

test('should return correct ParseError (not TypeError) for incomplete table at EOF', () => {
  const incomplete_table = `[`;
  
  expect(() => {
    Array.from(parseTOML(incomplete_table));
  }).toThrow(/Expected table key, reached end of file/);
});

describe('ParseError messages', () => {
  test('should show correct error for leading zeros in integers', () => {
    expect(() => {
      Array.from(parseTOML('a = 01'));
    }).toThrow(/Leading zeros are not allowed in decimal integers/);
  });

  test('should show correct error for consecutive underscores in numbers', () => {
    expect(() => {
      Array.from(parseTOML('a = 1__2'));
    }).toThrow(/Consecutive underscores in numbers are not allowed/);
  });

  test('should show correct error for trailing underscore in numbers', () => {
    expect(() => {
      Array.from(parseTOML('a = 123_'));
    }).toThrow(/Underscores in numbers must be surrounded by digits/);
  });

  test('should show correct error for hexadecimal with sign', () => {
    expect(() => {
      Array.from(parseTOML('a = +0x1A'));
    }).toThrow(/Hexadecimal numbers cannot have a sign prefix/);
  });

  test('should show correct error for octal with sign', () => {
    expect(() => {
      Array.from(parseTOML('a = -0o755'));
    }).toThrow(/Octal numbers cannot have a sign prefix/);
  });

  test('should show correct error for binary with sign', () => {
    expect(() => {
      Array.from(parseTOML('a = +0b1010'));
    }).toThrow(/Binary numbers cannot have a sign prefix/);
  });

  test('should show correct error for uppercase hex prefix', () => {
    expect(() => {
      Array.from(parseTOML('a = 0X1A'));
    }).toThrow(/Hexadecimal prefix must be lowercase "0x"/);
  });

  test('should show correct error for uppercase octal prefix', () => {
    expect(() => {
      Array.from(parseTOML('a = 0O755'));
    }).toThrow(/Octal prefix must be lowercase "0o"/);
  });

  test('should show correct error for uppercase binary prefix', () => {
    expect(() => {
      Array.from(parseTOML('a = 0B1010'));
    }).toThrow(/Binary prefix must be lowercase "0b"/);
  });

  test('should show correct error for invalid hexadecimal digits', () => {
    expect(() => {
      Array.from(parseTOML('a = 0xGHI'));
    }).toThrow(/Invalid hexadecimal digits/);
  });

  test('should show correct error for invalid octal digits', () => {
    expect(() => {
      Array.from(parseTOML('a = 0o789'));
    }).toThrow(/Invalid octal digits \(must be 0-7\)/);
  });

  test('should show correct error for invalid binary digits', () => {
    expect(() => {
      Array.from(parseTOML('a = 0b102'));
    }).toThrow(/Invalid binary digits \(must be 0 or 1\)/);
  });

  test('should show correct error for invalid date with wrong day', () => {
    expect(() => {
      Array.from(parseTOML('a = 2024-02-30'));
    }).toThrow(/Invalid date "2024-02-30": day 30 is invalid for month 02 in year 2024/);
  });

  test('should show correct error for invalid month', () => {
    expect(() => {
      Array.from(parseTOML('a = 2024-13-01'));
    }).toThrow(/Invalid date "2024-13-01": month must be between 01 and 12/);
  });

  test('should show correct error for invalid hour', () => {
    expect(() => {
      Array.from(parseTOML('a = 25:00:00'));
    }).toThrow(/Invalid time "25:00:00": hour must be between 00 and 23/);
  });

  test('should show correct error for invalid minute', () => {
    expect(() => {
      Array.from(parseTOML('a = 12:60:00'));
    }).toThrow(/Invalid time "12:60:00": minute must be between 00 and 59/);
  });

  test('should show correct error for invalid second', () => {
    expect(() => {
      Array.from(parseTOML('a = 12:00:61'));
    }).toThrow(/Invalid time "12:00:61": second must be between 00 and 60/);
  });

  test('should show correct error for multiline string as table key', () => {
    expect(() => {
      Array.from(parseTOML('["""key"""]'));
    }).toThrow(/Multiline strings \(""" or '''\) cannot be used as keys/);
  });

  test('should show correct error for array of tables with whitespace between brackets', () => {
    expect(() => {
      Array.from(parseTOML('[ [table]]'));
    }).toThrow(/Array of tables opening brackets must be immediately adjacent with no whitespace: \[\[table\]\]/);
  });

  test('should show correct error for leading zeros in float integer part', () => {
    expect(() => {
      Array.from(parseTOML('a = 01.5'));
    }).toThrow(/Leading zeros are not allowed in the integer part of a float/);
  });

  test('should show correct error for incomplete hexadecimal', () => {
    expect(() => {
      Array.from(parseTOML('a = 0x'));
    }).toThrow(/Incomplete hexadecimal number/);
  });

  test('should show correct error for incomplete octal', () => {
    expect(() => {
      Array.from(parseTOML('a = 0o'));
    }).toThrow(/Incomplete octal number/);
  });

  test('should show correct error for incomplete binary', () => {
    expect(() => {
      Array.from(parseTOML('a = 0b'));
    }).toThrow(/Incomplete binary number/);
  });
});