import parseTOML from './parse-toml';
import toTOML from './to-toml';
import toJS from './to-js';
import { Format } from './format';
import { AST } from './ast';
import { patchAst } from './patch';
import { detectNewline, countTrailingNewlines } from './utils';

/**
 * TomlDocument encapsulates a TOML AST and provides methods to interact with it.
 */
export class TomlDocument {
  #ast: AST;
  #originalToml: string;
  #newline: string;
  #trailingNewlineCount: number;

  /**
   * Initializes the TomlDocument with a TOML string, parsing it into an AST.
   * @param tomlString - The TOML string to parse
   */
  constructor(tomlString: string) {
    this.#originalToml = tomlString;
    this.#ast = parseTOML(tomlString);
    // Detect the line ending style and trailing newlines from the original file
    this.#newline = detectNewline(tomlString);
    this.#trailingNewlineCount = countTrailingNewlines(tomlString, this.#newline);
  }

  /**
   * Returns the original TOML string (read-only).
   */
  get originalToml(): string {
    return this.#originalToml;
  }

  /**
   * Returns the JavaScript object representation of the TOML document.
   */
  get JsObject(): any {
    return toJS(this.#ast);
  }

  /**
   * Applies a patch to the current AST using a modified JS object.
   * Updates the internal AST and returns the new TOML string.
   * @param updatedObject - The modified JS object to patch with
   * @param format - Optional formatting options
   * @returns The patched TOML string
   */
  patch(updatedObject: any, format?: Format | undefined): string {
    const patchedToml = patchAst(
      this.#ast,
      updatedObject,
      format,
      this.#newline,
      this.#trailingNewlineCount
    );
    this.#ast = parseTOML(patchedToml);
    return patchedToml;
  }
}
