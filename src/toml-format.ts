import { hasLeadingBom, stripLeadingBom } from './decode-utf8';
import parseTOML from './parse-toml';

// Default formatting values
export const DEFAULT_NEWLINE = '\n';
export const DEFAULT_TRAILING_NEWLINE = 1;
export const DEFAULT_TRAILING_COMMA = false;
export const DEFAULT_BRACKET_SPACING = true;
export const DEFAULT_INLINE_TABLE_START = 1;
export const DEFAULT_TRUNCATE_ZERO_TIME_IN_DATES = false;
export const DEFAULT_USE_TABS_FOR_INDENTATION = false;
export const DEFAULT_MINIMUM_DECIMALS = 0;
export const DEFAULT_LEADING_BOM = false;

// Detects if trailing commas are used in the existing TOML by examining the AST
// Returns true if trailing commas are used, false if not or comma-separated structures found (ie. default to false)
export function detectTrailingComma(ast: Iterable<any>): boolean {
  // Look for the first inline array or inline table to determine trailing comma preference
  for (const item of ast) {
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
  // Look for inline arrays and tables
  for (const item of ast) {
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

// Returns the detected newline (\n or \r\n) from a string, defaulting to \n.
// First occurrence wins: if \r\n appears anywhere before a bare \n, the document
// is considered CRLF even if later lines (or string values) use bare LF.
export function detectNewline(str: string): string {
  const lfIndex = str.indexOf('\n');
  if (lfIndex > 0 && str[lfIndex - 1] === '\r') {
    return '\r\n';
  }
  return '\n';
}

// Counts consecutive trailing newlines at the end of a string.
// Counts each \n (whether bare or as part of \r\n) as one newline unit,
// so mixed trailing line endings (e.g. a CRLF document with a bare \n at EOF)
// are still counted correctly.
export function countTrailingNewlines(str: string): number {
  let count = 0;
  let pos = str.length;
  while (pos > 0 && str[pos - 1] === '\n') {
    count++;
    pos--;
    if (pos > 0 && str[pos - 1] === '\r') {
      pos--; // consume the \r as part of CRLF
    }
  }
  return count;
}

// Detects if tabs are used for indentation by checking the first few indented lines
export function detectTabsForIndentation(str: string): boolean {
  const lines = str.split(/\r?\n/);
  let tabCount = 0;
  let spaceCount = 0;
  
  for (const line of lines) {
    // Skip empty lines
    if (line.length === 0) continue;
    
    // Check the first character of non-empty lines
    if (line[0] === '\t') {
      tabCount++;
    } else if (line[0] === ' ') {
      spaceCount++;
    }
    
    // If we've seen enough evidence, make a decision
    if (tabCount + spaceCount >= 5) {
      break;
    }
  }
  
  // Prefer tabs if we see more tabs than spaces
  return tabCount > spaceCount;
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

  // Schema-driven validation: each key maps to a validator returning an error string or null
  const isBool = (v: any): string | null =>
    typeof v === 'boolean' ? null : `expected boolean, got ${typeof v}`;
  const schema: Record<string, (v: any) => string | null> = {
    newLine: v => typeof v === 'string' ? null : `expected string, got ${typeof v}`,
    trailingNewline: v => typeof v === 'boolean' || typeof v === 'number' ? null : `expected boolean or number, got ${typeof v}`,
    trailingComma: isBool,
    bracketSpacing: isBool,
    leadingBom: isBool,
    inlineTableStart: v => v == null || (typeof v === 'number' && Number.isInteger(v) && v >= 0)
      ? null : `expected non-negative integer or undefined, got ${typeof v}`,
    truncateZeroTimeInDates: isBool,
    useTabsForIndentation: isBool,
    minimumDecimals: v => v == null || (typeof v === 'number' && Number.isInteger(v) && v >= 0)
      ? null : `expected non-negative integer or undefined, got ${typeof v}`,
  };

  const validatedFormat: any = {};
  const unsupported: string[] = [];
  const invalid: string[] = [];

  for (const key in format) {
    const validator = Object.prototype.hasOwnProperty.call(schema, key) ? schema[key] : undefined;
    if (validator) {
      const value = format[key];
      const error = validator(value);
      if (error) {
        invalid.push(`${key} (${error})`);
      } else {
        validatedFormat[key] = value;
      }
    } else if (Object.prototype.hasOwnProperty.call(format, key)) {
      unsupported.push(key);
    }
  }

  if (unsupported.length > 0) {
    console.warn(`toml-patch: Ignoring unsupported format properties: ${unsupported.join(', ')}. Supported properties are: ${Object.keys(schema).join(', ')}`);
  }
  if (invalid.length > 0) {
    throw new TypeError(`Invalid types for format properties: ${invalid.join(', ')}`);
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
        validatedFormat.bracketSpacing ?? fallbackFormat.bracketSpacing,
        validatedFormat.inlineTableStart !== undefined ? validatedFormat.inlineTableStart : fallbackFormat.inlineTableStart,
        validatedFormat.truncateZeroTimeInDates ?? fallbackFormat.truncateZeroTimeInDates,
        validatedFormat.useTabsForIndentation ?? fallbackFormat.useTabsForIndentation,
        validatedFormat.minimumDecimals ?? fallbackFormat.minimumDecimals,
        validatedFormat.leadingBom ?? fallbackFormat.leadingBom,
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
   * Whether the output should include a leading UTF-8 BOM marker (U+FEFF).
   *
   * This is auto-detected from the source TOML and preserved during patching.
   */
  leadingBom: boolean;

  /**
   * The nesting depth at which new tables should start being formatted as inline tables.
   * When adding new tables during patching or stringifying objects:
   * - Tables at depth >= inlineTableStart will be formatted as inline tables
   * - Tables at depth < inlineTableStart will be formatted as separate table sections
   * 
   * @example
   * - 0: All tables are inline tables including top-level tables (root level)
   * - 1: Top-level tables as sections, nested tables as inline (default)
   * - 2: Two levels as sections, deeper nesting as inline
   */
  inlineTableStart?: number;

  /**
   * Whether to truncate time components in UTC date fields when they are zero.
   * This setting affects only the stringification process.
   * 
   * @example  
   * - true:  Date('2024-01-15T00:00:00.000Z') serializes as 2024-01-15
   * - false: Date('2024-01-15T00:00:00.000Z') serializes as 2024-01-15T00:00:00.000Z
   * 
   */
  truncateZeroTimeInDates?: boolean;

  /**
   * Whether to use tabs instead of spaces for indentation/padding.
   * When enabled, lines that need to be indented will use tabs.
   * 
   * @example  
   * - true:  Uses tabs for indentation
   * - false: Uses spaces for indentation (default)
   * 
   */
  useTabsForIndentation?: boolean;

  /**
   * The minimum number of decimal places to use when serializing JS numbers as TOML floats.
   * When greater than 0, plain JS integer values are serialized as TOML floats padded with
   * zeros to reach the specified decimal count. BigInt values are always serialized as integers
   * regardless of this setting.
   *
   * @example
   * - 0: stringify({ x: 1, y: 1.5 })  →  x = 1 / y = 1.5   (default)
   * - 1: stringify({ x: 1, y: 1.5 })  →  x = 1.0 / y = 1.5
   * - 2: stringify({ x: 1, y: 1.5 })  →  x = 1.00 / y = 1.50
   */
  minimumDecimals?: number;

  // These options were part of the original TimHall's version and are not yet implemented
  //printWidth?: number;
  //tabWidth?: number;

  constructor(
    newLine?: string,
    trailingNewline?: number,
    trailingComma?: boolean,
    bracketSpacing?: boolean,
    inlineTableStart?: number,
    truncateZeroTimeInDates?: boolean,
    useTabsForIndentation?: boolean,
    minimumDecimals?: number,
    leadingBom?: boolean
  ) {
    // Use provided values or fall back to defaults
    this.newLine = newLine ?? DEFAULT_NEWLINE;
    this.trailingNewline = trailingNewline ?? DEFAULT_TRAILING_NEWLINE;
    this.trailingComma = trailingComma ?? DEFAULT_TRAILING_COMMA;
    this.bracketSpacing = bracketSpacing ?? DEFAULT_BRACKET_SPACING;
    this.inlineTableStart = inlineTableStart ?? DEFAULT_INLINE_TABLE_START;
    this.truncateZeroTimeInDates = truncateZeroTimeInDates ?? DEFAULT_TRUNCATE_ZERO_TIME_IN_DATES;
    this.useTabsForIndentation = useTabsForIndentation ?? DEFAULT_USE_TABS_FOR_INDENTATION;
    this.minimumDecimals = minimumDecimals ?? DEFAULT_MINIMUM_DECIMALS;
    this.leadingBom = leadingBom ?? DEFAULT_LEADING_BOM;
  }

  /**
   * Creates a new TomlFormat instance with default formatting preferences.
   * 
   * @returns A new TomlFormat instance with default values:
   *   - newLine: '\n'
   *   - trailingNewline: 1
   *   - trailingComma: false
   *   - bracketSpacing: true
   *   - leadingBom: false
   *   - inlineTableStart: 1
   *   - truncateZeroTimeInDates: false
   *   - useTabsForIndentation: false
   *   - minimumDecimals: 0
   */
  static default(): TomlFormat {
    return new TomlFormat(
      DEFAULT_NEWLINE,
      DEFAULT_TRAILING_NEWLINE,
      DEFAULT_TRAILING_COMMA,
      DEFAULT_BRACKET_SPACING,
      DEFAULT_INLINE_TABLE_START,
      DEFAULT_TRUNCATE_ZERO_TIME_IN_DATES,
      DEFAULT_USE_TABS_FOR_INDENTATION,
      DEFAULT_MINIMUM_DECIMALS,
      DEFAULT_LEADING_BOM
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
    return TomlFormat.autoDetectFormatWithAst(tomlString);
  }

  /**
   * Internal method: Auto-detects formatting preferences from a TOML string with optional pre-parsed AST.
   * 
   * This is used internally to avoid redundant parsing when the AST is already available.
   * External callers should use `autoDetectFormat(tomlString)` instead.
   * 
   * @internal
   * @param tomlString - The TOML string to analyze for formatting patterns
   * @param syntaxTree - Optional pre-parsed AST to avoid redundant parsing
   * @returns A new TomlFormat instance with detected formatting preferences
   */
  static autoDetectFormatWithAst(tomlString: string, syntaxTree?: Iterable<any>): TomlFormat {
    const format = TomlFormat.default();
    format.leadingBom = hasLeadingBom(tomlString);
    // Strip the BOM before other formatting detection to avoid interference.
    const tomlContent = stripLeadingBom(tomlString);
    
    // Detect line ending style
    format.newLine = detectNewline(tomlContent);
    
    // Detect trailing newline count
    format.trailingNewline = countTrailingNewlines(tomlContent);
    
    // Get TOML syntax tree to detect comma and bracket spacing usage patterns
    try {
      // Materialize only when needed so we can traverse the same AST twice.
      const astNodes = Array.isArray(syntaxTree)
        ? syntaxTree
        : Array.from(syntaxTree ?? parseTOML(tomlContent));
      format.trailingComma = detectTrailingComma(astNodes);
      format.bracketSpacing = detectBracketSpacing(tomlContent, astNodes);
    } catch (error) {
      // If parsing fails, fall back to defaults
      // This ensures the method is robust against malformed TOML
      format.trailingComma = DEFAULT_TRAILING_COMMA;
      format.bracketSpacing = DEFAULT_BRACKET_SPACING;
    }
    
    // Detect if tabs are used for indentation
    format.useTabsForIndentation = detectTabsForIndentation(tomlContent);
    
    // inlineTableStart uses default value since auto-detection would require
    // complex analysis of nested table formatting preferences
    format.inlineTableStart = DEFAULT_INLINE_TABLE_START;

    // truncateZeroTimeInDates uses default value as well
    // We could always implement detection logic if needed
    // That would imply checking if all dates have no time component in the TOML.
    // However, it's not because all dates have no time component that a new key-value can't be introduced where the time component corresponds to midnight.
    format.truncateZeroTimeInDates = DEFAULT_TRUNCATE_ZERO_TIME_IN_DATES;

    // minimumDecimals uses default value (0) — caller must set explicitly
    format.minimumDecimals = DEFAULT_MINIMUM_DECIMALS;
    
    return format;
  }
}
