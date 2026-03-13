import {
  Document, NodeType, TreeNode, Table, TableArray, TableKey, TableArrayKey,
  InlineArray, InlineTable, InlineItem, KeyValue
} from '../ast';
import { Location, Position } from '../location';
import parseTOML from '../parse-toml';
import { patchAst } from '../patch';
import { TomlFormat } from '../toml-format';
import traverse from '../traverse';
import dedent from 'dedent';

// ---------------------------------------------------------------------------
// Position-overlap helpers
// ---------------------------------------------------------------------------

/**
 * True when position `a` is less than or equal to position `b`.
 * Comparison is line-major, column-minor.
 *
 * @param a - The left-hand position.
 * @param b - The right-hand position.
 * @returns `true` when a ≤ b.
 */
function posLe(a: Position, b: Position): boolean {
  return a.line < b.line || (a.line === b.line && a.column <= b.column);
}

/**
 * Format a {@link Location} as the human-readable string `"line:col-line:col"`.
 *
 * @param loc - The location to format.
 * @returns A compact string representation of the location range.
 */
function locStr(loc: Location): string {
  return `${loc.start.line}:${loc.start.column}-${loc.end.line}:${loc.end.column}`;
}

/**
 * Check whether `child`'s location is fully contained within `parent`'s location.
 *
 * @param parent - The enclosing AST node.
 * @param child  - The nested AST node whose location is being validated.
 * @returns A human-readable error string describing the violation, or `null` when
 *   the child is properly contained.
 */
function checkContainment(
  parent: TreeNode,
  child: TreeNode,
): string | null {
  const pLoc = parent.loc;
  const cLoc = child.loc;
  if (!pLoc || !cLoc) return null;

  const msgs: string[] = [];
  if (!posLe(pLoc.start, cLoc.start)) {
    msgs.push(
      `${child.type} starts at ${locStr(cLoc)} before parent ${parent.type} at ${locStr(pLoc)}`
    );
  }
  if (!posLe(cLoc.end, pLoc.end)) {
    msgs.push(
      `${child.type} ends at ${locStr(cLoc)} after parent ${parent.type} at ${locStr(pLoc)}`
    );
  }
  return msgs.length ? msgs.join('; ') : null;
}

/**
 * Walk the AST and return an array of human-readable overlap descriptions.
 * An empty array means all child positions fit within their parents.
 *
 * Validates every parent→child edge in the tree, including:
 * - `Document` → Block (`KeyValue` | `Table` | `TableArray` | `Comment`)
 * - `Table` / `TableArray` → `TableKey`/`TableArrayKey` + row items
 * - `KeyValue` → `Key` + `Value`
 * - `InlineArray` / `InlineTable` → `InlineItem` children
 * - `InlineItem` → inner item
 *
 * @param doc - The root {@link Document} node to validate.
 * @returns An array of violation strings; empty when all locations are consistent.
 */
function findPositionOverlaps(doc: Document): string[] {
  const overlaps: string[] = [];

  function pushIfBad(parent: TreeNode, child: TreeNode) {
    const msg = checkContainment(parent, child);
    if (msg) overlaps.push(msg);
  }

  traverse(doc, {
    Document: {
      enter(node: Document) {
        for (const item of node.items) pushIfBad(node, item);
      },
    },
    Table: {
      enter(node: Table) {
        pushIfBad(node, node.key);
        for (const item of node.items) pushIfBad(node, item);
      },
    },
    TableArray: {
      enter(node: TableArray) {
        pushIfBad(node, node.key);
        for (const item of node.items) pushIfBad(node, item);
      },
    },
    InlineArray: {
      enter(node: InlineArray, parent: TreeNode | null) {
        for (const item of node.items) pushIfBad(node, item as unknown as TreeNode);
      },
    },
    InlineTable: {
      enter(node: InlineTable, parent: TreeNode | null) {
        for (const item of node.items) pushIfBad(node, item as unknown as TreeNode);
      },
    },
    InlineItem: {
      enter(node: InlineItem) {
        if (node.item) pushIfBad(node, node.item as unknown as TreeNode);
      },
    },
    KeyValue: {
      enter(node: KeyValue, parent: TreeNode | null) {
        pushIfBad(node, node.key);
        pushIfBad(node, node.value);
      },
    },
  });

  return overlaps;
}

