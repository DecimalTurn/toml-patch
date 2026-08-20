import patch from '../patch';
import { parse } from '../';


describe('indentation at the root level', () => {

  test('single key added to indented single key', () => {
    const src = [
      '    key1 = "test"',
    ].join('\n')

    const obj = parse(src) as any;
    //Add key2 to the object
    obj.key2 = "new-value";

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual([
      '    key1 = "test"',
      '    key2 = "new-value"',
    ].join('\n'));
  });

  // The indentaion of the new key should match the last sibling key in the container
  test('single key added to a few keys with inconsistent indentation', () => {
    const src = [
      '  key1 = "test1"',
      '    key2 = "test2"',
    ].join('\n')

    const obj = parse(src) as any;
    obj.key3 = "new-value";

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual([
      '  key1 = "test1"',
      '    key2 = "test2"',
      '    key3 = "new-value"',
    ].join('\n'));
  });

  test('single key added to indented single key with dotted keys', () => {
    const src = [
      '    fruit.color = "yellow"',
    ].join('\n')
    const obj = parse(src) as any;
    //Add fruit.flavor to the object
    obj.fruit.flavor = "banana";
    expect(patch(src, obj)).toEqual([
      '    fruit.color = "yellow"',
      '    fruit.flavor = "banana"',
    ].join('\n'));  
  });

});

describe('human-edited indentation', () => {

  test('adds a key to a table with one-space indentation', () => {
    const src = [
      '[server]',
      ' host = "localhost"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.server.port = 8080;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '[server]',
      ' host = "localhost"',
      ' port = 8080',
    ].join('\n'));
  });

  test('matches the last table row after an indentation jump', () => {
    const src = [
      '[server]',
      '  host = "localhost"',
      '    port = 8080',
    ].join('\n');
    const obj = parse(src) as any;
    obj.server.timeout = 30;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '[server]',
      '  host = "localhost"',
      '    port = 8080',
      '    timeout = 30',
    ].join('\n'));
  });

  test('keeps four-space indentation for a new dotted table key', () => {
    const src = [
      '[database]',
      '    connection.host = "localhost"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.database.connection.port = 5432;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '[database]',
      '    connection.host = "localhost"',
      '    connection.port = 5432',
    ].join('\n'));
  });

  test('does not use an indented comment as the table row style if there is one key', () => {
    const src = [
      '[server]',
      '      # managed by the platform',
      '    host = "localhost"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.server.port = 8080;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '[server]',
      '      # managed by the platform',
      '    host = "localhost"',
      '    port = 8080',
    ].join('\n'));
  });

    test('does not use an indented comment as the table row style even when only a comment is present', () => {
    const src = [
      '[server]',
      '      # managed by the platform',
    ].join('\n');
    const obj = parse(src) as any;
    obj.server.port = 8080;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '[server]',
      '      # managed by the platform',
      '',
      'port = 8080',
    ].join('\n'));
  });

  test('preserves indentation when adding a root key before a section', () => {
    const src = [
      '  name = "app"',
      '',
      '[server]',
      'host = "localhost"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.version = "1.0";

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '  name = "app"',
      '  version = "1.0"',
      '',
      '[server]',
      'host = "localhost"',
    ].join('\n'));
  });

  test('preserves tab indentation in a table body', () => {
    const src = [
      '[server]',
      '\thost = "localhost"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.server.port = 8080;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '[server]',
      '\thost = "localhost"',
      '\tport = 8080',
    ].join('\n'));
  });

  test('does not reindent multiline string content when adding a sibling key', () => {
    const src = [
      'description = """',
      '  first line',
      '    second line',
      '"""',
    ].join('\n');
    const obj = parse(src) as any;
    obj.title = "example";

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'description = """',
      '  first line',
      '    second line',
      '"""',
      'title = "example"',
    ].join('\n'));
  });

  test('adds a row to a multiline inline table using its existing row column', () => {
    const src = [
      'config = {',
      '    host = "localhost",',
      '}',
    ].join('\n');
    const obj = parse(src) as any;
    obj.config.port = 8080;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'config = {',
      '    host = "localhost",',
      '    port = 8080,',
      '}',
    ].join('\n'));
  });

  test('populates an empty multiline inline table below an indented closing brace', () => {
    const src = [
      'config = {',
      '  }',
    ].join('\n');
    const obj = parse(src) as any;
    obj.config.host = "localhost";

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'config = {',
      '    host = "localhost"',
      '  }',
    ].join('\n'));
  });

  test('preserves four-space rows when replacing a dotted inline-table value', () => {
    const src = [
      'config = {',
      '    service.host = "localhost",',
      '    service.port = 80,',
      '}',
    ].join('\n');
    const obj = parse(src) as any;
    obj.config.service = { secure: true };

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'config = {',
      '    service.secure = true',
      '}',
    ].join('\n'));
  });

});

