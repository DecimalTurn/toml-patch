import { Location } from './location';

export enum NodeType {
  Document = 'Document',
  Table = 'Table',
  TableKey = 'TableKey',
  /**
   * Array of Tables node
   * More info: https://toml.io/en/latest#array-of-tables
   */
  TableArray = 'TableArray',
  TableArrayKey = 'TableArrayKey',
  KeyValue = 'KeyValue',
  Key = 'Key',
  String = 'String',
  Integer = 'Integer',
  Float = 'Float',
  Boolean = 'Boolean',
  DateTime = 'DateTime',
  InlineArray = 'InlineArray',
  InlineItem = 'InlineItem',
  InlineTable = 'InlineTable',
  /**
   * Comment node
   * More info: https://toml.io/en/latest#comment
   */
  Comment = 'Comment'
}

//
// Abstract Syntax Tree
//
// AST nodes are used to represent TOML data
//
export type AST = Iterable<Block>;

//
// Document
//
// Top-level document that stores AST nodes
//
export interface Document extends TreeNode {
  type: NodeType.Document;
  items: Array<Block>;
}
export function isDocument(node: TreeNode): node is Document {
  return node.type === NodeType.Document;
}

//
// Table
//
// Top-level object
//
// v-------|
// [table] |
// b = "c" |
//         |
// # note  |
//      ^--|
// [b]
//
export interface Table extends TreeNode {
  type: NodeType.Table;
  key: TableKey;
  items: RowItem[];
}
export function isTable(node: TreeNode): node is Table {
  return node.type === NodeType.Table;
}

//
// TableKey
//
// Used to store bracket information for Table keys
//
// loc includes brackets
//
// [  key  ]
// ^-------^
//
export interface TableKey extends TreeNode {
  type: NodeType.TableKey;
  item: Key;
}
export function isTableKey(node: TreeNode): node is TableKey {
  return node.type === NodeType.TableKey;
}

//
// TableArray
//
// Top-level array item
//
// v---------|
// [[array]] |
// a="b"     |
//           |
// # details |
//         ^-|
// [[array]]
//
export interface TableArray extends TreeNode {
  type: NodeType.TableArray;
  key: TableArrayKey;
  items: RowItem[];
}

/**
 * Is a TableArray (aka Array of Tables)
 * @param node 
 * @returns 
 */
export function isTableArray(node: TreeNode): node is TableArray {
  return node.type === NodeType.TableArray;
}

//
// TableArrayKey
//
// Used to store bracket information for TableArray keys
// loc includes brackets
//
// [[  key  ]]
// ^---------^
//
export interface TableArrayKey extends TreeNode {
  type: NodeType.TableArrayKey;
  item: Key;
}
export function isTableArrayKey(node: TreeNode): node is TableArrayKey {
  return node.type === NodeType.TableArrayKey;
}

//
// KeyValue
//
// Key and Value nodes, with position information on equals sign
//
// key="value" # note
// ^---------^
//
export interface KeyValue extends TreeNode {
  type: NodeType.KeyValue;
  key: Key;
  value: Value;

  // Column index (0-based) of the equals sign
  equals: number;
}
export function isKeyValue(node: TreeNode): node is KeyValue {
  return node.type === NodeType.KeyValue;
}

//
// Key
//
// Store raw key and parts (from dots)
//
export interface Key extends TreeNode {
  type: NodeType.Key;
  raw: string;

  // Note: Array for keys with dots
  // e.g. a.b -> raw = 'a.b', value = ['a', 'b']
  value: string[];
}
export function isKey(node: TreeNode): node is Key {
  return node.type === NodeType.Key;
}

//
// String
//
// loc includes quotes
//
// a = "string"
//     ^------^
//
export interface String extends TreeNode {
  type: NodeType.String;
  raw: string;
  value: string;
}
export function isString(node: TreeNode): node is String {
  return node.type === NodeType.String;
}

//
// Integer
//
export interface Integer extends TreeNode {
  type: NodeType.Integer;
  raw: string;
  value: number;
}
export function isInteger(node: TreeNode): node is Integer {
  return node.type === NodeType.Integer;
}

