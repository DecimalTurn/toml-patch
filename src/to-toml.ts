import { NodeType, AST } from './ast';
import traverse from './traverse';
import { Location } from './location';
import { SPACE } from './tokenizer';
import { TomlFormat } from './toml-format';

const BY_NEW_LINE = /(\r\n|\n)/g;

/**
 * Converts an Abstract Syntax Tree (AST) back to TOML format string.
 * 
 * This function traverses the AST and reconstructs the original TOML document
 * by writing each node's raw content to the appropriate location coordinates.
 * It preserves the original formatting, spacing, and structure of the TOML file.
 * 
 * @param ast - The Abstract Syntax Tree representing the parsed TOML document
 * @param format - The formatting options to use for the output
 * @returns The reconstructed TOML document as a string
 * 
 * @example
 * ```typescript
 * const tomlString = toTOML(ast, TomlFormat.default());
 * ```
 */
export default function toTOML(ast: AST, format: TomlFormat): string {

  const lines: string[] = [];
  const paddingChar = format.useTabsForIndentation ? '\t' : SPACE;

  traverse(ast, {
    [NodeType.TableKey](node) {
      const { start, end } = node.loc;

      write(lines, { start, end: { line: start.line, column: start.column + 1 } }, '[', paddingChar);
      write(lines, { start: { line: end.line, column: end.column - 1 }, end }, ']', paddingChar);
    },
    [NodeType.TableArrayKey](node) {
      const { start, end } = node.loc;

      write(lines, { start, end: { line: start.line, column: start.column + 2 } }, '[[', paddingChar);
      write(lines, { start: { line: end.line, column: end.column - 2 }, end }, ']]', paddingChar);
    },

    [NodeType.KeyValue](node) {
      const {
        start: { line }
      } = node.loc;
      write(
        lines,
        { start: { line, column: node.equals }, end: { line, column: node.equals + 1 } },
        '=',
        paddingChar
      );
    },
    [NodeType.Key](node) {
      write(lines, node.loc, node.raw, paddingChar);
    },

    [NodeType.String](node) {
      write(lines, node.loc, node.raw, paddingChar);
    },
    [NodeType.Integer](node) {
      write(lines, node.loc, node.raw, paddingChar);
    },
    [NodeType.Float](node) {
      write(lines, node.loc, node.raw, paddingChar);
    },
    [NodeType.Boolean](node) {
      write(lines, node.loc, node.value.toString(), paddingChar);
    },
    [NodeType.DateTime](node) {
      write(lines, node.loc, node.raw, paddingChar);
    },

    [NodeType.InlineArray](node) {
      const { start, end } = node.loc;
      write(lines, { start, end: { line: start.line, column: start.column + 1 } }, '[', paddingChar);
      write(lines, { start: { line: end.line, column: end.column - 1 }, end }, ']', paddingChar);
    },

    [NodeType.InlineTable](node) {
      const { start, end } = node.loc;
      write(lines, { start, end: { line: start.line, column: start.column + 1 } }, '{', paddingChar);
      write(lines, { start: { line: end.line, column: end.column - 1 }, end }, '}', paddingChar);
    },
    [NodeType.InlineItem](node) {
      if (!node.comma) return;

      const start = node.loc.end;
      write(lines, { start, end: { line: start.line, column: start.column + 1 } }, ',', paddingChar);
    },

    [NodeType.Comment](node) {
      write(lines, node.loc, node.raw, paddingChar);
    }
  });

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
 * @param paddingChar - The character to use for padding (space or tab)
 * 
 * @throws {Error} When there's a mismatch between location span and raw string line count
 * @throws {Error} When attempting to write to an uninitialized line
 * 
 * @example
 * ```typescript
 * const lines = ['', ''];
 * const location = { start: { line: 1, column: 0 }, end: { line: 1, column: 3 } };
 * write(lines, location, 'key', ' ');
 * // Result: lines[0] becomes 'key'
 * ```
 */
function write(lines: string[], loc: Location, raw: string, paddingChar: string = SPACE) {
  const raw_lines = raw.split(BY_NEW_LINE).filter(line => line !== '\n' && line !== '\r\n');
  const expected_lines = loc.end.line - loc.start.line + 1;

  if (raw_lines.length !== expected_lines) {
    throw new Error(
      `Mismatch between location and raw string, expected ${expected_lines} lines for "${raw}"`
    );
  }

  for (let i = loc.start.line; i <= loc.end.line; i++) {
    const line = getLine(lines, i);

    //Throw if line is uninitialized
    if (line === undefined) {
      throw new Error(
        `Line ${i} is uninitialized when writing "${raw}" at ${loc.start.line}:${loc.start.column} to ${loc.end.line}:${loc.end.column}`
      );
    }

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
