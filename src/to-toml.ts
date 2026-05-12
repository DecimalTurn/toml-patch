import {
  NodeType,
  CST,
  TreeNode,
  Document,
  Table,
  TableKey,
  TableArray,
  TableArrayKey,
  KeyValue,
  Key,
  String as StringNode,
  Integer,
  Float,
  Boolean as BooleanNode,
  DateTime,
  InlineArray,
  InlineTable,
  InlineItem,
  Comment
} from './ast';
import { Location } from './location';
import { SPACE } from './tokenizer';
import { TomlFormat } from './toml-format';
import { isIterable } from './utils';

const BY_NEW_LINE = /(\r\n|\n)/g;

/**
 * Converts a Concrete Syntax Tree (CST) back to TOML format string.
 * 
 * This function traverses the CST and reconstructs the original TOML document
 * by writing each node's raw content to the appropriate location coordinates.
 * It preserves the original formatting, spacing, and structure of the TOML file.
 * 
 * @param cst - The Concrete Syntax Tree representing the parsed TOML document
 * @param format - The formatting options to use for the output
 * @returns The reconstructed TOML document as a string
 * 
 * @example
 * ```typescript
 * const tomlString = toTOML(cst, TomlFormat.default());
 * ```
 */
export default function toTOML(cst: CST, format: TomlFormat): string {

  const lines: string[] = [];

  // Inline traversal for monomorphic property access (avoids generic traverse
  // visitor dispatch which causes megamorphic inline cache misses in V8)
  function emitNode(node: TreeNode) {
    switch (node.type) {
      case NodeType.Document:
        for (let i = 0; i < (node as Document).items.length; i++)
          emitNode((node as Document).items[i]);
        break;

      case NodeType.Table: {
        const tbl = node as Table;
        emitNode(tbl.key);
        for (let i = 0; i < tbl.items.length; i++) emitNode(tbl.items[i]);
        break;
      }
      case NodeType.TableKey: {
        const tk = node as TableKey;
        const { start, end } = tk.loc;
        writeSingle(lines, start.line, start.column, '[');
        writeSingle(lines, end.line, end.column - 1, ']');
        emitNode(tk.item);
        break;
      }

      case NodeType.TableArray: {
        const ta = node as TableArray;
        emitNode(ta.key);
        for (let i = 0; i < ta.items.length; i++) emitNode(ta.items[i]);
        break;
      }
      case NodeType.TableArrayKey: {
        const tak = node as TableArrayKey;
        const { start, end } = tak.loc;
        writeChars(lines, start.line, start.column, start.column + 2, '[[');
        writeChars(lines, end.line, end.column - 2, end.column, ']]');
        emitNode(tak.item);
        break;
      }

      case NodeType.KeyValue: {
        const kv = node as KeyValue;
        const line = kv.loc.start.line;
        writeSingle(lines, line, kv.equals, '=');
        emitNode(kv.key);
        emitNode(kv.value);
        break;
      }

      case NodeType.Key:
        write(lines, node.loc, (node as Key).raw);
        break;

      case NodeType.String:
        write(lines, node.loc, (node as StringNode).raw);
        break;
      case NodeType.Integer:
        write(lines, node.loc, (node as Integer).raw);
        break;
      case NodeType.Float:
        write(lines, node.loc, (node as Float).raw);
        break;
      case NodeType.Boolean:
        write(lines, node.loc, (node as BooleanNode).value.toString());
        break;
      case NodeType.DateTime:
        write(lines, node.loc, (node as DateTime).raw);
        break;

      case NodeType.InlineArray: {
        const ia = node as InlineArray;
        const { start, end } = ia.loc;
        writeSingle(lines, start.line, start.column, '[');
        writeSingle(lines, end.line, end.column - 1, ']');
        for (let i = 0; i < ia.items.length; i++) emitNode(ia.items[i]);
        break;
      }
      case NodeType.InlineTable: {
        const it = node as InlineTable;
        const { start, end } = it.loc;
        writeSingle(lines, start.line, start.column, '{');
        writeSingle(lines, end.line, end.column - 1, '}');
        for (let i = 0; i < it.items.length; i++) emitNode(it.items[i]);
        break;
      }
      case NodeType.InlineItem: {
        const ii = node as InlineItem;
        emitNode(ii.item);
        if (ii.comma) {
          const end = ii.loc.end;
          writeSingle(lines, end.line, end.column, ',');
        }
        break;
      }

      case NodeType.Comment:
        write(lines, node.loc, (node as Comment).raw);
        break;
            default: {
        // Preserve original behavior: throw on unrecognized node types
        // to catch bugs when new node types are added or invalid nodes appear.
        const type = (node as any).type;
        throw new Error(`toTOML: Unrecognized node type: ${String(type)}`);
            }
    }
  }

  // Handle both Document nodes and bare iterables (document.items)
  if (isIterable(cst)) {
    for (const item of cst) emitNode(item as TreeNode);
  } else {
    emitNode(cst as unknown as TreeNode);
  }

  // Post-process: convert leading spaces to tabs if useTabsForIndentation is enabled
  if (format.useTabsForIndentation) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Find the leading whitespace
      const match = line.match(/^( +)/);
      if (match) {
        const leadingSpaces = match[1];
        // Replace entire leading space sequence with equivalent tabs
        // Each space becomes a tab (preserving the visual width)
        const leadingTabs = '\t'.repeat(leadingSpaces.length);
        lines[i] = leadingTabs + line.substring(leadingSpaces.length);
      }
    }
  }

  return lines.join(format.newLine) + format.newLine.repeat(format.trailingNewline);
}