//
// Float
//
export interface Float extends TreeNode {
  type: NodeType.Float;
  raw: string;
  value: number;
}
export function isFloat(node: TreeNode): node is Float {
  return node.type === NodeType.Float;
}

//
// Boolean
//
export interface Boolean extends TreeNode {
  type: NodeType.Boolean;

  // Only `true` and `false` are permitted
  // -> don't need separate raw and value
  value: boolean;
}
export function isBoolean(node: TreeNode): node is Boolean {
  return node.type === NodeType.Boolean;
}

//
// DateTime
//
// Note: Currently, Offset Date-Time, Local Date-Time, Local Date, and Local Time
// are handled via raw
//
export interface DateTime extends TreeNode {
  type: NodeType.DateTime;
  raw: string;
  value: Date;
}
export function isDateTime(node: TreeNode): node is DateTime {
  return node.type === NodeType.DateTime;
}

//
// InlineArray
//
export interface InlineArray<TItem = TreeNode> extends TreeNode {
  type: NodeType.InlineArray;
  items: InlineArrayItem<TItem>[];
}
export function isInlineArray(node: TreeNode): node is InlineArray {
  return node.type === NodeType.InlineArray;
}

// InlineItem  (internal AST wrapper — not a TOML spec concept)
//
// InlineItem is a container node that wraps each element inside an inline
// container (InlineArray or InlineTable).  It carries two responsibilities:
//
//   1. Tracking the comma that follows the element (comma: boolean).
//      When the element is the last one in the container, `comma` may be
//      false (no trailing comma) or true (trailing comma, TOML 1.1+).
//
//   2. Providing a stable "slot" node in the parent's .items array so that
//      the writer can apply positional offsets independently of the wrapped
//      value node itself.
//
// It is generic over TItem so that the two concrete subtypes can constrain
// what they wrap:
//
//   InlineArrayItem<TItem>  — wraps any Value (scalar, array, inline table)
//   InlineTableItem         — always wraps a KeyValue
//
// Location:
//   loc spans from the start of the wrapped value to the character just
//   before the comma (or the end of the value when there is no comma).
//
//   [ "a"  ,"b", "c"  ]
//     ^---^ ^-^  ^-^
//
//   { a = 1 , b = 2 }
//     ^---^   ^---^
//
// Note on findByPath traversal:
//   When navigating a path into an InlineArray, findByPath matches numeric
//   indices to InlineArrayItem positions.  When the wrapped item is an
//   InlineTable and the path has further segments to resolve, traversal
//   continues into item.item (the InlineTable), not into the InlineItem
//   wrapper itself (which has no .items of its own).
//
export interface InlineItem<TItem = TreeNode> extends TreeNode {
  type: NodeType.InlineItem;
  item: TItem;
  comma: boolean;
}
export function isInlineItem(node: TreeNode): node is InlineItem {
  return node.type === NodeType.InlineItem;
}

// InlineArrayItem — semantic alias for InlineItem used as the element type of
// InlineArray.items.  It adds no fields; its existence is purely documentary:
// naming the subtype makes the array-vs-table distinction visible in type
// annotations without requiring an extra runtime check.
//
// TItem can be any Value: a scalar (String, Integer, …), a nested InlineArray,
// or an InlineTable.  The generic parameter is propagated so that typed arrays
// such as InlineArray<String> carry their element type through to the items.
//
// [ "a"  ,"b", "c"  ]
//   ^---^ ^-^  ^-^   ← each element is an InlineArrayItem
//
export interface InlineArrayItem<TItem = TreeNode> extends InlineItem<TItem> {}

//
// InlineTable
//
export interface InlineTable extends TreeNode {
  type: NodeType.InlineTable;
  items: InlineTableItem[];
}
export function isInlineTable(node: TreeNode): node is InlineTable {
  return node.type === NodeType.InlineTable;
}

