/**
 * @file Escape-style helpers used to preserve escape sequences as preferred encoding (e.g. \u263A)
 * when rewriting TOML basic strings and quoted key parts.
 * 
 * @module escape-preference
 * 
 * Summary:
 * The problem with naive parsing + re-serializing of TOML strings is that it normalizes 
 * all escape sequences to their decoded character values.
 * 
 * For example, if a TOML string contains `\u263A`, the JS string value will contain the raw ☺ character.
 * If we then naively return that string for TOML output, we would get `☺` instead of the original `\u263A`.
 * This module provides functions to scan existing raw TOML strings to infer the preferred representation of certain characters
 * and then reuse those preferred escapes when generating new TOML output, thus preserving the original style where possible.
 * 
 * Note that we are taking the presence of a single instance of an escape sequence in the original raw string as 
 * an indication of the user's preferred rendering for that character. A more faithful preservation of style 
 * would be to track all instances of each character and their various rendered forms, but this would add 
 * complexity and overhead. The current approach tries to balance things out by capturing the first seen 
 * escape for each character, which should cover the vast majority of use cases for TOML.
 * 
 */

/**
 * Decoded JS string value intended to be rendered as a TOML basic string.
 *
 * This is currently a semantic alias of `string` for API readability.
 */

/**
 * Decodes a TOML single-character escape code to its JS character.
 *
 * @param ch - Escape code character (without the leading backslash).
 * @returns The decoded character, or null if the code is not a supported simple escape.
 */
function decodeSimpleEscape(ch: string): string | null {
  switch (ch) {
    case 'b': return '\b';
    case 't': return '\t';
    case 'n': return '\n';
    case 'f': return '\f';
    case 'r': return '\r';
    case '"': return '"'; // Note that double quotes don't need escaping in JS.
    // Note that single quotes are not escaped in TOML basic strings, so no case for '\'' is needed.
    case '\\': return '\\';
    default: return null;
  }
}

export type EscapeMode = 'singleline-basic' | 'multiline-basic';

function isDisallowedControl(code: number, mode: EscapeMode): boolean {
  if (mode === 'singleline-basic') {
    return code <= 0x1f || code === 0x7f;
  }

  return (
    (code >= 0x00 && code <= 0x07) ||
    code === 0x0b ||
    (code >= 0x0e && code <= 0x1f) ||
    code === 0x7f
  );
}

function mandatoryEscaping(ch: string, mode: EscapeMode): string {
  switch (ch) {
    case '\\':
      return '\\\\';
    case '\b':
      return '\\b';
    case '\t':
      return '\\t';
    case '\f':
      return '\\f';
    case '"':
      return mode === 'singleline-basic' ? '\\"' : '"';
    case '\n':
      return mode === 'singleline-basic' ? '\\n' : '\n';
    case '\r':
      return mode === 'singleline-basic' ? '\\r' : '\r';
    default: {
      const code = ch.charCodeAt(0);
      if (isDisallowedControl(code, mode)) {
        return `\\u${code.toString(16).padStart(4, '0').toUpperCase()}`;
      }
      return ch;
    }
  }
}

/**
 * Scans a raw TOML string token and records preferred escape lexemes per decoded character.
 *
 * Example: if `existingRaw` contains `\u263A`, this map stores `☺ -> "\\u263A"`.
 * The first seen escape for a character wins to preserve original style.
 *
 * @param existingRaw - Raw TOML string content including escape sequences.
 * @returns A map from decoded character to preferred TOML escape lexeme.
 */
export function collectPreferredEscapes(existingRaw: string): Map<string, string> {
  const preferred = new Map<string, string>();

  for (let i = 0; i < existingRaw.length; i++) {
    if (existingRaw[i] !== '\\') continue;

    const n1 = existingRaw[i + 1];
    if (!n1) continue;

    const simple = decodeSimpleEscape(n1);
    if (simple !== null) {
      if (!preferred.has(simple)) preferred.set(simple, '\\' + n1);
      i += 1;
      continue;
    }

    if (n1 === 'x' && /^[0-9A-Fa-f]{2}$/.test(existingRaw.slice(i + 2, i + 4))) {
      const rawEscape = existingRaw.slice(i, i + 4);
      const code = Number.parseInt(existingRaw.slice(i + 2, i + 4), 16);
      const decoded = String.fromCharCode(code);
      if (!preferred.has(decoded)) preferred.set(decoded, rawEscape);
      i += 3;
      continue;
    }

    if (n1 === 'u' && /^[0-9A-Fa-f]{4}$/.test(existingRaw.slice(i + 2, i + 6))) {
      const rawEscape = existingRaw.slice(i, i + 6);
      const code = Number.parseInt(existingRaw.slice(i + 2, i + 6), 16);
      const decoded = String.fromCodePoint(code);
      if (!preferred.has(decoded)) preferred.set(decoded, rawEscape);
      i += 5;
      continue;
    }

    if (n1 === 'U' && /^[0-9A-Fa-f]{8}$/.test(existingRaw.slice(i + 2, i + 10))) {
      const rawEscape = existingRaw.slice(i, i + 10);
      const code = Number.parseInt(existingRaw.slice(i + 2, i + 10), 16);
      const decoded = String.fromCodePoint(code);
      if (!preferred.has(decoded)) preferred.set(decoded, rawEscape);
      i += 9;
      continue;
    }
  }

  return preferred;
}

function applyPreferredAndMandatoryEscapes(
  value: string,
  preferred: Map<string, string>,
  mode: EscapeMode
): string {
  let escaped = '';

  for (const ch of value) {
    const preferredEscape = preferred.get(ch);
    if (preferredEscape) {
      escaped += preferredEscape;
      continue;
    }

    escaped += mandatoryEscaping(ch, mode);
  }

  return escaped;
}

/**
 * Escapes TOML basic-string content while preserving preferred escape lexemes from existing raw text.
 *
 * In `singleline-basic` mode, output is suitable for `"..."` strings.
 * In `multiline-basic` mode, output is suitable for `"""..."""` strings and additionally
 * protects embedded triple quotes.
 *
 * @param value - Unescaped JS string value.
 * @param existingRaw - Existing TOML raw string used to infer preferred escapes.
 * @param mode - String rendering mode (`singleline-basic` or `multiline-basic`).
 * @returns Escaped TOML string content without surrounding delimiters.
 */
export function escapeStringContent(value: string, existingRaw: string, mode: EscapeMode): string {
  const preferred = collectPreferredEscapes(existingRaw);

  if (preferred.size === 0 && mode === 'singleline-basic') {
    const escaped = JSON.stringify(value).slice(1, -1);
    // JSON.stringify only escapes U+0000–U+001F, but TOML also forbids U+007F (DEL).
    return escaped.replace(/\x7f/g, '\\u007F');
  }

  const escaped = applyPreferredAndMandatoryEscapes(value, preferred, mode);

  return mode === 'multiline-basic' ? escaped.replace(/"""/g, '""\\"') : escaped;
}
