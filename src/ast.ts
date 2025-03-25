import { Location } from './location';

export enum NodeType {
  Document = 'Document',
  Table = 'Table',
  TableKey = 'TableKey',
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
  items: Array<KeyValue | Comment>;
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
  items: Array<KeyValue | Comment>;
}
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

  // Column index (0-based) of equals sign
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

//
// InlineArrayItem
//
// loc for InlineArrayItem is from start of value to before comma
// or end-of-value if no comma
//
// [ "a"  ,"b", "c"  ]
//   ^---^ ^-^  ^-^
//
export interface InlineItem<TItem = TreeNode> extends TreeNode {
  type: NodeType.InlineItem;
  item: TItem;
  comma: boolean;
}
export function isInlineItem(node: TreeNode): node is InlineItem {
  return node.type === NodeType.InlineItem;
}

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

//
// InlineTableItem
//
// loc for InlineTableItem follows InlineArrayItem
//
// { a="b"   ,    c =    "d"   }
//   ^------^     ^--------^
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
