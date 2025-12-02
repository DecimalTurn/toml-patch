import {
  KeyValue,
  Table,
  InlineTable,
  TableArray,
  InlineArray,
  isInlineTable,
  isInlineArray,
  isKeyValue,
  Document,
  TreeNode
} from './ast';
import { generateTable, generateDocument, generateTableArray } from './generate';
import { insert, remove, applyWrites, shiftNode } from './writer';
import parseTOML from './parse-toml';

// Default formatting values
export const DEFAULT_NEWLINE = '\n';
export const DEFAULT_TRAILING_NEWLINE = 1;
export const DEFAULT_TRAILING_COMMA = false;
export const DEFAULT_BRACKET_SPACING = true;
export const DEFAULT_PREFER_MULTILINE_TABLE = true;

// Detects if trailing commas are used in the existing TOML by examining the AST
// Returns true if trailing commas are used, false if not or comma-separated structures found (ie. default to false)
export function detectTrailingComma(ast: Iterable<any>): boolean {
  // Convert iterable to array and look for the first inline array or inline table to determine trailing comma preference
  const items = Array.from(ast);
  for (const item of items) {
    const result = findTrailingCommaInNode(item);
    if (result !== null) {
      return result;
    }
  }
  // Return default if no comma-separated structures are found
  return DEFAULT_TRAILING_COMMA;
}

// Detects if bracket spacing is used in inline arrays and tables by examining the raw string
// Returns true if bracket spacing is found, false if not or no bracket structures found (default to true)
export function detectBracketSpacing(tomlString: string, ast: Iterable<any>): boolean {
  // Convert iterable to array and look for inline arrays and tables
  const items = Array.from(ast);
  for (const item of items) {
    const result = findBracketSpacingInNode(item, tomlString);
    if (result !== null) {
      return result;
    }
  }
  // Return default if no bracket structures are found
  return DEFAULT_BRACKET_SPACING;
}

// Helper function to recursively search for bracket spacing in a node
function findBracketSpacingInNode(node: any, tomlString: string): boolean | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  // Check if this is an InlineArray or InlineTable
  if ((node.type === 'InlineArray' || node.type === 'InlineTable') && node.loc) {
    const bracketSpacing = checkBracketSpacingInLocation(node.loc, tomlString);
    if (bracketSpacing !== null) {
      return bracketSpacing;
    }
  }

  // Recursively check nested structures
  if (node.items && Array.isArray(node.items)) {
    for (const child of node.items) {
      const result = findBracketSpacingInNode(child, tomlString);
      if (result !== null) {
        return result;
      }
      // Also check nested item if it exists
      if (child.item) {
        const nestedResult = findBracketSpacingInNode(child.item, tomlString);
        if (nestedResult !== null) {
          return nestedResult;
        }
      }
    }
  }

  // Check other properties that might contain nodes
  for (const prop of ['value', 'key', 'item']) {
    if (node[prop]) {
      const result = findBracketSpacingInNode(node[prop], tomlString);
      if (result !== null) {
        return result;
      }
    }
  }

  return null;
}

