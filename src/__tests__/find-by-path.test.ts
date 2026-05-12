import findByPath from '../find-by-path';
import parseTOML from '../parse-toml';
import { example } from '../__fixtures__';
import { Document, NodeType } from '../ast';
import dedent from 'dedent';

it('should find node by path', () => {
  const cst = parseTOML(example);
  const document: Document = {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    items: [...cst]
  };

  expect(findByPath(document, []).type).toEqual('Document');
  expect((findByPath(document, ['title']) as any).value.value).toEqual('TOML Example');
  expect((findByPath(document, ['owner', 'organization']) as any).value.value).toEqual('GitHub');
  expect((findByPath(document, ['database', 'ports', 2]) as any).item.value).toEqual(8002);
  expect((findByPath(document, ['products', 1, 'name']) as any).value.value).toEqual('Nail');
});

it('should find nodes within nested inline tables', () => {
  // TOML 1.1.0 allows nested inline tables
  const toml = dedent`
    server = { host = "localhost", port = 8080 }
    config = {
        database = { host = "db.local", port = 5432 },
        cache = { enabled = true, ttl = 300 }
    }
    `;
  
  const cst = parseTOML(toml);
  const document: Document = {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    items: [...cst]
  };

  // Should find simple inline table properties
  const serverHost = findByPath(document, ['server', 'host']) as any;
  expect(serverHost.type).toEqual('InlineItem');
  expect(serverHost.item.value.value).toEqual('localhost');

  const serverPort = findByPath(document, ['server', 'port']) as any;
  expect(serverPort.type).toEqual('InlineItem');
  expect(serverPort.item.value.value).toEqual(8080);

  // Should find nested inline table properties (the key fix!)
  // Before the fix, this would throw: "Could not find node at path config.database.host"
  const dbHost = findByPath(document, ['config', 'database', 'host']) as any;
  expect(dbHost.type).toEqual('InlineItem');
  expect(dbHost.item.value.value).toEqual('db.local');

  const dbPort = findByPath(document, ['config', 'database', 'port']) as any;
  expect(dbPort.type).toEqual('InlineItem');
  expect(dbPort.item.value.value).toEqual(5432);

  const cacheEnabled = findByPath(document, ['config', 'cache', 'enabled']) as any;
  expect(cacheEnabled.type).toEqual('InlineItem');
  expect(cacheEnabled.item.value.value).toEqual(true);

  // Should also be able to find the intermediate nested tables
  const database = findByPath(document, ['config', 'database']) as any;
  expect(database.type).toEqual('InlineItem');
  expect(database.item.value.type).toEqual('InlineTable');

  const cache = findByPath(document, ['config', 'cache']) as any;
  expect(cache.type).toEqual('InlineItem');
  expect(cache.item.value.type).toEqual('InlineTable');
});

it('should keep scanning AOT-scoped siblings after a shorter prefix match fails', () => {
  const toml = dedent`
    [[fruit]]
    name = "apple"

    [fruit.physical]
    color = "red"

    [fruit.physical.dimensions]
    width = 10

    [[fruit]]
    name = "banana"
    `;

  const cst = parseTOML(toml);
  const document: Document = {
    type: NodeType.Document,
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    items: [...cst]
  };

  const width = findByPath(document, ['fruit', 0, 'physical', 'dimensions', 'width']) as any;
  expect(width.value.value).toEqual(10);
});
