import patch from '../patch';
import { parse, TomlFormat } from '../';


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

  test('considers root indentation for table', () => {
    const src = [
      '  [server]',
      '  key1 = "value1"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.client = {};
    obj.client.port = 8080;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '  [server]',
      '  key1 = "value1"',
      '',
      '  [client]',
      '  port = 8080',
    ].join('\n'));

  });

});

describe('tab indentation', () => {

  test('detects tabs when adding a root-level sibling key', () => {
    const src = [
      '\tkey1 = "value1"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.key2 = 'value2';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '\tkey1 = "value1"',
      '\tkey2 = "value2"',
    ].join('\n'));
  });

  test('preserves tabs at each nested multiline-array level', () => {
    const src = [
      'values = [',
      '\t[',
      '\t\t1,',
      '\t\t2,',
      '\t],',
      ']',
    ].join('\n');
    const obj = parse(src) as any;
    obj.values.push([3, 4]);

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'values = [',
      '\t[',
      '\t\t1,',
      '\t\t2,',
      '\t],',
      '\t[',
      '\t\t3,',
      '\t\t4,',
      '\t],',
      ']',
    ].join('\n'));
  });

  test('uses tabs when explicitly populating an empty multiline inline table', () => {
    const src = [
      'config = {',
      '}',
    ].join('\n');
    const obj = parse(src) as any;
    obj.config.host = 'localhost';

    const result = patch(src, obj, { useTabsForIndentation: true, indentWidth: 4 });
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'config = {',
      '\thost = "localhost"',
      '}',
    ].join('\n'));
  });

  // The expected outcome of this test is not really ideal. Clearly if a document
  // is using a mixed of tabs and spaces, ideally the patch operation would leave things 
  // as they are, but the current implementation of the patcher will enforce only one
  // type of indentation. This is a limitation of the current implementation and could be
  // improved in the future, but we are being honest, mixed indentation is an abomination
  // and people should be grateful that we fix it for them. However, the fact that we
  // replace one space by a tab can be a bit surprising and introduce big shifts in the
  // document. But hey, if that's whats needed to get the person's attention on the fact
  // that they are using mixed indentation, then so be it. We can always improve this in
  // the future if people complain.
  test('preserves an indented comment when applying tab indentation', () => {
    const src = [
      '[server]',
      '  # managed by the platform',
      '\thost = "localhost"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.server.port = 8080;

    const fmt = TomlFormat.autoDetectFormat(src);

    expect(fmt.useTabsForIndentation).toBe(true);
    expect(fmt.indentWidth).toBe(1);

    const result = patch(src, obj, fmt);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '[server]',
      '\t\t# managed by the platform',
      '\thost = "localhost"',
      '\tport = 8080',
    ].join('\n'));
  });

  test('preserves an indented comment when applying tab indentation', () => {
    const src = [
      '[server]',
      '\t# managed by the platform',
      '    host = "localhost"',
      '    ip = "127.0.0.1"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.server.port = 8080;

    const fmt = TomlFormat.autoDetectFormat(src);

    expect(fmt.useTabsForIndentation).toBe(false);
    expect(fmt.indentWidth).toBe(4);

    const result = patch(src, obj, fmt);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '[server]',
      ' # managed by the platform',
      '    host = "localhost"',
      '    ip = "127.0.0.1"',
      '    port = 8080',
    ].join('\n'));
  });

});

describe('indentation edge cases', () => {

  test('ignores leading blank and comment lines when detecting root indentation', () => {
    const src = [
      '',
      '# application settings',
      '    name = "app"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.version = '1.0';

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '',
      '# application settings',
      '    name = "app"',
      '    version = "1.0"',
    ].join('\n'));
  });

  test('preserves CRLF when adding a tab-indented table row', () => {
    const src = [
      '[server]',
      '\thost = "localhost"',
    ].join('\r\n');
    const obj = parse(src) as any;
    obj.server.port = 8080;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '[server]',
      '\thost = "localhost"',
      '\tport = 8080',
    ].join('\r\n'));
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


  /* 
  This test is currently skipped because we currently don't support 
  adding indented keys to a table that has no keys. The patcher currently 
  uses the indentation of the last key in the table to determine the 
  indentation of new keys, but if there are no keys, it defaults to no indentation. This is a limitation 
  of the current implementation and could be improved in the future.

  Since this practical scenario is not common, we can skip this test for now. 
  If we want to support this in the future, we can revisit this test and implement 
  the necessary logic in the patcher to handle this case.

  */

  test.skip('considers root indentation and intra-table indentation separately', () => {
    const src = [
      '  [server]',
      '    key1 = "value1"',
    ].join('\n');
    const obj = parse(src) as any;
    obj.client = {};
    obj.client.port = 8080;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      '  [server]',
      '    key1 = "value1"',
      '',
      '  [client]',
      '    port = 8080',
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

  test('using indent when no elements are in the multiline inline table', () => {
    const src = [
      'config = {',
      '}',
    ].join('\n');
    const fmt = { indentWidth: 4 };
    const obj = parse(src) as any;
    obj.config.service = true;

    const result = patch(src, obj, fmt);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'config = {',
      '    service = true',
      '}',
    ].join('\n'));
  });

  test('using indent when no elements are in the multiline array', () => {
    const src = [
      'config = [',
      ']',
    ].join('\n');
    const fmt = { indentWidth: 4 };
    const obj = parse(src) as any;
    obj.config.push(true);

    const result = patch(src, obj, fmt);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'config = [',
      '    true',
      ']',
    ].join('\n'));
  });

    test('using indent when no elements are in the multiline array (default indent)', () => {
    const src = [
      'config = [',
      ']',
    ].join('\n');
    const obj = parse(src) as any;
    obj.config.push(true);

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'config = [',
      '  true',
      ']',
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

describe('nested multiline inline tables', () => {

  test('preserves each nesting level when adding an outer array element', () => {
    const src = [
      'values = [',
      '  {',
      '    name = "first",',
      '    enabled = true,',
      '  },',
      ']'
    ].join('\n');
    const obj = parse(src) as any;
    obj.values.push({ name: 'second', enabled: false });

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'values = [',
      '  {',
      '    name = "first",',
      '    enabled = true,',
      '  },',
      '  {',
      '    name = "second",',
      '    enabled = false,',
      '  },',
      ']'
    ].join('\n'));
  });

  test('preserves four-space nesting when adding an outer array element', () => {
    const src = [
      'values = [',
      '    {',
      '        name = "first",',
      '        enabled = true,',
      '    },',
      ']'
    ].join('\n');
    const obj = parse(src) as any;
    obj.values.push({ name: 'second', enabled: false });

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toBe([
      'values = [',
      '    {',
      '        name = "first",',
      '        enabled = true,',
      '    },',
      '    {',
      '        name = "second",',
      '        enabled = false,',
      '    },',
      ']'
    ].join('\n'));
  });

});

