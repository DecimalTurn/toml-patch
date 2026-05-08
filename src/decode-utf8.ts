/**
 * Decodes UTF-8 bytes in fatal mode and strips a leading UTF-8 BOM if present.
 */
export function decodeUtf8Bytes(value: Uint8Array): string {
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(value);
  return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
}

/**
 * Strips a leading Unicode BOM character (U+FEFF) from string input.
 */
export function stripLeadingBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