/**
 * Self-consistency check: every node's `end` position must be ≥ its `start`.
 * Nodes where `end` < `start` are flagged as "inverted" locations.
 *
 * @param doc - The root {@link Document} node to validate.
 * @returns An array of violation strings; empty when all locations are non-inverted.
 */
function findInvertedLocations(doc: Document): string[] {
  const violations: string[] = [];
  traverse(doc, {
    [NodeType.Document]: { enter: check },
    [NodeType.Table]: { enter: check },
    [NodeType.TableArray]: { enter: check },
    [NodeType.KeyValue]: { enter: check },
    [NodeType.Key]: { enter: check },
    [NodeType.String]: { enter: check },
    [NodeType.Integer]: { enter: check },
    [NodeType.Float]: { enter: check },
    [NodeType.Boolean]: { enter: check },
    [NodeType.DateTime]: { enter: check },
    [NodeType.InlineArray]: { enter: check },
    [NodeType.InlineTable]: { enter: check },
    [NodeType.InlineItem]: { enter: check },
    [NodeType.Comment]: { enter: check },
  });
  function check(node: TreeNode) {
    if (!posLe(node.loc.start, node.loc.end)) {
      violations.push(`${node.type} has inverted location ${locStr(node.loc)}`);
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse `toml`, apply `updated` as a patch, and return any parent-child
 * location-overlap violations found in the resulting AST.
 *
 * @param toml    - TOML source string to parse and patch.
 * @param updated - Plain JS object representing the desired document state.
 * @returns Overlap violation strings from {@link findPositionOverlaps}.
 */
function getOverlaps(toml: string, updated: any): string[] {
  const { document } = patchAst(parseTOML(toml), updated, new TomlFormat());
  return findPositionOverlaps(document);
}

/**
 * Parse `toml`, apply `updated` as a patch, and return any inverted-location
 * violations found in the resulting AST.
 *
 * @param toml    - TOML source string to parse and patch.
 * @param updated - Plain JS object representing the desired document state.
 * @returns Inverted-location violation strings from {@link findInvertedLocations}.
 */
function getInverted(toml: string, updated: any): string[] {
  const { document } = patchAst(parseTOML(toml), updated, new TomlFormat());
  return findInvertedLocations(document);
}

/**
 * Convenience assertion: verifies that both the overlap check
 * ({@link findPositionOverlaps}) and the inversion check
 * ({@link findInvertedLocations}) report zero violations after patching.
 *
 * @param toml    - TOML source string to parse and patch.
 * @param updated - Plain JS object representing the desired document state.
 */
function expectConsistent(toml: string, updated: any) {
  expect(getOverlaps(toml, updated)).toEqual([]);
  expect(getInverted(toml, updated)).toEqual([]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * These tests check whether the AST returned by patchAst() has consistent
 * position metadata after modifications (no parent-child location overlaps).
 *
 * The TOML string output is always correct — toTOML serializes from the AST
 * structure, not from raw positions. However, the AST position metadata may
 * become inconsistent when the writer adjusts nodes without fully propagating
 * position changes to parent containers.
 */

describe('AST position consistency after patching', () => {

  // ------ inline array mutations ------

  test('add to inline array', () => {
    expectConsistent('ports = [8001, 8002]\n', { ports: [8001, 8002, 8003] });
  });

  test('remove from inline array', () => {
    expectConsistent('ports = [8001, 8002, 8003]\n', { ports: [8001, 8003] });
  });

  test('edit inline array element', () => {
    expectConsistent('vals = [1, 2, 3]\n', { vals: [1, 99, 3] });
  });

  test('grow inline array from empty', () => {
    expectConsistent('a = []\n', { a: [1, 2, 3] });
  });

  test('clear inline array', () => {
    expectConsistent('a = [1, 2, 3]\n', { a: [] });
  });

  // ------ inline table mutations ------

  test('add to inline table', () => {
    expectConsistent('point = { x = 1, y = 2 }\n', { point: { x: 1, y: 2, z: 3 } });
  });

  test('remove from inline table', () => {
    expectConsistent('point = { x = 1, y = 2, z = 3 }\n', { point: { x: 1, z: 3 } });
  });

  test('edit inline table value', () => {
    expectConsistent('cfg = { debug = true }\n', { cfg: { debug: false } });
  });

  // ------ Document end position ------

  test('Document end position should encompass all children after add', () => {
    // Adding items to `x = [1]` expands the KV.
    expectConsistent('x = [1]\n', { x: [1, 2, 3, 4, 5] });
  });

  test('Document end position should encompass all children after edit', () => {
    // Replacing a short value with a longer one grows the KV.
    expectConsistent('p = { x = 1 }\n', { p: { x: 100000 } });
  });

  test('Document end position contracts after key removal', () => {
    // Removing `b = 2` from a two-key document should shrink the document end
    // to the last remaining line (line 1 / `a = 1`).
    const { document } = patchAst(parseTOML('a = 1\nb = 2\n'), { a: 1 }, new TomlFormat());
    expect(document.loc.end.line).toBe(1);
    expect(document.loc.end.column).toBe(5);
    expectConsistent('a = 1\nb = 2\n', { a: 1 });
  });

  // ------ scalar value edits ------

  test('edit string value — shorter to longer', () => {
    expectConsistent('name = "Al"\n', { name: 'Alexander' });
  });

  test('edit string value — longer to shorter', () => {
    expectConsistent('name = "Alexander"\n', { name: 'Al' });
  });

  test('edit integer value', () => {
    expectConsistent('count = 42\n', { count: 999999 });
  });

  test('edit boolean value', () => {
    expectConsistent('flag = true\n', { flag: false });
  });

  // ------ top-level key additions / removals ------

  test('add new key-value at document root', () => {
    expectConsistent('a = 1\n', { a: 1, b: 2 });
  });

  test('remove key-value from document root', () => {
    expectConsistent('a = 1\nb = 2\n', { a: 1 });
  });

  // ------ multi-line documents with [table] sections ------

  test('edit value inside a table section', () => {
    const toml = dedent`
      [server]
      host = "localhost"
      port = 8080
    ` + '\n';
    expectConsistent(toml, { server: { host: 'example.com', port: 8080 } });
  });

  test('add key to a table section', () => {
    const toml = dedent`
      [server]
      host = "localhost"
    ` + '\n';
    expectConsistent(toml, { server: { host: 'localhost', port: 3000 } });
  });

  test('remove key from a table section', () => {
    const toml = dedent`
      [server]
      host = "localhost"
      port = 8080
    ` + '\n';
    expectConsistent(toml, { server: { host: 'localhost' } });
  });

  // ------ multiple table sections ------

  test('edit across multiple table sections', () => {
    const toml = dedent`
      [database]
      server = "192.168.1.1"
      port = 5432

      [cache]
      ttl = 300
    ` + '\n';
    expectConsistent(toml, {
      database: { server: '10.0.0.1', port: 5432 },
      cache: { ttl: 600 },
    });
  });

  test('add a new table section', () => {
    const toml = dedent`
      [database]
      server = "localhost"
    ` + '\n';
    expectConsistent(toml, {
      database: { server: 'localhost' },
      logging: { level: 'info' },
    });
  });

  // ------ table arrays [[…]] ------

  test('add to table array', () => {
    const toml = dedent`
      [[products]]
      name = "Hammer"
      sku = 738594937

      [[products]]
      name = "Nail"
      sku = 284758393
    ` + '\n';
    expectConsistent(toml, {
      products: [
        { name: 'Hammer', sku: 738594937 },
        { name: 'Nail', sku: 284758393 },
        { name: 'Screw', sku: 123456789 },
      ],
    });
  });

  test('remove from table array', () => {
    const toml = dedent`
      [[items]]
      id = 1

      [[items]]
      id = 2

      [[items]]
      id = 3
    ` + '\n';
    expectConsistent(toml, { items: [{ id: 1 }, { id: 3 }] });
  });

  test('edit value in table array entry', () => {
    const toml = dedent`
      [[entries]]
      value = 10
    ` + '\n';
    expectConsistent(toml, { entries: [{ value: 999 }] });
  });

  // ------ nested inline structures ------

  test('nested inline table edit', () => {
    expectConsistent(
      'cfg = { db = { host = "localhost", port = 5432 } }\n',
      { cfg: { db: { host: 'remotehost', port: 5432 } } },
    );
  });

  test('nested inline array of arrays', () => {
    expectConsistent(
      'matrix = [[1, 2], [3, 4]]\n',
      { matrix: [[1, 2], [3, 4], [5, 6]] },
    );
  });

  // ------ no-op (identical data) ------

  test('no-change patch preserves positions', () => {
    const toml = dedent`
      [section]
      key = "value"
      num = 42
    ` + '\n';
    expectConsistent(toml, { section: { key: 'value', num: 42 } });
  });

  // ------ documents with comments ------

  test('positions are consistent near comments', () => {
    const toml = dedent`
      # top comment
      name = "test" # inline comment
      # mid comment
      value = 123
    ` + '\n';
    expectConsistent(toml, { name: 'changed', value: 456 });
  });

  // ------ move / reorder ------

  test('reorder array elements', () => {
    expectConsistent('items = [1, 2, 3]\n', { items: [3, 1, 2] });
  });

  // ------ rename key ------

  test('rename key in inline table', () => {
    expectConsistent(
      'point = { x = 1, y = 2 }\n',
      { point: { x: 1, z: 2 } },
    );
  });

  // ------ large expansion ------

  test('significant value expansion', () => {
    expectConsistent('s = "a"\n', { s: 'a'.repeat(200) });
  });

  // ------ inverted location sanity ------

  test('no inverted locations after adding to inline array', () => {
    expect(getInverted('a = [1]\n', { a: [1, 2, 3, 4, 5] })).toEqual([]);
  });

  test('no inverted locations after removing from table section', () => {
    const toml = dedent`
      [s]
      a = 1
      b = 2
      c = 3
    ` + '\n';
    expect(getInverted(toml, { s: { b: 2 } })).toEqual([]);
  });

  // ------ KV before/after table section removal edge cases ------

  test('remove leading KV before a table section', () => {
    const toml = dedent`
      title = "My App"
      [server]
      host = "localhost"
    ` + '\n';
    expectConsistent(toml, { server: { host: 'localhost' } });
  });

  test('remove table section after a leading KV', () => {
    const toml = dedent`
      title = "My App"
      [server]
      host = "localhost"
    ` + '\n';
    expectConsistent(toml, { title: 'My App' });
  });

  test('remove leading KV, keep table and table array', () => {
    const toml = dedent`
      version = 1
      [database]
      host = "localhost"
      [[entries]]
      id = 1
    ` + '\n';
    expectConsistent(toml, {
      database: { host: 'localhost' },
      entries: [{ id: 1 }],
    });
  });

  test('remove multiple leading KVs before table section', () => {
    const toml = dedent`
      a = 1
      b = 2
      c = 3
      [config]
      debug = true
    ` + '\n';
    expectConsistent(toml, { config: { debug: true } });
  });

  test('remove table section between two KVs', () => {
    // This is unusual TOML but structurally valid after patching
    const toml = dedent`
      top = "value"
      [middle]
      x = 1
    ` + '\n';
    expectConsistent(toml, { top: 'value' });
  });

  test('remove all table sections, keep root KVs', () => {
    const toml = dedent`
      name = "app"
      version = "1.0"
      [database]
      host = "db"
      [cache]
      ttl = 60
    ` + '\n';
    expectConsistent(toml, { name: 'app', version: '1.0' });
  });

  test('remove all root KVs, keep all table sections', () => {
    const toml = dedent`
      name = "app"
      version = "1.0"
      [database]
      host = "db"
      [cache]
      ttl = 60
    ` + '\n';
    expectConsistent(toml, {
      database: { host: 'db' },
      cache: { ttl: 60 },
    });
  });

  // ------ table array removal edge cases ------

  // BUG: Removing an entire table array by path ['tasks'] fails because
  // TableArray entries are indexed as ['tasks', 0], ['tasks', 1], etc.
  test('remove table array after leading KV', () => {
    const toml = dedent`
      title = "Project"
      [[tasks]]
      name = "build"
      [[tasks]]
      name = "test"
    ` + '\n';
    expectConsistent(toml, { title: 'Project' });
  });

  test('remove leading KV before table array', () => {
    const toml = dedent`
      title = "Project"
      [[tasks]]
      name = "build"
      [[tasks]]
      name = "test"
    ` + '\n';
    expectConsistent(toml, {
      tasks: [{ name: 'build' }, { name: 'test' }],
    });
  });

  test('remove middle entries from table array', () => {
    const toml = dedent`
      [[items]]
      id = 1
      [[items]]
      id = 2
      [[items]]
      id = 3
      [[items]]
      id = 4
    ` + '\n';
    expectConsistent(toml, { items: [{ id: 1 }, { id: 4 }] });
  });

  test('shrink table array to single entry', () => {
    const toml = dedent`
      [[items]]
      id = 1
      [[items]]
      id = 2
      [[items]]
      id = 3
    ` + '\n';
    expectConsistent(toml, { items: [{ id: 2 }] });
  });

  // ------ remove everything ------

  test('remove all content from document', () => {
    const toml = dedent`
      a = 1
      b = 2
      [section]
      key = "value"
    ` + '\n';
    expectConsistent(toml, {});
  });

  // ------ mixed add + remove in same patch ------

  test('remove KV and add new table in same patch', () => {
    const toml = dedent`
      title = "old"
      [server]
      port = 80
    ` + '\n';
    expectConsistent(toml, {
      server: { port: 80 },
      logging: { level: 'debug' },
    });
  });

  test('replace root KV with different value and delete table', () => {
    const toml = dedent`
      name = "old"
      [config]
      debug = true
      verbose = false
    ` + '\n';
    expectConsistent(toml, { name: 'new' });
  });

  test('edit root KV and remove table entry simultaneously', () => {
    const toml = dedent`
      version = 1
      [server]
      host = "localhost"
      port = 8080
    ` + '\n';
    expectConsistent(toml, { version: 2, server: { host: 'localhost' } });
  });

  // ------ documents with blank lines between sections ------

  test('remove KV from doc with blank line separators', () => {
    const toml = 'a = 1\n\nb = 2\n\n[section]\nkey = "v"\n';
    expectConsistent(toml, { b: 2, section: { key: 'v' } });
  });

  test('remove table from doc with blank line separators', () => {
    const toml = 'a = 1\n\n[section]\nkey = "v"\n\n[other]\nx = 2\n';
    expectConsistent(toml, { a: 1, other: { x: 2 } });
  });

  // ------ nested table sections ------

  // BUG: Removing a nested sub-table [server.tls] fails because the
  // removal logic cannot locate the sub-table node within its parent.
  test('remove nested sub-table', () => {
    const toml = dedent`
      [server]
      host = "localhost"
      [server.tls]
      cert = "server.pem"
      key = "server.key"
    ` + '\n';
    expectConsistent(toml, { server: { host: 'localhost' } });
  });

  test('add nested sub-table to existing table', () => {
    const toml = dedent`
      [server]
      host = "localhost"
    ` + '\n';
    expectConsistent(toml, {
      server: { host: 'localhost', tls: { cert: 'server.pem' } },
    });
  });

  // ------ inline table at document root ------

  test('remove root inline table, keep KV', () => {
    const toml = 'point = { x = 1, y = 2 }\nname = "origin"\n';
    expectConsistent(toml, { name: 'origin' });
  });

  test('remove root KV, keep inline table', () => {
    const toml = 'name = "origin"\npoint = { x = 1, y = 2 }\n';
    expectConsistent(toml, { point: { x: 1, y: 2 } });
  });

  // ------ single-item documents ------

  test('edit the only KV in a single-item document', () => {
    expectConsistent('key = "old"\n', { key: 'new' });
  });

  test('replace the only KV completely', () => {
    expectConsistent('old_key = 1\n', { new_key: 2 });
  });

  // ------ wide values that test column offset propagation ------

  test('remove wide KV before narrow sibling', () => {
    const toml = 'long_description = "This is a very long string value that takes up many columns"\nid = 1\n';
    expectConsistent(toml, { id: 1 });
  });

  test('remove narrow KV before wide sibling', () => {
    const toml = 'id = 1\nlong_description = "This is a very long string value that takes up many columns"\n';
    expectConsistent(toml, { long_description: 'This is a very long string value that takes up many columns' });
  });

});
