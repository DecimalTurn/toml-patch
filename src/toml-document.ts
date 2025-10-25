import parseTOML, { continueParsingTOML } from './parse-toml';
import toTOML from './to-toml';
import toJS from './to-js';
import { Format } from './format';
import { AST, Block } from './ast';
import { patchAst } from './patch';
import { detectNewline, countTrailingNewlines } from './utils';
import { truncateAst } from './truncate';
import { Position } from './location';

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
    if (tomlString === this.toTomlString) {
      return;
    }

    // Now, let's check where the first difference is
    const existingLines = this.toTomlString.split(this.#newline);
    const newLines = tomlString.split(this.#newline);
    let firstDiffLineIndex = 0;
    while (
      firstDiffLineIndex < existingLines.length &&
      firstDiffLineIndex < newLines.length &&
      existingLines[firstDiffLineIndex] === newLines[firstDiffLineIndex]
    ) {
      firstDiffLineIndex++;
    }

    // Calculate the 1-based line number and 0-based column where the first difference occurs
    
    let firstDiffColumn = 0;
    
    // If we're within the bounds of both arrays, find the column where they differ
    if (firstDiffLineIndex < existingLines.length && firstDiffLineIndex < newLines.length) {
      const existingLine = existingLines[firstDiffLineIndex];
      const newLine = newLines[firstDiffLineIndex];
      
      // Find the first character position where the lines differ
      for (let i = 0; i < Math.max(existingLine.length, newLine.length); i++) {
        if (existingLine[i] !== newLine[i]) {
          firstDiffColumn = i;
          break;
        }
      }
    }

    let firstDiffLine = firstDiffLineIndex + 1; // Convert to 1-based
    
    // We need to find the last complete block that ends BEFORE the change position
    // If a block contains the change, we can't use it - we must exclude it and reparse
    let truncateBeforeLine = firstDiffLine;
    let truncateBeforeColumn = 0; // Start of line
    
    // Find the last block that ends before the change
    const truncatedBlocks: Block[] = [];
    let lastEndPosition: Position | null = null;
    
    for (const node of this.#ast) {
      const nodeEndsBeforeChange = 
        node.loc.end.line < firstDiffLine ||
        (node.loc.end.line === firstDiffLine && node.loc.end.column < firstDiffColumn);
      
      if (nodeEndsBeforeChange) {
        truncatedBlocks.push(node);
        lastEndPosition = node.loc.end;
      } else {
        // This node contains or comes after the change, stop here
        break;
      }
    }

    // Determine where to continue parsing from in the new string
    // If lastEndPosition exists, continue from there; otherwise from the start of the document
    const continueFromLine = lastEndPosition ? lastEndPosition.line : 1;
    const continueFromColumn = lastEndPosition ? lastEndPosition.column + 1 : 0;

    // Based on the last valid position, we can re-parse only the affected part
    // We will need to supply the remaining string from where we stopped
    const remainingLines = newLines.slice(continueFromLine - 1);
    
    // If there's a partial line, we need to extract only the part after the continuation column
    if (remainingLines.length > 0 && continueFromColumn > 0) {
      remainingLines[0] = remainingLines[0].substring(continueFromColumn);
    }
    
    const remainingToml = remainingLines.join(this.#newline);
    
    this.#ast = continueParsingTOML(truncatedBlocks, remainingToml);
    this.#currentTomlString = tomlString;
    
    // Update newline style and trailing newline count from the new string
    this.#newline = detectNewline(tomlString);
    this.#trailingNewlineCount = countTrailingNewlines(tomlString, this.#newline);
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
    this.#ast = parseTOML(tomlString);
    this.#currentTomlString = tomlString;
    
    // Update newline style and trailing newline count from the new string
    this.#newline = detectNewline(tomlString);
    this.#trailingNewlineCount = countTrailingNewlines(tomlString, this.#newline);
  }

}
