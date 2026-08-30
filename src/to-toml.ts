import {
  getNodeSource,
  originalFirstChildStartedAfterOpener,
  sourceStructureUnchanged
} from './cst-source';
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
  Comment,
  hasItems,
  hasItem,
  isKeyValue,
  isInlineItem
} from './cst';
import { Location } from './location';
import { SPACE } from './tokenizer';
import { TomlFormat } from './toml-format';
import { isIterable } from './utils';
import { getCommaSpace } from './inline-comma-space';

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
        // Emit "[key]" in one write instead of three (bracket, key, bracket).
        write(lines, tk.loc, '[' + tk.item.raw + ']');
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
        // Emit "[[key]]" in one write instead of three.
        write(lines, tak.loc, '[[' + tak.item.raw + ']]');
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
    // Lines belonging to multiline string literals are VALUE content — the
    // indentation there is part of the string and must not be converted
    // (fuzz seed 70).  The opening-delimiter line may carry structural
    // indentation, but every line from the first content line through the
    // closing delimiter is untouchable.
    const contentLines = new Set<number>();
    const collectStringLines = (node: TreeNode) => {
      if (node.type === NodeType.String && node.loc.end.line > node.loc.start.line) {
        for (let l = node.loc.start.line + 1; l <= node.loc.end.line; l++) {
          contentLines.add(l);
        }
      }
      if (hasItems(node)) {
        for (const item of node.items as TreeNode[]) collectStringLines(item);
      }
      if (isKeyValue(node)) collectStringLines(node.value);
      if (isInlineItem(node)) collectStringLines(node.item);
    };
    if (isIterable(cst)) {
      for (const item of cst) collectStringLines(item as TreeNode);
    } else {
      collectStringLines(cst as unknown as TreeNode);
    }

    for (let i = 0; i < lines.length; i++) {
      if (contentLines.has(i + 1)) continue;
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
 * Source-aware emitter used while CST ranges replace coordinate painting.
 * Clean nodes copy their original text. Dirty nodes emit in structural order,
 * so a stale coordinate can add whitespace but cannot overwrite later text.
 */
export function toTOMLCursor(cst: CST, format: TomlFormat): string {
  const roots = isIterable(cst)
    ? Array.from(cst as Iterable<TreeNode>)
    : [cst as unknown as TreeNode];
  const chunks: string[] = [];
  const copiedRanges: Array<{ source: string; start: number; end: number }> = [];
  const hostedComments: Comment[] = [];
  const consumedComments = new WeakSet<Comment>();
  let line = 1;
  let column = 0;

  const collectComments = (node: TreeNode): void => {
    if (node.type === NodeType.Comment) hostedComments.push(node as Comment);
    if (isKeyValue(node)) collectComments(node.value);
    else if (isInlineItem(node)) collectComments(node.item);
    else if (node.type === NodeType.Table || node.type === NodeType.TableArray) {
      for (const item of (node as Table | TableArray).items) collectComments(item);
    } else if (hasItems(node)) {
      for (const item of node.items as TreeNode[]) collectComments(item);
    }
  };
  for (const root of roots) collectComments(root);

  const indentation = (width: number): string =>
    (format.useTabsForIndentation ? '\t' : SPACE).repeat(width);

  const append = (text: string): void => {
    if (text.length === 0) return;
    chunks.push(text);
    const parts = text.split(/\r\n|\n/);
    if (parts.length === 1) {
      column += text.length;
    } else {
      line += parts.length - 1;
      column = parts[parts.length - 1].length;
    }
  };

  const advanceTo = (targetLine: number, targetColumn: number): void => {
    if (targetLine > line) {
      append(format.newLine.repeat(targetLine - line));
      if (targetColumn > 0) append(indentation(targetColumn));
    } else if (targetLine === line && targetColumn > column) {
      // At the start of a line the gap up to the node is leading indentation,
      // so it must follow the document's tab/spaces preference rather than
      // always padding with spaces (a tab-indented first line would otherwise
      // be re-emitted with a space).
      append(column === 0 ? indentation(targetColumn) : SPACE.repeat(targetColumn - column));
    } else if (chunks.length > 0 &&
        (targetLine < line || (targetLine === line && targetColumn < column))) {
      append(format.newLine);
      if (targetColumn > 0) append(indentation(targetColumn));
    }
  };

  const leafText = (node: TreeNode): string | undefined => {
    switch (node.type) {
      case NodeType.Key: return (node as Key).raw;
      case NodeType.String: return (node as StringNode).raw;
      case NodeType.Integer: return (node as Integer).raw;
      case NodeType.Float: return (node as Float).raw;
      case NodeType.Boolean: return (node as BooleanNode).value.toString();
      case NodeType.DateTime: return (node as DateTime).raw;
      case NodeType.Comment: return (node as Comment).raw;
      default: return undefined;
    }
  };

  const directChildren = (node: TreeNode): TreeNode[] => {
    if (isKeyValue(node)) return [node.key, node.value];
    if (isInlineItem(node)) return [node.item];
    if (hasItem(node)) return [node.item];
    if (node.type === NodeType.Table || node.type === NodeType.TableArray) {
      const table = node as Table | TableArray;
      return [table.key, ...table.items];
    }
    return hasItems(node) ? node.items as TreeNode[] : [];
  };

  const sourceSubtreeReusable = (node: TreeNode): boolean => {
    const pending = [node];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current.dirty) return false;
      const text = leafText(current);
      if (text !== undefined) {
        const source = getNodeSource(current);
        if (!source || !current.range || source.slice(current.range[0], current.range[1]) !== text) {
          return false;
        }
      } else if (!sourceStructureUnchanged(current)) {
        return false;
      }
      pending.push(...directChildren(current));
    }
    return true;
  };

  const canCopyWholeNode = (node: TreeNode): boolean =>
    node.type !== NodeType.Document &&
    node.type !== NodeType.InlineItem &&
    node.type !== NodeType.TableKey &&
    node.type !== NodeType.TableArrayKey &&
    (leafText(node) !== undefined || sourceStructureUnchanged(node));

  const appendRelativeGap = (
    from: { line: number; column: number },
    to: { line: number; column: number }
  ): void => {
    if (to.line > from.line) {
      append(format.newLine.repeat(to.line - from.line));
      if (to.column > 0) append(indentation(to.column));
    } else if (to.line === from.line && to.column > from.column) {
      append(SPACE.repeat(to.column - from.column));
    }
  };

  const sourceGap = (
    container: InlineArray | InlineTable,
    previous: InlineItem | undefined,
    current: InlineItem | undefined
  ): string | undefined => {
    const source = getNodeSource(container);
    if (!source || !container.range) return undefined;
    if (previous && getNodeSource(previous) !== source) return undefined;
    if (current && getNodeSource(current) !== source) return undefined;
    const start = previous?.range?.[1] ?? container.range[0] + 1;
    const end = current?.range?.[0] ?? container.range[1] - 1;
    if (start === undefined || end === undefined || end < start) return undefined;

    let gap = source.slice(start, end);
    if (previous?.comma && gap.startsWith(',')) gap = gap.slice(1);
    return /^[\t \r\n]*$/.test(gap) ? gap : undefined;
  };

  const commentBelongsTo = (comment: Comment, container: InlineArray | InlineTable): boolean => {
    const source = getNodeSource(container);
    return source !== undefined &&
      getNodeSource(comment) === source &&
      container.range !== undefined &&
      comment.range !== undefined &&
      comment.range[0] >= container.range[0] &&
      comment.range[1] <= container.range[1];
  };

  const emitInlineItems = (container: InlineArray | InlineTable): void => {
    let previous: InlineItem | undefined;
    for (const current of container.items as InlineItem[]) {
      let from = previous
        ? {
            line: previous.loc.end.line,
            column: previous.loc.end.column + (previous.comma ? 1 : 0)
          }
        : {
            line: container.loc.start.line,
            column: container.loc.start.column + 1
          };
      const commentsBefore = hostedComments
        .filter(comment => !consumedComments.has(comment) && commentBelongsTo(comment, container) &&
          comment.loc.start.line >= from.line &&
          comment.loc.end.line <= current.loc.start.line &&
          (comment.loc.start.line > from.line || comment.loc.start.column >= from.column) &&
          (comment.loc.end.line < current.loc.start.line || comment.loc.end.column <= current.loc.start.column) &&
          comment.loc.start.line >= container.loc.start.line &&
          comment.loc.end.line <= container.loc.end.line)
        .sort((left, right) =>
          left.loc.start.line - right.loc.start.line ||
          left.loc.start.column - right.loc.start.column);

      if (commentsBefore.length > 0) {
        for (const comment of commentsBefore) {
          appendRelativeGap(from, comment.loc.start);
          append(comment.raw);
          consumedComments.add(comment);
          from = comment.loc.end;
        }
        appendRelativeGap(from, current.loc.start);
      } else {
        const gap = sourceGap(container, previous, current);
        if (gap !== undefined) {
          append(gap);
        } else {
        const crossSource = getNodeSource(current) !== getNodeSource(container);
        if (previous && crossSource && current.loc.start.line === previous.loc.end.line) {
          const commaGap = getCommaSpace(container) ?? 2;
          const wantedSpaces = Math.max(0, commaGap - 1);
          if (wantedSpaces > 0) append(SPACE.repeat(wantedSpaces));
        } else {
          appendRelativeGap(from, current.loc.start);
        }
        }
      }
      emitNode(current, false);
      for (const comment of hostedComments) {
        if (consumedComments.has(comment)) continue;
        if (!commentBelongsTo(comment, container)) continue;
        if (comment.loc.start.line !== current.loc.end.line) continue;
        if (comment.loc.start.column < current.loc.end.column) continue;
        if (comment.loc.start.line < container.loc.start.line ||
            comment.loc.end.line > container.loc.end.line) continue;
        const separatorEnd = current.loc.end.column + (current.comma ? 1 : 0);
        if (comment.loc.start.column > separatorEnd) {
          append(SPACE.repeat(comment.loc.start.column - separatorEnd));
        }
        append(comment.raw);
        consumedComments.add(comment);
      }
      previous = current;
    }

    let trailingFrom = previous
      ? {
          line: previous.loc.end.line,
          column: previous.loc.end.column + (previous.comma ? 1 : 0)
        }
      : { line: container.loc.start.line, column: container.loc.start.column + 1 };
    const trailingComments = hostedComments
      .filter(comment => !consumedComments.has(comment) && commentBelongsTo(comment, container) &&
        comment.loc.start.line >= trailingFrom.line &&
        comment.loc.end.line <= container.loc.end.line)
      .sort((left, right) =>
        left.loc.start.line - right.loc.start.line ||
        left.loc.start.column - right.loc.start.column);
    if (trailingComments.length > 0) {
      for (const comment of trailingComments) {
        appendRelativeGap(trailingFrom, comment.loc.start);
        append(comment.raw);
        consumedComments.add(comment);
        trailingFrom = comment.loc.end;
      }
      appendRelativeGap(trailingFrom, {
        line: container.loc.end.line,
        column: container.loc.end.column - 1
      });
    } else {
      const trailingGap = sourceGap(container, previous, undefined);
      if (trailingGap !== undefined) append(trailingGap);
      else if (previous) appendRelativeGap(trailingFrom, {
        line: container.loc.end.line,
        column: container.loc.end.column - 1
      });
      else {
        const source = getNodeSource(container);
        if (source && container.range) {
          const original = source.slice(container.range[0], container.range[1]);
          const lastNewline = Math.max(original.lastIndexOf('\n'), original.lastIndexOf('\r'));
          // Only preserve the original multiline closing bracket while the
          // container still has items. Once emptied, the writer tightens it to
          // a single line, and the deleted first child must not re-add a line.
          if (lastNewline !== -1 && container.items.length > 0 && originalFirstChildStartedAfterOpener(container)) {
            const closingIndent = original.slice(lastNewline + 1, -1).match(/^[\t ]*/)?.[0] ?? '';
            append(format.newLine + closingIndent);
          }
        }
      }
    }
  };

  const emitNode = (node: TreeNode, place = true): void => {
    if (node.type === NodeType.Comment && consumedComments.has(node as Comment)) return;
    const source = getNodeSource(node);
    if (source !== undefined && node.range && copiedRanges.some(copied =>
      copied.source === source && copied.start <= node.range![0] && copied.end >= node.range![1]
    )) {
      return;
    }
    if (canCopyWholeNode(node) && sourceSubtreeReusable(node) && node.range && source !== undefined) {
      const slice = source.slice(node.range[0], node.range[1]);
      const expectedLeaf = leafText(node);
      if (expectedLeaf === undefined || expectedLeaf === slice) {
        if (place) advanceTo(node.loc.start.line, node.loc.start.column);
        append(slice);
        copiedRanges.push({ source, start: node.range[0], end: node.range[1] });
        return;
      }
    }

    switch (node.type) {
      case NodeType.Document:
        for (const item of (node as Document).items) emitNode(item);
        break;
      case NodeType.Table: {
        const table = node as Table;
        emitNode(table.key, place);
        for (const item of table.items) emitNode(item);
        break;
      }
      case NodeType.TableKey: {
        const tableKey = node as TableKey;
        if (place) advanceTo(tableKey.loc.start.line, tableKey.loc.start.column);
        append(`[${tableKey.item.raw}]`);
        break;
      }
      case NodeType.TableArray: {
        const tableArray = node as TableArray;
        emitNode(tableArray.key, place);
        for (const item of tableArray.items) emitNode(item);
        break;
      }
      case NodeType.TableArrayKey: {
        const tableArrayKey = node as TableArrayKey;
        if (place) advanceTo(tableArrayKey.loc.start.line, tableArrayKey.loc.start.column);
        append(`[[${tableArrayKey.item.raw}]]`);
        break;
      }
      case NodeType.KeyValue: {
        const keyValue = node as KeyValue;
        if (place) advanceTo(keyValue.loc.start.line, keyValue.loc.start.column);
        emitNode(keyValue.key, false);
        appendRelativeGap(keyValue.key.loc.end, {
          line: keyValue.loc.start.line,
          column: keyValue.equals
        });
        append('=');
        appendRelativeGap({ line: keyValue.loc.start.line, column: keyValue.equals + 1 }, keyValue.value.loc.start);
        emitNode(keyValue.value, false);
        break;
      }
      case NodeType.Key:
        if (place) advanceTo(node.loc.start.line, node.loc.start.column);
        append((node as Key).raw);
        break;
      case NodeType.String:
        if (place) advanceTo(node.loc.start.line, node.loc.start.column);
        append((node as StringNode).raw);
        break;
      case NodeType.Integer:
        if (place) advanceTo(node.loc.start.line, node.loc.start.column);
        append((node as Integer).raw);
        break;
      case NodeType.Float:
        if (place) advanceTo(node.loc.start.line, node.loc.start.column);
        append((node as Float).raw);
        break;
      case NodeType.Boolean:
        if (place) advanceTo(node.loc.start.line, node.loc.start.column);
        append((node as BooleanNode).value.toString());
        break;
      case NodeType.DateTime:
        if (place) advanceTo(node.loc.start.line, node.loc.start.column);
        append((node as DateTime).raw);
        break;
      case NodeType.InlineArray: {
        const array = node as InlineArray;
        if (place) advanceTo(array.loc.start.line, array.loc.start.column);
        append('[');
        emitInlineItems(array);
        append(']');
        break;
      }
      case NodeType.InlineTable: {
        const table = node as InlineTable;
        if (place) advanceTo(table.loc.start.line, table.loc.start.column);
        append('{');
        emitInlineItems(table);
        append('}');
        break;
      }
      case NodeType.InlineItem: {
        const item = node as InlineItem;
        emitNode(item.item, false);
        if (item.comma) {
          const source = getNodeSource(item);
          if (source && item.range && item.item.range && getNodeSource(item.item) === source) {
            const beforeComma = source.slice(item.item.range[1], item.range[1]);
            if (/^[\t ]*$/.test(beforeComma)) append(beforeComma);
          }
          append(',');
        }
        break;
      }
      case NodeType.Comment:
        if (place) advanceTo(node.loc.start.line, node.loc.start.column);
        append((node as Comment).raw);
        break;
      default:
        throw new Error(`toTOMLCursor: Unrecognized node type: ${String((node as any).type)}`);
    }
  };

  for (const root of roots) emitNode(root);

  const output = chunks.join('').replace(/\r\n|\n/g, format.newLine);
  return output + format.newLine.repeat(format.trailingNewline);
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
