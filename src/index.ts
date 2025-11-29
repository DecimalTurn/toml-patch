import parseTOML from './parse-toml';
import parseJS from './parse-js';
import toTOML from './to-toml';
import toJS from './to-js';
import { Format } from './format';

/**
 * Parses a TOML string into a JavaScript object.
 * The function converts TOML syntax to its JavaScript equivalent.
 * This proceeds in two steps: first, it parses the TOML string into an AST,
 * and then it converts the AST into a JavaScript object.
 * 
 * @param value - The TOML string to parse
 * @returns The parsed JavaScript object
 */
export function parse(value: string): any {
  return toJS(parseTOML(value), value);
}

/**
 * Converts a JavaScript object to a TOML string.
 * 
 * @param value - The JavaScript object to stringify
 * @param format - Optional formatting options for the resulting TOML
 * @returns The stringified TOML representation
 */
export function stringify(value: any, format?: Format): string {
  const document = parseJS(value, format);
  const fmt = format ?? new Format();
  return toTOML(document.items, fmt);
}

export { default as patch } from './patch';

/**
 * TomlDocument encapsulates a TOML AST and provides methods to interact with it.
 */
export { TomlDocument } from './toml-document';