// Helper function to check bracket spacing in a specific location
function checkBracketSpacingInLocation(loc: any, tomlString: string): boolean | null {
  if (!loc || !loc.start || !loc.end) {
    return null;
  }

  // Extract the raw text for this location
  const lines = tomlString.split(/\r?\n/);
  const startLine = loc.start.line - 1; // Convert to 0-based
  const endLine = loc.end.line - 1;
  const startCol = loc.start.column;
  const endCol = loc.end.column;

  let rawText = '';
  if (startLine === endLine) {
    rawText = lines[startLine]?.substring(startCol, endCol + 1) || '';
  } else {
    // Multi-line case
    if (lines[startLine]) {
      rawText += lines[startLine].substring(startCol);
    }
    for (let i = startLine + 1; i < endLine; i++) {
      rawText += '\n' + (lines[i] || '');
    }
    if (lines[endLine]) {
      rawText += '\n' + lines[endLine].substring(0, endCol + 1);
    }
  }

  // Check for bracket spacing patterns
  // For arrays: [ elements ] vs [elements]
  // For tables: { elements } vs {elements}
  const arrayMatch = rawText.match(/^\[(\s*)/);
  const tableMatch = rawText.match(/^\{(\s*)/);
  
  if (arrayMatch) {
    // Check if there's a space after the opening bracket
    return arrayMatch[1].length > 0;
  }
  
  if (tableMatch) {
    // Check if there's a space after the opening brace
    return tableMatch[1].length > 0;
  }

  return null;
}

// Helper function to recursively search for comma usage in a node
function findTrailingCommaInNode(node: any): boolean | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  // Check if this is an InlineArray
  if (node.type === 'InlineArray' && node.items && Array.isArray(node.items)) {
    return checkTrailingCommaInItems(node.items);
  }

  // Check if this is an InlineTable
  if (node.type === 'InlineTable' && node.items && Array.isArray(node.items)) {
    return checkTrailingCommaInItems(node.items);
  }

  // Check if this is a KeyValue with a value that might contain arrays/tables
  if (node.type === 'KeyValue' && node.value) {
    return findTrailingCommaInNode(node.value);
  }

  // For other node types, recursively check any items array
  if (node.items && Array.isArray(node.items)) {
    for (const item of node.items) {
      const result = findTrailingCommaInNode(item);
      if (result !== null) {
        return result;
      }
    }
  }

  return null;
}

// Check trailing comma usage in an array of inline items
function checkTrailingCommaInItems(items: any[]): boolean | null {
  if (items.length === 0) {
    return null;
  }

  // Check the last item to see if it has a trailing comma
  const lastItem = items[items.length - 1];
  if (lastItem && typeof lastItem === 'object' && 'comma' in lastItem) {
    return lastItem.comma === true;
  }

  return false;
}

// Helper function to detect if an InlineArray originally had trailing commas
export function arrayHadTrailingCommas(node: TreeNode): boolean {
  if (!isInlineArray(node)) return false;
  if (node.items.length === 0) return false;
  // Check if the last item has a trailing comma
  const lastItem = node.items[node.items.length - 1];
  return lastItem.comma === true;
}

// Helper function to detect if an InlineTable originally had trailing commas
export function tableHadTrailingCommas(node: TreeNode): boolean {
  if (!isInlineTable(node)) return false;
  if (node.items.length === 0) return false;
  // Check if the last item has a trailing comma
  const lastItem = node.items[node.items.length - 1];
  return lastItem.comma === true;
}

// Returns the detected newline (\n or \r\n) from a string, defaulting to \n
export function detectNewline(str: string): string {
  const lfIndex = str.indexOf('\n');
  if (lfIndex > 0 && str.substring(lfIndex - 1, lfIndex) === '\r') {
    return '\r\n';
  }
  return '\n';
}

// Counts consecutive trailing newlines at the end of a string
export function countTrailingNewlines(str: string, newlineChar: string): number {
  let count = 0;
  let pos = str.length;
  while (pos >= newlineChar.length) {
    if (str.substring(pos - newlineChar.length, pos) === newlineChar) {
      count++;
      pos -= newlineChar.length;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Validates a format object and warns about unsupported properties.
 * Throws errors for supported properties with invalid types.
 * @param format - The format object to validate
 * @returns The validated format object with only supported properties and correct types
 */
export function validateFormatObject(format: any): any {
  if (!format || typeof format !== 'object') {
    return {};
  }

  const supportedProperties = new Set(['newLine', 'trailingNewline', 'trailingComma', 'bracketSpacing', 'preferMultilineTable']);
  const validatedFormat: any = {};
  const unsupportedProperties: string[] = [];
  const invalidTypeProperties: string[] = [];

  // Check all enumerable properties of the format object
  for (const key in format) {
    if (Object.prototype.hasOwnProperty.call(format, key)) {
      if (supportedProperties.has(key)) {
        const value = format[key];
        
        // Type validation for each property
        switch (key) {
          case 'newLine':
            if (typeof value === 'string') {
              validatedFormat.newLine = value;
            } else {
              invalidTypeProperties.push(`${key} (expected string, got ${typeof value})`);
            }
            break;
          
          case 'trailingNewline':
            if (typeof value === 'boolean' || typeof value === 'number') {
              validatedFormat.trailingNewline = value;
            } else {
              invalidTypeProperties.push(`${key} (expected boolean or number, got ${typeof value})`);
            }
            break;
          
          case 'trailingComma':
          case 'bracketSpacing':
          case 'preferMultilineTable':
            if (typeof value === 'boolean') {
              validatedFormat[key] = value;
            } else {
              invalidTypeProperties.push(`${key} (expected boolean, got ${typeof value})`);
            }
            break;
        }
      } else {
        unsupportedProperties.push(key);
      }
    }
  }

  // Warn about unsupported properties
  if (unsupportedProperties.length > 0) {
    console.warn(`toml-patch: Ignoring unsupported format properties: ${unsupportedProperties.join(', ')}. Supported properties are: ${Array.from(supportedProperties).join(', ')}`);
  }

  // Throw error for invalid types
  if (invalidTypeProperties.length > 0) {
    throw new TypeError(`Invalid types for format properties: ${invalidTypeProperties.join(', ')}`);
  }

  return validatedFormat;
}

/**
 * Resolves a format parameter to a TomlFormat instance.
 * Handles TomlFormat instances and partial TomlFormat objects as well as undefined.
 * 
 * @param format - The format parameter to resolve (TomlFormat instance, partial format object, or undefined)
 * @param fallbackFormat - The fallback TomlFormat to use when no format is provided
 * @returns A resolved TomlFormat instance
 */
export function resolveTomlFormat(format: Partial<TomlFormat> | TomlFormat | undefined, fallbackFormat: TomlFormat): TomlFormat {
  if (format) {
    // If format is provided, validate and merge it with fallback
    if (format instanceof TomlFormat) {
      return format;
    } else {
      // Validate the format object and warn about unsupported properties
      const validatedFormat = validateFormatObject(format);
      
      // Create a new TomlFormat instance with validated properties
      return new TomlFormat(
        validatedFormat.newLine ?? fallbackFormat.newLine,
        validatedFormat.trailingNewline ?? fallbackFormat.trailingNewline,
        validatedFormat.trailingComma ?? fallbackFormat.trailingComma,
        validatedFormat.bracketSpacing ?? fallbackFormat.bracketSpacing
      );
    }
  } else {
    // Use fallback format when no format is provided
    return fallbackFormat;
  }
}

export class TomlFormat {
  
  /**
   * The line ending character(s) to use in the output TOML.
   * This option affects only the stringification process, not the internal representation (AST).
   * 
   * @example
   * - '\n' for Unix/Linux line endings
   * - '\r\n' for Windows line endings
   */
  newLine: string;
  
  /**
   * The number of trailing newlines to add at the end of the TOML document.
   * This option affects only the stringification process, not the internal representation (AST).
   * 
   * @example
   * - 0: No trailing newline
   * - 1: One trailing newline (standard)
   * - 2: Two trailing newlines (adds extra spacing)
   */
  trailingNewline: number;
  
  /**
   * Whether to add trailing commas after the last element in arrays and inline tables.
   * 
   * @example
   * - true:  [1, 2, 3,] and { x = 1, y = 2, }
   * - false: [1, 2, 3] and { x = 1, y = 2 }
   */
  trailingComma: boolean;
  
  /**
   * Whether to add spaces after opening brackets/braces and before closing brackets/braces
   * in arrays and inline tables.
   * 
   * @example
   * - true:  [ 1, 2, 3 ] and { x = 1, y = 2 }
   * - false: [1, 2, 3] and {x = 1, y = 2}
   */
  bracketSpacing: boolean;

  /**
   * Whether to prefer multiline formatting for tables when stringifying.
   */
  preferMultilineTable?: boolean;

  /**
   * Whether to prefer multiline formatting for tables when stringifying.
   */
  preferMultilineTable?: boolean;

  // These options were part of the original TimHall's version and are not yet implemented
  //printWidth?: number;
  //tabWidth?: number;
  //useTabs?: boolean;
  
  constructor(newLine?: string, trailingNewline?: number, trailingComma?: boolean, bracketSpacing?: boolean, preferMultilineTable?: boolean) {
    // Use provided values or fall back to defaults
    this.newLine = newLine ?? DEFAULT_NEWLINE;
    this.trailingNewline = trailingNewline ?? DEFAULT_TRAILING_NEWLINE;
    this.trailingComma = trailingComma ?? DEFAULT_TRAILING_COMMA;
    this.bracketSpacing = bracketSpacing ?? DEFAULT_BRACKET_SPACING;
    this.preferMultilineTable = preferMultilineTable ?? DEFAULT_PREFER_MULTILINE_TABLE;
  }

  /**
   * Creates a new TomlFormat instance with default formatting preferences.
   * 
   * @returns A new TomlFormat instance with default values:
   *   - newLine: '\n'
   *   - trailingNewline: 1
   *   - trailingComma: false
   *   - bracketSpacing: true
   *   - preferMultilineTable: true
   */
  static default(): TomlFormat {
    return new TomlFormat(
      DEFAULT_NEWLINE,
      DEFAULT_TRAILING_NEWLINE,
      DEFAULT_TRAILING_COMMA,
      DEFAULT_BRACKET_SPACING,
      DEFAULT_PREFER_MULTILINE_TABLE
    );
  }

  /**
   * Auto-detects formatting preferences from an existing TOML string.
   * 
   * This method analyzes the provided TOML string to determine formatting
   * preferences such as line endings, trailing newlines, and comma usage.
   * 
   * @param tomlString - The TOML string to analyze for formatting patterns
   * @returns A new TomlFormat instance with detected formatting preferences
   * 
   * @example
   * ```typescript
   * const toml = 'array = ["a", "b", "c",]\ntable = { x = 1, y = 2, }';
   * const format = TomlFormat.autoDetectFormat(toml);
   * // format.trailingComma will be true
   * // format.newLine will be '\n'
   * // format.trailingNewline will be 0 (no trailing newline)
   * ```
   */
  static autoDetectFormat(tomlString: string): TomlFormat {
    const format = TomlFormat.default();
    
    // Detect line ending style
    format.newLine = detectNewline(tomlString);
    
    // Detect trailing newline count
    format.trailingNewline = countTrailingNewlines(tomlString, format.newLine);
    
    // Parse the TOML to detect comma and bracket spacing usage patterns
    try {
      const ast = parseTOML(tomlString);
      // Convert to array once to avoid consuming the iterator multiple times
      const astArray = Array.from(ast);
      format.trailingComma = detectTrailingComma(astArray);
      format.bracketSpacing = detectBracketSpacing(tomlString, astArray);
    } catch (error) {
      // If parsing fails, fall back to defaults
      // This ensures the method is robust against malformed TOML
      format.trailingComma = DEFAULT_TRAILING_COMMA;
      format.bracketSpacing = DEFAULT_BRACKET_SPACING;
    }
    
    // preferMultilineTable uses default value since auto-detection would require
    // complex analysis of table formatting preferences
    format.preferMultilineTable = DEFAULT_PREFER_MULTILINE_TABLE;
    
    return format;
  }
}
export function formatTopLevel(document: Document, format: TomlFormat): Document {
  // Only convert inline tables to multi-line tables if preferMultilineTable is true
  if (!format.preferMultilineTable) {
    return document;
  }

  const move_to_top_level = document.items.filter(item => {
    if (!isKeyValue(item)) return false;

    const is_inline_table = isInlineTable(item.value);
    const is_inline_array =
      isInlineArray(item.value) &&
      item.value.items.length &&
      isInlineTable(item.value.items[0].item);

    return is_inline_table || is_inline_array;
  }) as KeyValue[];

  move_to_top_level.forEach(node => {
    remove(document, document, node);

    if (isInlineTable(node.value)) {
      insert(document, document, formatTable(node));
    } else {
      formatTableArray(node).forEach(table_array => {
        insert(document, document, table_array);
      });
    }
  });

  applyWrites(document);
  return document;
}

function formatTable(key_value: KeyValue): Table {
  const table = generateTable(key_value.key.value);

  for (const item of (key_value.value as InlineTable).items) {
    insert(table, table, item.item);
  }

  applyWrites(table);
  return table;
}

function formatTableArray(key_value: KeyValue): TableArray[] {
  const root = generateDocument();

  for (const inline_array_item of (key_value.value as InlineArray).items) {
    const table_array = generateTableArray(key_value.key.value);
    insert(root, root, table_array);

    for (const inline_table_item of (inline_array_item.item as InlineTable).items) {
      insert(root, table_array, inline_table_item.item);
    }
  }

  applyWrites(root);
  return root.items as TableArray[];
}

export function formatPrintWidth(document: Document, format: TomlFormat): Document {
  // TODO
  return document;
}

export function formatEmptyLines(document: Document): Document {
  let shift = 0;
  let previous = 0;
  for (const item of document.items) {
    if (previous === 0 && item.loc.start.line > 1) {
      // Remove leading newlines
      shift = 1 - item.loc.start.line;
    } else if (item.loc.start.line + shift > previous + 2) {
      shift += previous + 2 - (item.loc.start.line + shift);
    }

    shiftNode(item, {
      lines: shift,
      columns: 0
    });
    previous = item.loc.end.line;
  }

  return document;
}