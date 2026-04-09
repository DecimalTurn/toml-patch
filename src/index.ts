import parseTOML from './parse-toml';
import parseJS from './parse-js';
import toTOML from './to-toml';
import toJS from './to-js';
import { TomlFormat, resolveTomlFormat } from './toml-format';
import { validateUtf8 } from './validate-utf8';

/**
 * Parses a TOML string or raw UTF-8 bytes into a JavaScript object.
 *
 * When raw bytes (Uint8Array / Buffer) are provided, a single-pass UTF-8
 * validation is performed before decoding, so invalid byte sequences such
 * as truncated multi-byte characters or surrogate code points are rejected
 * with a clear error instead of being silently replaced.
 *
 * The function converts TOML syntax to its JavaScript equivalent in two
 * steps: parse the TOML into an AST, then convert the AST to JS.
 *
 * @param value - TOML source as a string or raw UTF-8 bytes
 * @returns The parsed JavaScript object
 */
export function parse(value: string | Uint8Array): any {
  let str: string;
  if (typeof value === 'string') {
    str = value;
  } else {
    validateUtf8(value);
    str = new TextDecoder().decode(value);
  }
  return toJS(parseTOML(str), str);
}

/**
 * Converts a JavaScript object to a TOML string.
 * 
 * @param value - The JavaScript object to stringify
 * @param format - Optional formatting options for the resulting TOML
 * @returns The stringified TOML representation
 */
export function stringify(value: any, format?: Partial<TomlFormat> | TomlFormat): string {
  const fmt = resolveTomlFormat(format, TomlFormat.default());
  
  const document = parseJS(value, fmt);
  return toTOML(document.items, fmt);
}

export { default as patch } from './patch';

/**
 * TomlFormat class for configuring TOML formatting options.
 * 
 * This class allows you to customize how TOML documents are formatted when using
 * the stringify() and patch() functions. It provides control over line endings,
 * spacing, trailing commas, and other formatting preferences.
 * 
 * @example
 * ```typescript
 * import { patch, TomlFormat } from '@decimalturn/toml-patch';
 * 
 * // Create a custom format configuration
 * const format = TomlFormat.default();
 * format.newLine = '\r\n';        // Windows line endings
 * format.trailingNewline = 0;     // No trailing newline
 * format.trailingComma = true;    // Add trailing commas
 * format.bracketSpacing = false;  // No spaces in brackets
 * 
 * // Apply the patch with custom formatting
 * const result = patch(existingToml, updatedData, format);
 * ```
 */
export { TomlFormat } from './toml-format';

/**
 * TomlDocument encapsulates a TOML AST and provides methods to interact with it.
 */
export { TomlDocument } from './toml-document';
