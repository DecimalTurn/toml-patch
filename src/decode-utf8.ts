/**
 * UTF-8 BOM marker (U+FEFF).
 */
export const UTF8_BOM = '\uFEFF';

/**
 * Decodes UTF-8 bytes in fatal mode, preserving any leading BOM.
 */
export function decodeUtf8Bytes(value: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value);
}

/**
 * Returns true when the input starts with a Unicode BOM character (U+FEFF).
 */
export function hasLeadingBom(value: string): boolean {
  return value.charCodeAt(0) === 0xfeff;
}

/**
 * Returns true when raw bytes start with a UTF-8 BOM prefix.
 */
export function hasLeadingUtf8BomBytes(value: Uint8Array): boolean {
  return value.length >= 3 && value[0] === 0xef && value[1] === 0xbb && value[2] === 0xbf;
}

/**
 * Strips a leading Unicode BOM character (U+FEFF) from string input.
 */
export function stripLeadingBom(value: string): string {
  return hasLeadingBom(value) ? value.slice(1) : value;
}
