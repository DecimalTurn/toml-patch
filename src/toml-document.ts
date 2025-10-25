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
   * Updates the internal AST. Use toTomlString getter to retrieve the updated TOML string.
   * @param updatedObject - The modified JS object to patch with
   * @param format - Optional formatting options
   */
  patch(updatedObject: any, format?: Format | undefined): void {
    const { tomlString, document } = patchAst(
      this.#ast,
      updatedObject,
      format,
      this.#newline,
      this.#trailingNewlineCount
    );
    this.#ast = document.items;
    this.#currentTomlString = tomlString;
  }

  /**
   * Updates the internal AST by supplying a modified tomlString.
   * Use toJsObject getter to retrieve the updated JS object representation.
   * @param tomlString - The modified TOML string to update with
   */
  update(tomlString: string): void {
    if (tomlString === this.#currentTomlString) {
      return;
    }

    // Now, let's check where the first difference is
    const existingLines = this.#currentTomlString ? this.#currentTomlString.split(this.#newline) : [];
    const newLines = tomlString.split(this.#newline);
    let firstDiffIndex = 0;
    while (
      firstDiffIndex < existingLines.length &&
      firstDiffIndex < newLines.length &&
      existingLines[firstDiffIndex] === newLines[firstDiffIndex]
    ) {
      firstDiffIndex++;
    }

    // Based on the first difference, we can re-parse only the affected part
    // We will need to supply the location to the parser in a future enhancement
    this.#ast = parseTOML(tomlString);
    this.#currentTomlString = tomlString;

  }

}