describe('nested multiline arrays', () => {

  test('preserves each nesting level when adding an outer array element', () => {
    const src = [
      'values = [',
      '  [',
      '    1,',
      '    2,',
      '  ],',
      ']'
    ].join('\n');
    const obj = parse(src) as any;
    obj.values.push([3, 4]);

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'values = [',
      '  [',
      '    1,',
      '    2,',
      '  ],',
      '  [',
      '    3,',
      '    4,',
      '  ],',
      ']'
    ].join('\n'));
  });

  test('preserves four-space nesting when adding an outer array element', () => {
    const src = [
      'values = [',
      '    [',
      '        1,',
      '        2,',
      '    ],',
      ']'
    ].join('\n');
    const obj = parse(src) as any;
    obj.values.push([3, 4]);

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'values = [',
      '    [',
      '        1,',
      '        2,',
      '    ],',
      '    [',
      '        3,',
      '        4,',
      '    ],',
      ']'
    ].join('\n'));
  });

  test('does not reindent multiline string content inside a new nested array', () => {
    const src = [
      'values = [',
      '  [',
      '    """',
      '      first line',
      '        second line',
      '    """,',
      '  ],',
      ']'
    ].join('\n');
    const obj = parse(src) as any;
    obj.values.push(['new value']);

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'values = [',
      '  [',
      '    """',
      '      first line',
      '        second line',
      '    """,',
      '  ],',
      '  [',
      '    "new value",',
      '  ],',
      ']'
    ].join('\n'));
  });

  test('preserves each nesting level when adding a nested array row', () => {
    const src = [
      'values = [',
      '  [',
      '    1,',
      '    2,',
      '  ],',
      ']'
    ].join('\n');
    const obj = parse(src) as any;
    obj.values[0].push(3);

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'values = [',
      '  [',
      '    1,',
      '    2,',
      '    3,',
      '  ],',
      ']'
    ].join('\n'));
  });

  test('preserves four-space nesting when adding a nested array row', () => {
    const src = [
      'values = [',
      '    [',
      '        1,',
      '        2,',
      '    ],',
      ']'
    ].join('\n');
    const obj = parse(src) as any;
    obj.values[0].push(3);

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'values = [',
      '    [',
      '        1,',
      '        2,',
      '        3,',
      '    ],',
      ']'
    ].join('\n'));
  });

  test('does not reindent multiline string content inside an existing nested array', () => {
    const src = [
      'values = [',
      '  [',
      '    """',
      '      first line',
      '        second line',
      '    """,',
      '  ],',
      ']'
    ].join('\n');
    const obj = parse(src) as any;
    obj.values[0].push('new value');

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'values = [',
      '  [',
      '    """',
      '      first line',
      '        second line',
      '    """,',
      '    "new value",',
      '  ],',
      ']'
    ].join('\n'));
  });

    test('does not reindent basic multiline string content inside an existing nested array', () => {
    const src = [
      'values = [',
      '  [',
      '    """',
      '      first line',
      '        second line""",',
      '  ],',
      ']'
    ].join('\n');
    const obj = parse(src) as any;
    obj.values[0][0] += '\n      new value\n';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'values = [',
      '  [',
      '    """',
      '      first line',
      '        second line',
      '      new value',
      '""",',
      '  ],',
      ']'
    ].join('\n'));
  });

});

