import parseTOML, { continueParsingTOML } from './parse-toml';
import toJS from './to-js';
import { TomlFormat } from './toml-format';
import { Block } from './ast';
import { patchAst } from './patch';
import { detectNewline, resolveTomlFormat } from './toml-format';
import { truncateAst } from './truncate';
import type { ParseOptions, IntegersAsBigInt } from './parse-options';
import { decodeUtf8Bytes, stripLeadingBom } from './decode-utf8';

/**
 * TomlDocument encapsulates a TOML AST and provides methods to interact with it.
 */
export class TomlDocument {
  private _ast: Block[];
  private _currentTomlString: string;
  private _format: TomlFormat;
  private _integersAsBigInt: IntegersAsBigInt;

  /**
   * Initializes the TomlDocument with TOML source, parsing it into an AST.
   *
   * When bytes are provided, they are decoded as UTF-8 in fatal mode.
   * This rejects invalid UTF-8 sequences before parsing.
   *
   * @param tomlSource - The TOML source to parse (string or raw UTF-8 bytes)
   * @param options - Optional parse options
   * @param options.integersAsBigInt - Controls bigint vs number for TOML integers
   */
  constructor(tomlSource: string | Uint8Array, options?: ParseOptions) {
    const tomlString = typeof tomlSource === 'string'
      ? stripLeadingBom(tomlSource)
      : decodeUtf8Bytes(tomlSource);

    this._currentTomlString = tomlString;
    this._ast = Array.from(parseTOML(tomlString));
    this._integersAsBigInt = options?.integersAsBigInt ?? 'asNeeded';
    // Auto-detect formatting preferences from the original TOML string
    this._format = TomlFormat.autoDetectFormat(tomlString);
  }

  get toTomlString(): string {
    return this._currentTomlString;
  }

  /**
   * Returns the JavaScript object representation of the TOML document.
   */
  get toJsObject(): any {
    const jsObject = toJS(this._ast, this._currentTomlString, this._integersAsBigInt);
    // Convert custom date classes to regular JavaScript Date objects
    return convertCustomDateClasses(jsObject);
  }

  /**
   * Returns the internal AST (for testing purposes).
   * @internal
   */
  get ast(): Block[] {
    return this._ast;
  }

  /**
   * Applies a patch to the current AST using a modified JS object.
   * Updates the internal AST. Use toTomlString getter to retrieve the updated TOML string.
   * @param updatedObject - The modified JS object to patch with
   * @param format - Optional formatting options
   */
  patch(updatedObject: any, format?: Partial<TomlFormat> | TomlFormat) : void {

    const fmt = resolveTomlFormat(format, this._format);

    const { tomlString, document } = patchAst(
      this._ast,
      updatedObject,
      fmt
    );
    this._ast = document.items;
    this._currentTomlString = tomlString;
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
    const existingLines = this.toTomlString.split(this._format.newLine);
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
    const { truncatedAst, lastEndPosition } = truncateAst(this._ast, firstDiffLine, firstDiffColumn);

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
    
    const remainingToml = remainingLines.join(this._format.newLine);
    
    this._ast = Array.from(continueParsingTOML(truncatedAst, remainingToml));
    this._currentTomlString = tomlString;
    
    // Update the auto-detected format with the new string's characteristics
    this._format = TomlFormat.autoDetectFormat(tomlString);
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
    this._ast = Array.from(parseTOML(tomlString));
    this._currentTomlString = tomlString;
    
    // Update the auto-detected format with the new string's characteristics
    this._format = TomlFormat.autoDetectFormat(tomlString);
  }
}

/**
 * Recursively converts custom date classes to regular JavaScript Date objects.
 * This ensures that the toJsObject property returns standard Date objects
 * while preserving the custom classes internally for TOML formatting.
 */
function convertCustomDateClasses(obj: any): any {
  if (obj instanceof Date) {
    // Convert custom date classes to regular Date objects
    return new Date(obj.getTime());
  } else if (Array.isArray(obj)) {
    return obj.map(convertCustomDateClasses);
  } else if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertCustomDateClasses(value);
    }
    return result;
  }
  return obj;
}