/**
 * Writes raw string content to specific location coordinates within a lines array.
 * 
 * This function is responsible for placing TOML content at precise positions within
 * the output lines, handling multi-line content and preserving existing content
 * around the target location.
 * 
 * @param lines - Array of string lines representing the TOML document being built.
 *                Lines are 1-indexed but stored in 0-indexed array.
 * @param loc - Location object specifying where to write the content, containing:
 *              - start: { line: number, column: number } - Starting position (1-indexed line, 0-indexed column)
 *              - end: { line: number, column: number } - Ending position (1-indexed line, 0-indexed column)
 * @param raw - The raw string content to write at the specified location.
 *              Can contain multiple lines separated by \n or \r\n.
 * 
 * @throws {Error} When there's a mismatch between location span and raw string line count
 * @throws {Error} When attempting to write to an uninitialized line
 * 
 * @example
 * ```typescript
 * const lines = ['', ''];
 * const location = { start: { line: 1, column: 0 }, end: { line: 1, column: 3 } };
 * write(lines, location, 'key');
 * // Result: lines[0] becomes 'key'
 * ```
 */
function write(lines: string[], loc: Location, raw: string) {
  // Fast path for single-line content (the vast majority of nodes).
  // Avoids the regex split + filter that allocates two temporary arrays.
  if (loc.start.line === loc.end.line) {
    const line = getLine(lines, loc.start.line);

    const existingBefore = line.substring(0, loc.start.column);
    const before = existingBefore.length < loc.start.column
      ? existingBefore.padEnd(loc.start.column, SPACE)
      : existingBefore;
    const after = line.substring(loc.end.column);

    lines[loc.start.line - 1] = before + raw + after;
    return;
  }

  // Multi-line path: split and filter newline separators
  const raw_lines = raw.split(BY_NEW_LINE).filter(line => line !== '\n' && line !== '\r\n');
  const expected_lines = loc.end.line - loc.start.line + 1;

  if (raw_lines.length !== expected_lines) {
    throw new Error(
      `Mismatch between location and raw string, expected ${expected_lines} lines for "${raw}"`
    );
  }

  for (let i = loc.start.line; i <= loc.end.line; i++) {
    const line = getLine(lines, i);

    const is_start_line = i === loc.start.line;
    const is_end_line = i === loc.end.line;

    let before = '';
    if (is_start_line) {
      const existingBefore = line.substring(0, loc.start.column);
      if (existingBefore.length < loc.start.column) {
        // Need to pad - always use spaces during write phase
        // Tab conversion happens in post-processing for leading indentation only
        before = existingBefore.padEnd(loc.start.column, SPACE);
      } else {
        before = existingBefore;
      }
    }
    const after = is_end_line ? line.substring(loc.end.column) : '';

    lines[i - 1] = before + raw_lines[i - loc.start.line] + after;
  }
}

/**
 * Fast path for writing a single character at a specific position.
 * Avoids creating temporary Location objects.
 */
function writeSingle(lines: string[], lineNum: number, column: number, char: string) {
  const line = getLine(lines, lineNum);
  const before = line.length < column
    ? line.padEnd(column, SPACE)
    : line.substring(0, column);
  const after = line.substring(column + 1);
  lines[lineNum - 1] = before + char + after;
}

/**
 * Fast path for writing a short string (e.g. '[[', ']]') at a known single-line span.
 * Avoids creating temporary Location objects.
 */
function writeChars(lines: string[], lineNum: number, startCol: number, endCol: number, chars: string) {
  const line = getLine(lines, lineNum);
  const before = line.length < startCol
    ? line.padEnd(startCol, SPACE)
    : line.substring(0, startCol);
  const after = line.substring(endCol);
  lines[lineNum - 1] = before + chars + after;
}

/**
 * Safely retrieves a line from the lines array, initializing empty lines as needed.
 * 
 * This helper function handles the conversion between 1-indexed line numbers (used in locations)
 * and 0-indexed array positions. It ensures that accessing a line that doesn't exist yet
 * will initialize all preceding lines with empty strings.
 * 
 * @param lines - Array of string lines representing the document
 * @param index - 1-indexed line number to retrieve
 * @returns The line content as a string, or empty string for new lines
 * 
 * @example
 * ```typescript
 * const lines = ['first line'];
 * const line = getLine(lines, 3); // Initializes lines[1] and lines[2] as empty strings
 * // lines becomes ['first line', '', '']
 * ```
 */
function getLine(lines: string[], index: number): string {
  if (!lines[index - 1]) {
    for (let i = 0; i < index; i++) {
      if (!lines[i]) lines[i] = '';
    }
  }

  return lines[index - 1];
}
