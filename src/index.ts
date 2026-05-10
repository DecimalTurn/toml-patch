import parseTOML from './parse-toml';
import parseJS from './parse-js';
import toTOML from './to-toml';
import toJS from './to-js';
import { TomlFormat, resolveTomlFormat } from './toml-format';
import type { ParseOptions } from './parse-options';
import { decodeUtf8Bytes, stripLeadingBom, UTF8_BOM } from './decode-utf8';

export type { IntegersAsBigInt, ParseOptions } from './parse-options';

/**
 * Parses a TOML string or raw UTF-8 bytes into a JavaScript object.
 *
 * When raw bytes (Uint8Array / Buffer) are provided, they are decoded with
 * the WHATWG TextDecoder in fatal mode, which rejects any invalid UTF-8
 * byte sequences before parsing begins. This matches the TOML spec requirement
 * that "A TOML file must be a valid UTF-8 encoded Unicode document."
 *
 * The string path has zero overhead — the bytes path incurs one TextDecoder
 * decode (which also produces the string needed for parsing).
 *
 * By default (`options.integersAsBigInt` unset or `'asNeeded'`), integers that
 * fit within the JavaScript safe-integer range are returned as `number`; integers
 * outside that range are returned as `bigint` to preserve precision. Set
 * `options.integersAsBigInt` to `true` to always return `bigint` for all integers,
 * or `false` to always return `number` (large integers will lose precision).
 *
 * Note: the `'asNeeded'` default is a behavioral change from prior versions (<=1.0.7). If
 * your code serializes the result to JSON or performs arithmetic mixing `number`
 * and `bigint`, set `integersAsBigInt: false` to restore the previous behavior.
 *
 * @param value - TOML source as a string or raw UTF-8 bytes
 * @param options - Optional parse options
 * @param options.integersAsBigInt - Controls `bigint` vs `number` for integers.
 *   `'asNeeded'` (default) | `true` | `false`
 * @returns The parsed JavaScript object
 */
export function parse(value: string | Uint8Array, options?: ParseOptions): any {
  const rawString = typeof value === 'string'
    ? value
    : decodeUtf8Bytes(value);
  const tomlString = stripLeadingBom(rawString);
  return toJS(parseTOML(tomlString), tomlString, options?.integersAsBigInt ?? 'asNeeded');
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
  const tomlString = toTOML(document.items, fmt);
  return fmt.leadingBom ? `${UTF8_BOM}${tomlString}` : tomlString;
}

export { default as patch } from './patch';
export { LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from './parse-toml';

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