// InlineTableItem — semantic alias for InlineItem<KeyValue> used as the element type
// of InlineTable.items.  It adds no fields; its existence is purely documentary:
// naming the subtype makes the array-vs-table distinction visible in type
// annotations without requiring an extra runtime check.
//
// The type parameter is fixed to KeyValue, which means the unsafe cast
// `existing.item as KeyValue` that previously appeared in patch.ts is
// unnecessary — the type system already guarantees it.
//
// { a="b"   ,    c =    "d"   }
//   ^------^     ^--------^   ← each element is an InlineTableItem
//
export interface InlineTableItem extends InlineItem<KeyValue> {}

//
// Comment
//
// loc starts at "#" and goes to end of comment (trailing whitespace ignored)
//
// # comment here
// ^------------^
//
export interface Comment extends TreeNode {
  type: NodeType.Comment;
  raw: string;
}
export function isComment(node: TreeNode): node is Comment {
  return node.type === NodeType.Comment;
}

//
// Combinations
//

/**
 * RowItem represents items that can appear inside Table and TableArray sections.
 * These are the items that form the "rows" of content within table structures.
 * 
 * Unlike Block items (which include Table and TableArray), RowItems can only be
 * KeyValue pairs and Comments - you cannot have nested tables within a table section.
 */
export type RowItem = KeyValue | Comment;
export function isRowItem(node: TreeNode): node is RowItem {
  return isKeyValue(node) || isComment(node);
}

export interface WithItems extends TreeNode {
  items: TreeNode[];
}
export function hasItems(node: TreeNode): node is WithItems {
  return (
    isDocument(node) ||
    isTable(node) ||
    isTableArray(node) ||
    isInlineTable(node) ||
    isInlineArray(node)
  );
}

export interface WithItem extends TreeNode {
  item: TreeNode;
}
export function hasItem(node: TreeNode): node is WithItem {
  return isTableKey(node) || isTableArrayKey(node) || isInlineItem(node);
}

/**
 * Block represents items that can appear at the root level (Document level) in TOML.
 * 
 * Context and Usage:
 * - Block items are the fundamental top-level constructs in a TOML document
 * - They appear directly in Document containers and regular Table sections
 * - This is in contrast to InlineItems, which appear within inline containers
 * 
 * Important Distinction:
 * - Table and TableArray can ONLY exist as Block items (they cannot appear inside inline containers)
 * - KeyValue and Comment can exist as BOTH Block items AND as InlineItems:
 *   * As Block: When they appear at root level or inside regular Table sections
 *   * As InlineItem: When they appear inside InlineTable or InlineArray containers
 * 
 * Examples:
 * ```toml
 * # These are Block items at root level:
 * name = "value"        # KeyValue as Block
 * # This is a comment   # Comment as Block
 * [table]               # Table as Block
 * [[array]]             # TableArray as Block
 * 
 * # These are Block items inside a Table:
 * [config]
 * setting = "value"     # KeyValue as Block (inside Table)
 * # comment here        # Comment as Block (inside Table)
 * 
 * # These are InlineItems (NOT Block items):
 * array = [ "a", "b" ]          # "a", "b" are InlineItems
 * table = { key = "value" }     # key="value" is InlineItem
 * ```
 * 
 * Type Safety:
 * This distinction is crucial for the AST structure because:
 * - Document.items: Block[]
 * - Table.items: RowItem[] (KeyValue | Comment)
 * - TableArray.items: RowItem[] (KeyValue | Comment)
 * - InlineArray.items: InlineArrayItem[] (which extends InlineItem)
 * - InlineTable.items: InlineTableItem[] (which extends InlineItem)
 */
export type Block = KeyValue | Table | TableArray | Comment;
export function isBlock(node: TreeNode): node is Block {
  return isKeyValue(node) || isTable(node) || isTableArray(node) || isComment(node);
}

export type Value<TInlineArrayItem = TreeNode> =
  | String
  | Integer
  | Float
  | Boolean
  | DateTime
  | InlineArray<TInlineArrayItem>
  | InlineTable;
export function isValue(node: TreeNode): node is Value {
  return (
    isString(node) ||
    isInteger(node) ||
    isFloat(node) ||
    isBoolean(node) ||
    isDateTime(node) ||
    isInlineArray(node) ||
    isInlineTable(node)
  );
}

export interface TreeNode {
  type: NodeType;
  loc: Location;
}
