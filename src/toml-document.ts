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
  #currentTomlString: string | null
  #newline: string;
  #trailingNewlineCount: number;

  /**
   * Initializes the TomlDocument with a TOML string, parsing it into an AST.
   * @param tomlString - The TOML string to parse
   */
  constructor(tomlString: string) {
    this.#currentTomlString = tomlString;
    this.#ast = parseTOML(tomlString);
    // Detect the line ending style and trailing newlines from the original file
    this.#newline = detectNewline(tomlString);
    this.#trailingNewlineCount = countTrailingNewlines(tomlString, this.#newline);
  }

  get toTomlString(): string {
    if (this.#currentTomlString === null) {
      this.#currentTomlString =  toTOML(this.#ast);
    }
    return this.#currentTomlString;
  }

  /**
   * Returns the JavaScript object representation of the TOML document.
   */
  get toJsObject(): any {
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
    // TODO : perform check that something was changed before reseting the currentTomlString
    this.#currentTomlString = null;
    return patchedToml;
  }
}
