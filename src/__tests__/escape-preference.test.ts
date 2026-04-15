import { collectPreferredEscapes, escapeStringContent } from '../escape-preference';

// ─── collectPreferredEscapes ──────────────────────────────────────────────────

describe('collectPreferredEscapes', () => {
  test('should record a \\uXXXX preference', () => {
    const map = collectPreferredEscapes('Hello \\u263A world');
    expect(map.get('☺')).toBe('\\u263A');
  });

  test('should record a \\UXXXXXXXX preference', () => {
    const map = collectPreferredEscapes('emoji \\U0001F600 here');
    expect(map.get('😀')).toBe('\\U0001F600');
  });

  test('should record a simple escape preference (\\t)', () => {
    const map = collectPreferredEscapes('col1\\tcol2');
    expect(map.get('\t')).toBe('\\t');
  });

  test('should record a \\xHH preference (TOML 1.1 short form)', () => {
    const map = collectPreferredEscapes('value \\x41 end');
    // \x41 decodes to 'A'
    expect(map.get('A')).toBe('\\x41');
  });

  test('first-seen wins when the same character appears in two escape forms', () => {
    // \u263A appears before \U0000263A — the 4-digit form should win
    const map = collectPreferredEscapes('\\u263A and \\U0000263A');
    expect(map.get('☺')).toBe('\\u263A');
  });

  test('first-seen wins when the character also appears literally before its escape', () => {
    // collectPreferredEscapes only records \-sequences, so the literal ☺ is ignored
    // and the \u263A escape that follows still becomes the preferred form
    const map = collectPreferredEscapes('☺ then \\u263A');
    expect(map.get('☺')).toBe('\\u263A');
  });

  test('should record multiple distinct preferences independently', () => {
    const map = collectPreferredEscapes('\\u263A and \\t together');
    expect(map.get('☺')).toBe('\\u263A');
    expect(map.get('\t')).toBe('\\t');
  });

  test('should return an empty map for a raw string with no escape sequences', () => {
    const map = collectPreferredEscapes('plain text only');
    expect(map.size).toBe(0);
  });

  test('should not record \\n or \\r as preferences (newlines are handled separately)', () => {
    const map = collectPreferredEscapes('line1\\nline2\\r\\nline3');
    expect(map.has('\n')).toBe(false);
    expect(map.has('\r')).toBe(false);
  });
});

// ─── escapeStringContent ─────────────────────────────────────────────────────

describe('escapeStringContent', () => {
  test('singleline-basic: applies preferred \\u263A escape for matching characters', () => {
    const result = escapeStringContent('Hello ☺', '\\u263A', 'singleline-basic');
    expect(result).toBe('Hello \\u263A');
  });

  test('multiline-basic: applies preferred \\u263A escape and allows literal newline', () => {
    const result = escapeStringContent('Hello ☺\nworld', '\\u263A', 'multiline-basic');
    // Newlines are allowed literally in MLBS
    expect(result).toBe('Hello \\u263A\nworld');
  });

  test('singleline-basic with no existing raw falls back to JSON-style escaping', () => {
    // No preferred escapes — fast path uses JSON.stringify internally
    const result = escapeStringContent('say "hi"', '', 'singleline-basic');
    expect(result).toBe('say \\"hi\\"');
  });

  test('singleline-basic: DEL (U+007F) is always escaped even via the fast path', () => {
    const result = escapeStringContent('del\x7fchar', '', 'singleline-basic');
    expect(result).toBe('del\\u007Fchar');
  });

  test('multiline-basic: protects embedded triple double quotes', () => {
    // """ inside an MLBS value must be escaped as ""\\"
    const result = escapeStringContent('Three quotes: """', '', 'multiline-basic');
    expect(result).toBe('Three quotes: ""\\"');
  });

  test('singleline-basic: mandatory \\t escape applied when no preference is set', () => {
    // No existing raw → no preference. Tab is mandatory-escaped in singleline mode.
    const result = escapeStringContent('col1\tcol2', '', 'singleline-basic');
    expect(result).toBe('col1\\tcol2');
  });

  test('multiline-basic: preferred \\t wins over literal tab', () => {
    // \t is optional in MLBS; if the author used \\t, preserve that choice
    const result = escapeStringContent('col1\tcol2', '\\t', 'multiline-basic');
    expect(result).toBe('col1\\tcol2');
  });
});
