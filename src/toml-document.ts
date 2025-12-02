import parseTOML, { continueParsingTOML } from './parse-toml';
import toTOML from './to-toml';
import toJS from './to-js';
import { TomlFormat } from './toml-format';
import { AST, Block } from './ast';
import { patchAst } from './patch';
import { detectNewline, resolveTomlFormat } from './toml-format';
import { truncateAst } from './truncate';

/**
 * TomlDocument encapsulates a TOML AST and provides methods to interact with it.
 */
export class TomlDocument {
  #ast: Block[];
  #currentTomlString: string;
  #Format: TomlFormat;

  /**
   * Initializes the TomlDocument with a TOML string, parsing it into an AST.
   * @param tomlString - The TOML string to parse
   */
  constructor(tomlString: string) {
    this.#currentTomlString = tomlString;
    this.#ast = Array.from(parseTOML(tomlString));
    // Auto-detect formatting preferences from the original TOML string
    this.#Format = TomlFormat.autoDetectFormat(tomlString);
  }

  get toTomlString(): string {
    return this.#currentTomlString;
  }

  /**
   * Returns the JavaScript object representation of the TOML document.
   */
  get toJsObject(): any {
    return toJS(this.#ast);
  }

  /**
   * Returns the internal AST (for testing purposes).
   * @internal
   */
  get ast(): Block[] {
    return this.#ast;
  }

  /**
   * Applies a patch to the current AST using a modified JS object.
   * Updates the internal AST. Use toTomlString getter to retrieve the updated TOML string.
   * @param updatedObject - The modified JS object to patch with
   * @param format - Optional formatting options
   */
  patch(updatedObject: any, format?: Partial<TomlFormat> | TomlFormat) : void {

    const fmt = resolveTomlFormat(format, this.#Format);

    const { tomlString, document } = patchAst(
      this.#ast,
      updatedObject,
      fmt
    );
    this.#ast = document.items;
    this.#currentTomlString = tomlString;
  }

  /**
   * Updates the internal document by supplying a modified tomlString.
   * Use toJsObject getter to retrieve the updated JS object representation.
   * @param tomlString - The modified TOML string to update with
   */
  update(tomlString: string): void {
    if (tomlString === this.toTomlString) {
      return;
    }

    // Now, let's check where the first difference is
    const existingLines = this.toTomlString.split(this.#Format.newLine);
    const newLineChar = detectNewline(tomlString);
    const newTextLines = tomlString.split(newLineChar);
    let firstDiffLineIndex = 0;
    while (
      firstDiffLineIndex < existingLines.length &&
      firstDiffLineIndex < newTextLines.length &&
      existingLines[firstDiffLineIndex] === newTextLines[firstDiffLineIndex]
    ) {
      firstDiffLineIndex++;
    }

    // Calculate the 1-based line number and 0-based column where the first difference occurs
    
    let firstDiffColumn = 0;
    
    // If we're within the bounds of both arrays, find the column where they differ
    if (firstDiffLineIndex < existingLines.length && firstDiffLineIndex < newTextLines.length) {
      const existingLine = existingLines[firstDiffLineIndex];
      const newLine = newTextLines[firstDiffLineIndex];
      
      // Find the first character position where the lines differ
      for (let i = 0; i < Math.max(existingLine.length, newLine.length); i++) {
        if (existingLine[i] !== newLine[i]) {
          firstDiffColumn = i;
          break;
        }
      }
    }

    let firstDiffLine = firstDiffLineIndex + 1; // Convert to 1-based
    const { truncatedAst, lastEndPosition } = truncateAst(this.#ast, firstDiffLine, firstDiffColumn);

    // Determine where to continue parsing from in the new string
    // If lastEndPosition exists, continue from there; otherwise from the start of the document
    const continueFromLine = lastEndPosition ? lastEndPosition.line : 1;
    const continueFromColumn = lastEndPosition ? lastEndPosition.column + 1 : 0;

    // Based on the first difference, we can re-parse only the affected part
    // We will need to supply the remaining string after where the AST was truncated
    const remainingLines = newTextLines.slice(continueFromLine - 1);
    
    // If there's a partial line match, we need to extract only the part after the continuation column
    if (remainingLines.length > 0 && continueFromColumn > 0) {
      remainingLines[0] = remainingLines[0].substring(continueFromColumn);
    }
    
    const remainingToml = remainingLines.join(this.#Format.newLine);
    
    this.#ast = Array.from(continueParsingTOML(truncatedAst, remainingToml));
    this.#currentTomlString = tomlString;
    
    // Update the auto-detected format with the new string's characteristics
    this.#Format = TomlFormat.autoDetectFormat(tomlString);
  }

  /**
   * Overwrites the internal AST by fully re-parsing the supplied tomlString.
   * This is simpler but slower than update() which uses incremental parsing.
   * @param tomlString - The TOML string to overwrite with
   */
  overwrite(tomlString: string): void {
    if (tomlString === this.toTomlString) {
      return;
    }

    // Re-parse the entire document
    this.#ast = Array.from(parseTOML(tomlString));
    this.#currentTomlString = tomlString;
    
    // Update the auto-detected format with the new string's characteristics
    this.#Format = TomlFormat.autoDetectFormat(tomlString);
  }

}
