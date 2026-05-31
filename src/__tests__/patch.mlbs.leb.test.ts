import patch from '../patch-toml';
import { parse } from '..';

/**
 * Tests for patching multiline basic strings (MLBS) with line ending backslashes (LEB))
 */


describe('Regex value built inside MLBS with LEB', () => {
  
  // Fixture inspiration: https://github.com/eth-easl/mixtera/blob/c861dd886065a9161e20654cd61998c713f7d5c7/black.toml
  const existing =
    'regexValue = """\\'      + '\n' +
    '    .*/*\\\\.pyi|\\'         + '\n' +
    '    .*/*\\\\_grpc.py|\\'     + '\n' +
    '    .*/*\\\\_pb2.py|\\'      + '\n' +
    '    .*/benchmark/.*|\\'      + '\n' +
    '    .*/build/.*\\'           + '\n' +
    '"""'                         + '\n';

  test('should allow small edits and preserve style', () => {
    const obj = parse(existing);
    obj['regexValue'] = obj['regexValue'].replace("benchmark", "benchmarks");

    const patched = patch(existing, obj);

    expect(patched).toEqual(
      'regexValue = """\\'        + '\n' +
      '    .*/*\\\\.pyi|\\'       + '\n' +
      '    .*/*\\\\_grpc.py|\\'   + '\n' +
      '    .*/*\\\\_pb2.py|\\'    + '\n' +
      '    .*/benchmarks/.*|\\'   + '\n' +
      '    .*/build/.*\\'         + '\n' +
      '"""'                       + '\n'
    );
    expect(parse(patched)['regexValue']).toEqual(obj['regexValue']);
  });

  test('should allow row deletion and preserve style', () => {
    const obj = parse(existing);
    // Reminder: you don't need to worry about '\\' in the string content when doing replacements.
    // these are LEB (line ending backslash) and will be removed during TOML parsing as well as all the whitepsace after it.
    obj['regexValue'] = obj['regexValue'].replace('.*/benchmark/.*|' , "");

    const patched = patch(existing, obj);

    expect(patched).toEqual(
      'regexValue = """\\'        + '\n' +
      '    .*/*\\\\.pyi|\\'       + '\n' +
      '    .*/*\\\\_grpc.py|\\'   + '\n' +
      '    .*/*\\\\_pb2.py|\\'    + '\n' +
      '    .*/build/.*\\'         + '\n' +
      '"""'                       + '\n'
    );
    expect(parse(patched)['regexValue']).toEqual(obj['regexValue']);
  });

  test('should allow row insertion and preserve style', () => {
    const obj = parse(existing);
    obj['regexValue'] = obj['regexValue'].replace('.*/benchmark/.*|' , ".*/benchmark/.*|.*/subdir/.*|");

    const patched = patch(existing, obj);

    expect(patched).toEqual(
      'regexValue = """\\'        + '\n' +
      '    .*/*\\\\.pyi|\\'       + '\n' +
      '    .*/*\\\\_grpc.py|\\'   + '\n' +
      '    .*/*\\\\_pb2.py|\\'    + '\n' +
      '    .*/benchmark/.*|\\'   + '\n' +
      '    .*/subdir/.*|\\'       + '\n' +
      '    .*/build/.*\\'         + '\n' +
      '"""'                       + '\n'
    );
    expect(parse(patched)['regexValue']).toEqual(obj['regexValue']);
  });
 
});

describe('List of items built inside MLBS with LEB', () => {
  
  const existing =
    'myList = """\\'        + '\n' +
    '    I like \\'         + '\n' +
    '    cats, \\'          + '\n' +
    '    dogs, \\'          + '\n' +
    '    and birds.\\'      + '\n' +
    '"""'                   + '\n';

  test('should allow small edits and preserve style', () => {
    const obj = parse(existing);
    obj['myList'] = obj['myList'].replace("cats", "turtles");

    const patched = patch(existing, obj);

    expect(patched).toEqual(
      'myList = """\\'        + '\n' +
      '    I like \\'         + '\n' +
      '    turtles, \\'       + '\n' +
      '    dogs, \\'          + '\n' +
      '    and birds.\\'      + '\n' +
      '"""'                   + '\n'
    );
    expect(parse(patched)['myList']).toEqual(obj['myList']);
  });

  test('should allow row deletion and preserve style', () => {
    const obj = parse(existing);
    obj['myList'] = obj['myList'].replace('dogs, ' , "");

    const patched = patch(existing, obj);

    expect(patched).toEqual(
      'myList = """\\'        + '\n' +
      '    I like \\'         + '\n' +
      '    cats, \\'          + '\n' +
      '    and birds.\\'      + '\n' +
      '"""'                   + '\n'
    );
    expect(parse(patched)['myList']).toEqual(obj['myList']);
  });

  test('should allow row insertion and preserve style', () => {
    const obj = parse(existing);
    obj['myList'] = obj['myList'].replace('dogs, ' , 'dogs, turtles, ');

    const patched = patch(existing, obj);

    expect(patched).toEqual(
      'myList = """\\'        + '\n' +
      '    I like \\'         + '\n' +
      '    cats, \\'          + '\n' +
      '    dogs, \\'          + '\n' +
      '    turtles, \\'       + '\n' +
      '    and birds.\\'      + '\n' +
      '"""'                   + '\n'
    );
    expect(parse(patched)['myList']).toEqual(obj['myList']);
  });

});



test('should preserve line-continuation in multiline basic strings - Same length', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The swift brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.');
});

test('should preserve line-continuation in multiline basic strings - Slightly smaller length, second line preserved intact', () => {
  // "quick" → "slow" frees 2 chars on line 1 but the second line must not change.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The slow brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // Line 2 "jumps over the lazy dog." is unchanged and must stay verbatim.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The slow brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The slow brown fox jumps over the lazy dog.');
});

test('should preserve line-continuation in multiline basic strings - bigger length causing small overflow', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The superfast brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The superfast brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The superfast brown fox jumps over the lazy dog.');
});

test('should preserve line-continuation in multiline basic strings - even bigger length causing big overflow', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' + // 19 chars
    '  jumps over the lazy dog."""\n'; // 24 chars

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The superduperultrafast brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // "superduperultrafast" forces a mid-line split; the unchanged second line is preserved.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The superduperultrafast \\' + '\n' +
    '  brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The superduperultrafast brown fox jumps over the lazy dog.');
});

test('should not treat even number of trailing backslashes as line-continuation', () => {
  // A line ending with \\ is two literal backslashes, not a continuation.
  // The segment parser must count trailing backslashes and only flag odd counts.
  const existing =
    '[cfg]\n' +
    'path = """\\' + '\n' +
    '  C:\\\\Users\\\\Alice \\' + '\n' +
    '  is cool."""\n';

  const value = parse(existing);
  // \\ in raw TOML basic string = one literal backslash, so the decoded value is:
  // "C:\Users\Alice is cool."
  expect(value.cfg.path).toEqual('C:\\Users\\Alice is cool.');

  value.cfg.path = 'C:\\Users\\Bob is cool.';
  const patched = patch(existing, value);

  // The double-backslash lines are literal backslashes (even count = not continuation).
  // "Alice" → "Bob" frees space on line 1; line 2 "is cool." must stay verbatim.
  expect(patched).toEqual(
    '[cfg]\n' +
    'path = """\\' + '\n' +
    '  C:\\\\Users\\\\Bob \\' + '\n' +
    '  is cool."""\n'
  );
  expect(parse(patched).cfg.path).toEqual('C:\\Users\\Bob is cool.');
});

test('should preserve empty line between content lines in line-continuation multiline basic strings', () => {
  // A blank line between continuation segments is consumed by TOML's line-continuation
  // whitespace trimming, but the raw format should be preserved after patching.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // Blank line is whitespace consumed by line-continuation, so decoded value has no gap
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // The empty line between the two content segments is preserved
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The swift brown fox \\' + '\n' +
    '\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.');
});

test('should preserve whitespace-only blank line between content lines in line-continuation multiline basic strings', () => {
  // A whitespace-only (e.g. "  ") line should also round-trip with its original spaces.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  \n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // The whitespace-only blank line is preserved with its original spaces
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The swift brown fox \\' + '\n' +
    '  \n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.');
});

test('should not treat backslash in literal multiline string as line-continuation when converting to basic', () => {
  // If the new value contains ''' the string is converted from literal (''') to basic (""").
  // Backslashes in the original literal body were literal characters — line-continuation
  // detection must be gated on the original delimiter, not the post-conversion isLiteral flag.
  const existing =
    '[cfg]\n' +
    "path = '''\n" +
    "C:\\Users\\Alice\n" +
    "'''\n";

  const value = parse(existing);
  // In a literal string backslashes are verbatim, not escape sequences
  expect(value.cfg.path).toEqual('C:\\Users\\Alice\n');

  // New value contains ''' so conversion to basic multiline """ is required
  value.cfg.path = "uses '''triple''' quotes\n";
  const patched = patch(existing, value);

  // Converts to basic string; single quotes need no escaping in basic strings;
  // no line-continuation logic is applied (original was literal, not basic)
  expect(patched).toEqual(
    '[cfg]\n' +
    "path = \"\"\"\n" +
    "uses '''triple''' quotes\n" +
    "\"\"\"\n"
  );
  expect(parse(patched).cfg.path).toEqual("uses '''triple''' quotes\n");
});

test('should preserve multiple consecutive spaces between words in line-continuation multiline strings', () => {
  // Multiple spaces between words are preserved because the tokenizer splits on
  // space runs (/\S+| +/g) and appends the run as trailing WS before the backslash
  // when the next word doesn't fit. TOML preserves trailing WS before line-continuation.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  // New value contains double spaces between words
  value.description.text = 'The  quick  brown  fox  jumps  over  the  lazy  dog.';
  const patched = patch(existing, value);

  // Double spaces are preserved: the space run at each line-break point becomes
  // trailing whitespace before the backslash. Decoded: "The  quick  brown  fox  jumps  over  the  lazy  dog."
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The  quick  brown  fox  \\' + '\n' +
    '  jumps  over  the  lazy  \\' + '\n' +
    '  dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The  quick  brown  fox  jumps  over  the  lazy  dog.');
});

test('should handle patching line-continuation multiline string to empty string', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = '';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  """\n'
  );
  expect(parse(patched).description.text).toEqual('');
});

test('should handle patching line-continuation multiline string to a single character', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = 'x';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  x"""\n'
  );
  expect(parse(patched).description.text).toEqual('x');
});

test('should handle patching line-continuation multiline string to a single word', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = 'Hello';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  Hello"""\n'
  );
  expect(parse(patched).description.text).toEqual('Hello');
});

test('should handle patching line-continuation multiline string with no whitespace in new value', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // A long string with no spaces — cannot break at word boundaries, so it stays on one line
  value.description.text = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  abcdefghijklmnopqrstuvwxyz0123456789"""\n'
  );
  expect(parse(patched).description.text).toEqual('abcdefghijklmnopqrstuvwxyz0123456789');
});

test('should handle patching line-continuation multiline string with a single very long word exceeding maxLength', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  Hello \\' + '\n' +
    '  world."""\n';

  const value = parse(existing);
  // "Supercalifragilisticexpialidocious" is 34 chars — far exceeds maxLength of 5
  value.description.text = 'Supercalifragilisticexpialidocious rest';
  const patched = patch(existing, value);

  // The word overflows maxLength but must still be emitted (at least one word per line)
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  Supercalifragilisticexpialidocious \\' + '\n' +
    '  rest"""\n'
  );
  expect(parse(patched).description.text).toEqual('Supercalifragilisticexpialidocious rest');
});

test('should handle patching line-continuation multiline string where original value is all whitespace', () => {
  // The original decoded value is just spaces (consumed by line-continuation trimming)
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '       \\' + '\n' +
    '       """\n';

  const value = parse(existing);
  // Line-continuation trims all whitespace, so the decoded value is empty
  expect(value.description.text).toEqual('');

  value.description.text = 'Hello world';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '       Hello \\' + '\n' +
    '       world"""\n'
  );
  expect(parse(patched).description.text).toEqual('Hello world');
});

test('should handle patching line-continuation multiline string to all whitespace', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // New value is only spaces — cannot be represented in line-continuation format
  // because line-continuation trims all whitespace. Falls back to regular multiline.
  value.description.text = '     ';
  const patched = patch(existing, value);

  // Falls back to regular multiline format to preserve the whitespace value
  expect(patched).toEqual(
    '[description]\n' +
    'text = """     """\n'
  );
  // Verify round-trip: parsing the patched output should recover the whitespace value
  expect(parse(patched)).toEqual({ description: { text: '     ' } });
});

// Mixed line ending backslash + literal newline tests.
// A multiline basic string may have some lines with a line ending backslash and other
// lines without one. The lines that lack a backslash contribute a literal newline to
// the decoded value. Since the decoded value therefore contains a '\n',
// detectLineContinuation correctly returns false and the formatter falls back to a
// regular multiline string — preserving content even though the structural formatting
// is not preserved.

test('should preserve line ending backslash with literal line break for mixed LC/literal-newline source', () => {
  // """\<NL> opening, middle line has backslash, last content line does NOT.
  // The decoded value therefore contains a literal newline.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog\n' +
    '  and this was just white space."""\n';

  const value = parse(existing);
  // Line ending backslash joins first two lines; third line starts after literal \n
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog\n  and this was just white space.');

  value.description.text = 'Hello world\nand goodbye world';
  const patched = patch(existing, value);

  // Original style contains a literal newline in source, so preserve it literally
  // instead of encoding as a \n escape.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  Hello world\n' +
    'and goodbye world"""\n'
  );
  expect(parse(patched).description.text).toEqual('Hello world\nand goodbye world');
});

test('should preserve literal line break when only opening line has continuation marker', () => {
  // """\<NL> is immediately followed by content lines WITHOUT backslashes.
  // Only the opening backslash trims the first newline; the rest are literal newlines.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // Opening backslash trims to first content line, then literal newline appears
  expect(value.description.text).toEqual('The quick brown fox\n  jumps over the lazy dog.');

  value.description.text = 'A swift brown fox\njumps high.';
  const patched = patch(existing, value);

  // Preserve the opening LC marker and keep the semantic newline as a literal
  // source line break instead of a \n escape.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  A swift brown fox\n' +
    'jumps high."""\n'
  );
  expect(parse(patched).description.text).toEqual('A swift brown fox\njumps high.');
});

test('should preserve line ending backslash for """<NL> format regardless of leading whitespace in new value', () => {
  // The opening is """<NL> (no backslash), so first content line's indent is part of the
  // decoded value. newFirstIndent is derived from the new value's own leading whitespace,
  // stripped before packing and reattached by reassembly — so any leading whitespace is
  // supported without falling back.
  const existing =
    '[description]\n' +
    'text = """\n' +
    '  The quick brown fox \\\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('  The quick brown fox jumps over the lazy dog.');

  // Same 2-space indent — LC format preserved
  value.description.text = '  The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\n' +
    '  The swift brown fox \\\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('  The swift brown fox jumps over the lazy dog.');
});

test('should preserve line ending backslash for """<NL> format when new value has different leading whitespace', () => {
  // newFirstIndent is derived from the new value itself, so the first line's structural
  // indent adapts to match the new value's leading whitespace.
  const existing =
    '[description]\n' +
    'text = """\n' +
    '  The quick brown fox \\\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('  The quick brown fox jumps over the lazy dog.');

  // New value has no leading spaces — newFirstIndent = "", first line gets no indent
  value.description.text = 'The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // LC format preserved, first indent removed to match the new value
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\n' +
    'The swift brown fox \\\n' +
    '  jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.');
});

test('should preserve line ending backslash for """<NL> format when first segment has no indent', () => {
  // Same structure as above, but the new value does NOT start with spaces AND the
  // original first segment has no indent. rebuildLineContinuation preserves LC.
  const existing =
    '[description]\n' +
    'text = """\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // LC format preserved — first segment has no indent, no leading-space issue
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\n' +
    'The swift brown fox \\\n' +
    'jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.');
});

test('should preserve line ending backslash for multi-paragraph string with blank line between paragraphs', () => {
  // Each paragraph's text lines use LC to join them — no real newline within a paragraph.
  // A blank line (no backslash) between the two blocks is a literal \n\n in the decoded value.
  // Note: uses `"""\<NL>` (backslash opening), not `"""<NL>`, so no leading-indent issue.
  const existing =
    '[doc]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\n' +
    '\n' +
    'The second paragraph \\\n' +
    'also has some content."""\n';

  const decoded = parse(existing).doc.text;
  expect(decoded).toEqual('The quick brown fox jumps over the lazy dog.\n\nThe second paragraph also has some content.');

  const value = parse(existing);
  value.doc.text = 'A swift brown fox jumps over the lazy dog.\n\nThe second paragraph is different now.';
  const patched = patch(existing, value);

  // Paragraph style detected from original — paragraph breaks become actual blank TOML lines.
  // Each paragraph is word-packed independently, keeping "dog." on the correct paragraph.
  expect(patched).toEqual(
    '[doc]\n' +
    'text = """\\' + '\n' +
    'A swift brown fox jumps \\\n' +
    'over the lazy dog.\n' +
    '\n' +
    'The second paragraph is \\\n' +
    'different now."""\n'
  );
  expect(parse(patched).doc.text).toEqual('A swift brown fox jumps over the lazy dog.\n\nThe second paragraph is different now.');
});

test('should collapse multi-paragraph LC string to one paragraph when new value has no newlines', () => {
  const existing =
    '[doc]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\n' +
    '\n' +
    'The second paragraph \\\n' +
    'also has some content."""\n';

  const value = parse(existing);
  value.doc.text = 'A swift brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // No \n\n in new value — blank-line paragraph style not triggered; single-group pack.
  // The blank line from the original is dropped since it has no corresponding paragraph break.
  expect(patched).toEqual(
    '[doc]\n' +
    'text = """\\' + '\n' +
    'A swift brown fox jumps \\\n' +
    'over the lazy dog."""\n'
  );
  expect(parse(patched).doc.text).toEqual('A swift brown fox jumps over the lazy dog.');
});

test('should expand multi-paragraph LC string to three paragraphs when new value has two newlines', () => {
  const existing =
    '[doc]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\n' +
    '\n' +
    'The second paragraph \\\n' +
    'also has some content."""\n';

  const value = parse(existing);
  value.doc.text = 'First paragraph content.\n\nSecond paragraph content.\n\nThird paragraph content.';
  const patched = patch(existing, value);

  // Three paragraphs separated by blank lines. Each paragraph is packed independently.
  // "First paragraph content." fits on one line so it has no backslash (paragraph end).
  // "Second paragraph content." splits into two LC lines then a blank.
  // "Third paragraph content." fits on one line as the global tail.
  expect(patched).toEqual(
    '[doc]\n' +
    'text = """\\' + '\n' +
    'First paragraph content.\n' +
    '\n' +
    'Second paragraph \\\n' +
    'content.\n' +
    '\n' +
    'Third paragraph content."""\n'
  );
  expect(parse(patched).doc.text).toEqual('First paragraph content.\n\nSecond paragraph content.\n\nThird paragraph content.');
});



test('should preserve literal single line break style when original uses real line breaks', () => {
  const existing =
    '[description]\n' +
    'text = """\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\n' +
    '\n' +
    'And then what?\n' +
    'Nothing, really."""\n';

  const value = parse(existing);
  value.description.text = 'The quick brown fox jumps over the lazy dog.\n\nAnd then what?\nNothing, really, but you know.';
  const patched = patch(existing, value);

  // Original style uses real line breaks (including a single line break after '?').
  // Preserve that style and avoid introducing \n escapes when a literal line break can
  // represent the same value naturally.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\n' +
    '\n' +
    'And then what?\n' +
    'Nothing, really, but you \\\n' +
    'know."""\n'
  );
  expect(parse(patched).description.text).toEqual(
    'The quick brown fox jumps over the lazy dog.\n\nAnd then what?\nNothing, really, but you know.'
  );
});

test('should preserve spaced blank line and avoid orphan continuation line when patching quick to swift', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\\n' +
    '  jumps over the lazy dog.\n' +
    '  \n' +
    '  Then it jumped into the river."""\n';

  const value = parse(existing);
  value.description.text = value.description.text.replace('quick', 'swift');
  const patched = patch(existing, value);

  // Keep paragraph style and whitespace-only separator line from original. The second
  // logical line should not create an orphan `  \\` continuation line.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The swift brown fox jumps over \\\n' +
    '  the lazy dog.\n' +
    '  \n' +
    '  Then it jumped into the river."""\n'
  );
  expect(parse(patched).description.text).toEqual('The swift brown fox jumps over the lazy dog.\n  \n  Then it jumped into the river.');
});

test('should handle massive underflow from many segments to one word', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  one \\' + '\n' +
    '  two \\' + '\n' +
    '  three \\' + '\n' +
    '  four \\' + '\n' +
    '  five."""\n';

  const value = parse(existing);
  value.description.text = 'hi.';
  const patched = patch(existing, value);

  // Collapses to a single content line
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  hi."""\n'
  );
  expect(parse(patched).description.text).toEqual('hi.');
});

test('should handle massive overflow from one segment to many words', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  hi."""\n';

  const value = parse(existing);
  // maxLength is 2 ("hi" = 2 chars), so each word gets its own line
  value.description.text = 'aa bb cc dd ee ff';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  aa \\' + '\n' +
    '  bb \\' + '\n' +
    '  cc \\' + '\n' +
    '  dd \\' + '\n' +
    '  ee \\' + '\n' +
    '  ff"""\n'
  );
  expect(parse(patched).description.text).toEqual('aa bb cc dd ee ff');
});

test('should fall back to regular multiline when patching line-continuation string with leading whitespace', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // Leading spaces cannot survive line-continuation format because the `"""\`
  // continuation trims all whitespace (indent + content) on the first content line.
  value.description.text = '  hello world';
  const patched = patch(existing, value);

  // Falls back to regular multiline to preserve the leading spaces
  expect(patched).toEqual(
    '[description]\n' +
    'text = """  hello world"""\n'
  );
  expect(parse(patched).description.text).toEqual('  hello world');
});

test('should fall back to regular multiline when patching line-continuation string with trailing whitespace mismatch', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  // Original tail has trailingWs = '' (no trailing space before """).
  // Adding trailing spaces to the new value would be lost because the reassembly
  // inherits the original tail's trailingWs, silently dropping the trailing spaces.
  value.description.text = 'hello world  ';
  const patched = patch(existing, value);

  // Falls back to regular multiline to preserve the trailing spaces
  expect(patched).toEqual(
    '[description]\n' +
    'text = """hello world  """\n'
  );
  expect(parse(patched).description.text).toEqual('hello world  ');
});

test('should fall back to regular multiline when patching line-continuation string with both leading and trailing whitespace', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = '  hello world  ';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """  hello world  """\n'
  );
  expect(parse(patched).description.text).toEqual('  hello world  ');
});

test('should fall back to regular multiline when patching line-continuation string with a single space', () => {
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = ' ';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """ """\n'
  );
  expect(parse(patched).description.text).toEqual(' ');
});

test('should preserve line-continuation when trailing space count matches original tail', () => {
  // The original tail segment has trailingWs = ' ' (one space before \).
  // A new value that also ends with exactly one space should stay in
  // line-continuation format because the tail's trailingWs matches.
  const existing =
    'tbl = {\n' +
    '       val = """\\' + '\n' +
    '       Hello \\' + '\n' +
    '       """\n' +
    '}\n';

  const value = parse(existing);
  expect(value.tbl.val).toEqual('Hello ');

  value.tbl.val = 'Goodbye ';
  const patched = patch(existing, value);

  // Stays in line-continuation format
  expect(patched).toEqual(
    'tbl = {\n' +
    '       val = """\\' + '\n' +
    '       Goodbye \\' + '\n' +
    '       """\n' +
    '}\n'
  );
  expect(parse(patched).tbl.val).toEqual('Goodbye ');
});

test('should fall back when removing trailing space from value that originally had one', () => {
  // Original value has a trailing space ("Hello "). Patching to a value without
  // trailing space would still inject the original tail's trailingWs, corrupting the value.
  const existing =
    'tbl = {\n' +
    '       val = """\\' + '\n' +
    '       Hello \\' + '\n' +
    '       """\n' +
    '}\n';

  const value = parse(existing);
  expect(value.tbl.val).toEqual('Hello ');

  value.tbl.val = 'Goodbye';
  const patched = patch(existing, value);

  // Falls back to regular multiline — otherwise tail trailingWs would add a space
  expect(patched).toEqual(
    'tbl = {\n' +
    '       val = """Goodbye"""\n' +
    '}\n'
  );
  expect(parse(patched).tbl.val).toEqual('Goodbye');
});

test('should preserve earlier lines when only the end of a line-continuation string is removed', () => {
  // Removing the last word "Sup" from a 3-line LC string should keep lines 1 and 2
  // exactly as they were, not re-flow the whole string.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog. \\\n' +
    'Sup"""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog. Sup');

  value.description.text = 'The quick brown fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // Line 1 ("The quick brown fox \") must stay unchanged.
  // Line 2 loses its trailing space and backslash, becoming the tail.
  // "Sup" is removed entirely.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The quick brown fox jumps over the lazy dog.');
});

test('should preserve earlier lines when the last word of a continuation string is replaced', () => {
  // Replacing just the last word keeps the unchanged leading lines intact.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\\\n' +
    'Sup"""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.Sup');

  value.description.text = 'The quick brown fox jumps over the lazy dog.End';
  const patched = patch(existing, value);

  // Line 1 ("The quick brown fox \") stays unchanged.
  // "Sup" on line 3 is replaced with "End".
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick brown fox \\\n' +
    'jumps over the lazy dog.\\\n' +
    'End"""\n'
  );
  expect(parse(patched).description.text).toEqual('The quick brown fox jumps over the lazy dog.End');
});

// Underflow tests — guard against words from later (longer) lines being pulled up into
// earlier (shorter) lines when a minimal change is made, caused by maxLength being
// measured from the longest line in the original string.

test('should not reflow later lines when replacing a same-length word on a short first line', () => {
  // maxLength is determined by the long second line ("The quick brown fox." = 20).
  // Line 1 is intentionally kept short by the original author.
  // Swapping "Hi" for same-length "Yo" should only touch line 1.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'Hi \\' + '\n' +
    'The quick brown fox."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('Hi The quick brown fox.');

  value.description.text = 'Yo The quick brown fox.';
  const patched = patch(existing, value);

  // Only the first word changes — "The quick brown fox." must stay on line 2 unchanged.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'Yo \\' + '\n' +
    'The quick brown fox."""\n'
  );
  expect(parse(patched).description.text).toEqual('Yo The quick brown fox.');
});

test('should not reflow later lines when adding one character to a short first word', () => {
  // maxLength is 22 (from the long second line "very long line indeed." = 22).
  // Adding one char to "A" (→ "An") should only affect line 1 — not pull words
  // from line 2 up to fill the now-slightly-larger available space on line 1.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'A \\' + '\n' +
    'very long line indeed."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('A very long line indeed.');

  value.description.text = 'An very long line indeed.';
  const patched = patch(existing, value);

  // Only the first word changes — the second line must remain untouched.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'An \\' + '\n' +
    'very long line indeed."""\n'
  );
  expect(parse(patched).description.text).toEqual('An very long line indeed.');
});

test('should not pull words from line 3 when shrinking a word on line 2', () => {
  // maxLength is 24 (from the third line "jumps over the lazy dog." = 24).
  // Prefix preservation keeps line 1 intact. The remainder ("red fox ...") would
  // be repacked at maxLength=24, absorbing words from line 3 onto line 2.
  // Replacing "brown" (5 chars) with "red" (3 chars) should only change line 2.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick \\' + '\n' +
    'brown fox \\' + '\n' +
    'jumps over the lazy dog."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

  value.description.text = 'The quick red fox jumps over the lazy dog.';
  const patched = patch(existing, value);

  // Line 1 preserved, only "brown" → "red" on line 2, line 3 untouched.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick \\' + '\n' +
    'red fox \\' + '\n' +
    'jumps over the lazy dog."""\n'
  );
  expect(parse(patched).description.text).toEqual('The quick red fox jumps over the lazy dog.');
});

test('should not absorb words from line 3 when swapping a same-length word on line 2', () => {
  // maxLength is 15 (from the third line "fox jumps over." = 15).
  // "green fox jumps" (15) fits exactly in maxLength, so the greedy packer would
  // absorb "fox jumps" from line 3 onto line 2, leaving only "over." alone.
  // "brown" → "green" is an exact same-length swap — no lines should reflow.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick \\' + '\n' +
    'brown \\' + '\n' +
    'fox jumps over."""\n';

  const value = parse(existing);
  expect(value.description.text).toEqual('The quick brown fox jumps over.');

  value.description.text = 'The quick green fox jumps over.';
  const patched = patch(existing, value);

  // Line 1 preserved, only "brown" → "green" on line 2, line 3 untouched.
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    'The quick \\' + '\n' +
    'green \\' + '\n' +
    'fox jumps over."""\n'
  );
  expect(parse(patched).description.text).toEqual('The quick green fox jumps over.');
});


describe('NL issues', () => {

  test('should preserve bare LF in value when patching a CRLF document', () => {
    // The document uses CRLF. The caller supplies a value with bare LF newlines.
    // The value is preserved as-is: \n in the value is encoded as the TOML \n
    // escape sequence, which always decodes back to \n regardless of the file's
    // structural line ending. The TOML structure itself stays CRLF.
    const existing =
      '[description]'                     + '\r\n' +
      'text = """\\'                      + '\r\n' +
      '  The quick brown fox \\'          + '\r\n' +
      '  jumps over the lazy dog."""'     + '\r\n';
  
    const value = parse(existing);
    expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');
  
    value.description.text = 'Hello\nworld';
    const patched = patch(existing, value);
  
    // Structural newlines are CRLF; the \n in the value becomes the TOML \n escape.
    expect(patched).not.toMatch(/(?<!\r)\n/);
    expect(patched).toEqual(
      '[description]'                     + '\r\n' +
      'text = """\\'                      + '\r\n' +
      '  Hello\\nworld"""'                + '\r\n'
    );
    // Decoded value preserves the original \n.
    expect(parse(patched).description.text).toEqual('Hello\nworld');
  });
  
  test('should preserve CRLF in value when patching an LF document', () => {
    // The document uses LF. The caller supplies a value with CRLF newlines.
    // The value is preserved as-is: \r\n in the value is encoded as the TOML
    // \r\n escape sequence pair, which always decodes back to \r\n. The TOML
    // structure itself stays LF.
    const existing =
      '[description]\n' +
      'text = """\\\n' +
      '  The quick brown fox \\\n' +
      '  jumps over the lazy dog."""\n';
  
    const value = parse(existing);
    expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');
  
    value.description.text = 'Hello\r\nworld';
    const patched = patch(existing, value);
  
    // Structural newlines are LF; the \r\n in the value becomes the \r\n TOML escapes.
    expect(patched).not.toContain('\r\n');
    expect(patched).toEqual(
      '[description]\n' +
      'text = """\\\n' +
      '  Hello\\r\\nworld"""\n'
    );
    // Decoded value preserves the original \r\n.
    expect(parse(patched).description.text).toEqual('Hello\r\nworld');
  });
  
  test('should normalize mixed line endings inside the received LC string when it starts as CRLF', () => {
    // The received LC string starts in CRLF form but later contains a bare LF.
    // Rebuilding follows the string form it receives and keeps that structure
    // consistent across the output.
    const existing =
      '[description]\r\n' +
      'text = """\\' + '\r\n' +
      '  The quick brown fox \\' + '\n' + // bare LF — mixed!
      '  jumps over the lazy dog."""\r\n';
  
    const value = parse(existing);
    expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');
  
    value.description.text = 'The slow brown fox jumps over the lazy dog.';
    const patched = patch(existing, value);
  
    // Output is fully CRLF and the second line is preserved verbatim.
    expect(patched).not.toMatch(/(?<!\r)\n/);
    expect(patched).toEqual(
      '[description]\r\n' +
      'text = """\\' + '\r\n' +
      '  The slow brown fox \\' + '\r\n' +
      '  jumps over the lazy dog."""\r\n'
    );
    expect(parse(patched).description.text).toEqual('The slow brown fox jumps over the lazy dog.');
  });
  
  test('should use the multiline string form it receives when endings are mixed', () => {
    // The surrounding document is mixed, but rebuilding now follows the MLBS raw
    // as received rather than trying to normalize the whole document.
    const existing =
      '[description]\n' +
      'text = """\\' + '\r\n' +
      '  The quick brown fox \\' + '\n' +
      '  jumps over the lazy dog."""\n';
  
    const value = parse(existing);
    expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');
  
    value.description.text = 'The slow brown fox jumps over the lazy dog.';
    const patched = patch(existing, value);
  
    expect(patched).toEqual(
      '[description]\n' +
      'text = """\\' + '\n' +
      '  The slow brown fox \\' + '\n' +
      '  jumps over the lazy dog."""\n'
    );
    expect(parse(patched).description.text).toEqual('The slow brown fox jumps over the lazy dog.');
  });

  test('should keep LF when it is the first structural newline in the LC string', () => {
    const existing =
      '[description]\n' +
      'text = """\\' + '\n' +
      '  The quick brown fox \\' + '\r\n' +
      '  jumps over the lazy dog."""\n';

    const value = parse(existing);
    expect(value.description.text).toEqual('The quick brown fox jumps over the lazy dog.');

    value.description.text = 'The slow brown fox jumps over the lazy dog.';
    const patched = patch(existing, value);

    expect(patched).toEqual(
      '[description]\n' +
      'text = """\\' + '\n' +
      '  The slow brown fox \\' + '\n' +
      '  jumps over the lazy dog."""\n'
    );
    expect(parse(patched).description.text).toEqual('The slow brown fox jumps over the lazy dog.');
  });
  
});

// Edge cases that exercise boundary conditions in the packing and reassembly logic.
// These specifically guard against regressions if assumptions about dead code paths
// inside rebuildLineContinuation are ever invalidated.

test('should handle value starting with a tab character in line-continuation format', () => {
  // Tabs are escaped to \\t before reaching the packing loop, so the escaped value
  // starts with a backslash (\\), not a space. This tests that the indent regex
  // handles non-tab/space first characters correctly and that the leading-space
  // guard doesn't misfire on escaped whitespace characters.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = '\thello world';
  const patched = patch(existing, value);

  // Tab is escaped to \t in basic strings, so it stays in line-continuation format
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  \\thello world"""\n'
  );
  expect(parse(patched).description.text).toEqual('\thello world');
});

test('should handle value with escaped backslash at the very start in line-continuation format', () => {
  // The escaped value starts with "\\\\" (doubled backslash), not whitespace.
  // Tests that the indent regex correctly parses lines starting with non-indent chars.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  const value = parse(existing);
  value.description.text = '\\start and end\\';
  const patched = patch(existing, value);

  // Backslashes are doubled in basic strings; no leading space so stays in line-continuation
  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  \\\\start and end\\\\"""\n'
  );
  expect(parse(patched).description.text).toEqual('\\start and end\\');
});

test('should repack many words across multiple lines without corrupting spaces', () => {
  // Tests the packing loop boundary: after each inner-loop break, the next
  // outer iteration must land on a word token (not a space). With many words
  // being repacked across many lines, this exercises the token pointer advancement
  // across multiple break-and-resume cycles.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  abcdef \\' + '\n' +
    '  ghijkl."""\n';

  const value = parse(existing);
  // maxLength is 6, so each word pair gets its own line
  value.description.text = 'aa bb cc dd ee ff gg hh ii jj';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  aa bb \\' + '\n' +
    '  cc dd \\' + '\n' +
    '  ee ff \\' + '\n' +
    '  gg hh \\' + '\n' +
    '  ii jj"""\n'
  );
  expect(parse(patched).description.text).toEqual('aa bb cc dd ee ff gg hh ii jj');
});

test('should preserve trailing space in value when tail prototype has matching trailing space', () => {
  // The Original tail segment has trailingWs = ' ' (1 space before \).
  // New value also ends with exactly 1 space — must survive round-trip.
  // This directly tests that the tail trailing-WS assignment path works correctly
  // after the removal of the redundant /\s$/ suppression check.
  const existing =
    '[cfg]\n' +
    'val = """\\' + '\n' +
    '  word1 \\' + '\n' +
    '  word2 \\' + '\n' +
    '  word3 \\' + '\n' +
    '  """\n';

  const value = parse(existing);
  // Decoded: "word1 word2 word3 " (trailing space from last segment's trailingWs)
  expect(value.cfg.val).toEqual('word1 word2 word3 ');

  value.cfg.val = 'aaa bbb ccc ddd ';
  const patched = patch(existing, value);

  // Must stay in line-continuation format AND preserve the trailing space.
  // maxLength is 5 (from "word1"), so each word gets its own line.
  expect(patched).toEqual(
    '[cfg]\n' +
    'val = """\\' + '\n' +
    '  aaa \\' + '\n' +
    '  bbb \\' + '\n' +
    '  ccc \\' + '\n' +
    '  ddd \\' + '\n' +
    '  """\n'
  );
  expect(parse(patched).cfg.val).toEqual('aaa bbb ccc ddd ');
});

test('should handle double spaces at line boundaries during repacking', () => {
  // Double-space runs at a break point become trailing whitespace before the
  // backslash. Tests that the packing loop handles space-run tokens at the exact
  // boundary where a break occurs, and that the reassembly doesn't double-add
  // whitespace or corrupt the content.
  const existing =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  abcd \\' + '\n' +
    '  efgh."""\n';

  const value = parse(existing);
  // maxLength is 4, double spaces between each word
  value.description.text = 'aa  bb  cc  dd';
  const patched = patch(existing, value);

  expect(patched).toEqual(
    '[description]\n' +
    'text = """\\' + '\n' +
    '  aa  \\' + '\n' +
    '  bb  \\' + '\n' +
    '  cc  \\' + '\n' +
    '  dd"""\n'
  );
  expect(parse(patched).description.text).toEqual('aa  bb  cc  dd');
});

// Content integrity invariant: for ANY value, patching and then parsing must
// recover exactly the value that was set. This catches silent data corruption
// regardless of which internal format (line-continuation vs regular multiline)
// is chosen by the formatter.
describe('line-continuation content integrity', () => {
  const lineContinuationDoc =
    '[description]\n' +
    'text = """\\' + '\n' +
    '  The quick brown fox \\' + '\n' +
    '  jumps over the lazy dog."""\n';

  test.each([
    ['simple words', 'hello world'],
    ['leading space', ' hello world'],
    ['trailing space', 'hello world '],
    ['leading and trailing spaces', ' hello world '],
    ['multiple leading spaces', '   hello world'],
    ['multiple trailing spaces', 'hello world   '],
    ['all spaces', '     '],
    ['single space', ' '],
    ['empty string', ''],
    ['single character', 'x'],
    ['tab character', '\thello'],
    ['escaped backslash', 'C:\\Users\\Alice'],
    ['triple quotes', 'uses """triple""" quotes'],
    ['very long value', 'a '.repeat(100).trim()],
    ['no spaces at all', 'abcdefghijklmnopqrstuvwxyz'],
    ['double spaces between words', 'hello  world  foo'],
    ['only non-breaking content', '!!@@##$$%%'],
  ])('round-trips correctly: %s', (_label, newValue) => {
    const value = parse(lineContinuationDoc);
    value.description.text = newValue;
    const patched = patch(lineContinuationDoc, value);

    // THE INVARIANT: parsed content must exactly match what was set
    expect(parse(patched).description.text).toEqual(newValue);
  });
});

describe('Escape preference preserved in LEB multiline basic strings', () => {
  test('should preserve \\u263A escape in LEB multiline basic string after a word change', () => {
    // C1: The \u263A escape sequence lives on a continuation line; patching a different
    // word must not normalise it to the raw ☺ character.
    const existing =
      'text = """\\' + '\n' +
      '  Hello \\u263A \\' + '\n' +
      '  world."""\n';

    const obj = parse(existing);
    expect(obj.text).toEqual('Hello ☺ world.');

    obj.text = 'Bonjour ☺ world.';

    expect(patch(existing, obj)).toEqual(
      'text = """\\' + '\n' +
      '  Bonjour \\' + '\n' +
      '  \\u263A \\' + '\n' +
      '  world."""\n'
    );
    expect(parse(patch(existing, obj)).text).toEqual('Bonjour ☺ world.');
  });

  test('should preserve \\t escape in LEB multiline basic string after a word change', () => {
    // C2: In an MLBS a tab is allowed as a literal character, so \t is a style choice.
    // The LEB rebuilder must pass the escaped form (with \t token) to the word-packer
    // unchanged and the preferred escape must survive the round-trip.
    const existing =
      'key = """\\' + '\n' +
      '  col1\\tcol2 \\' + '\n' +
      '  col3."""\n';

    const obj = parse(existing);
    expect(obj.key).toEqual('col1\tcol2 col3.');

    obj.key = 'col1\tcol2_updated col3.';

    expect(patch(existing, obj)).toEqual(
      'key = """\\' + '\n' +
      '  col1\\tcol2_updated \\' + '\n' +
      '  col3."""\n'
    );
    expect(parse(patch(existing, obj)).key).toEqual('col1\tcol2_updated col3.');
  });

  test('should preserve \\U0001F600 long-form escape in LEB multiline basic string after a word change', () => {
    // C3: 8-digit \U form must survive the LEB round-trip.
    const existing =
      'text = """\\' + '\n' +
      '  Hello \\U0001F600 \\' + '\n' +
      '  world."""\n';

    const obj = parse(existing);
    expect(obj.text).toEqual('Hello 😀 world.');

    obj.text = 'Hi 😀 world.';

    expect(patch(existing, obj)).toEqual(
      'text = """\\' + '\n' +
      '  Hi \\U0001F600 \\' + '\n' +
      '  world."""\n'
    );
    expect(parse(patch(existing, obj)).text).toEqual('Hi 😀 world.');
  });

  test('should preserve multiple distinct preferred escapes (\\u263A and \\t) in a single LEB string', () => {
    // C4: Both \u263A and \t appear in the original raw; both preferences must be
    // honoured independently after patching.
    const existing =
      'text = """\\' + '\n' +
      '  \\u263A\\tcol \\' + '\n' +
      '  end."""\n';

    const obj = parse(existing);
    expect(obj.text).toEqual('☺\tcol end.');

    obj.text = '☺\tcol2 end.';

    expect(patch(existing, obj)).toEqual(
      'text = """\\' + '\n' +
      '  \\u263A\\tcol2 \\' + '\n' +
      '  end."""\n'
    );
    expect(parse(patch(existing, obj)).text).toEqual('☺\tcol2 end.');
  });
});

describe('Escape token integrity at word-wrap boundaries in LEB strings', () => {
  test('should emit \\u263A as a whole token when maxLength equals the escape sequence length', () => {
    // E1: The original line has no trailing space before \\, so content width = 6
    // (= len("\\u263A")) = maxLength. When patching with a value where \\u263A is
    // followed by another word, the packer must NOT split inside the escape sequence.
    // It should put \\u263A on its own line and the next word on the following line.
    const existing =
      'text = """\\' + '\n' +
      '  \\u263A\\' + '\n' +
      '  world."""\n';

    const obj = parse(existing);
    expect(obj.text).toEqual('☺world.');

    obj.text = '☺ world.';

    expect(patch(existing, obj)).toEqual(
      'text = """\\' + '\n' +
      '  \\u263A \\' + '\n' +
      '  world."""\n'
    );
    expect(parse(patch(existing, obj)).text).toEqual('☺ world.');
  });

  test('should not misinterpret a \\n escape token as a line-continuation marker', () => {
    // E2: The original raw has an explicit \\n escape sequence for a newline character.
    // collectPreferredEscapes records "\\n" as the preferred form for newline.
    // After escaping, the escaped string passed to the word packer contains the
    // 2-char sequence \\n (backslash + n). The packer must treat it as an opaque
    // word token, never as a bare newline or a line-continuation candidate.
    const existing =
      'text = """\\' + '\n' +
      '  hello\\n \\' + '\n' +
      '  world."""\n';

    const obj = parse(existing);
    expect(obj.text).toEqual('hello\n world.');

    obj.text = 'goodbye\n world.';

    expect(patch(existing, obj)).toEqual(
      'text = """\\' + '\n' +
      '  goodbye\\n \\' + '\n' +
      '  world."""\n'
    );
    expect(parse(patch(existing, obj)).text).toEqual('goodbye\n world.');
  });

  test('should not misinterpret a \\n escape token as a line-continuation marker (CRLF document)', () => {
    const existing =
      'text = """\\' + '\r\n' +
      '  hello\\n \\' + '\r\n' +
      '  world."""\r\n';

    const obj = parse(existing);
    expect(obj.text).toEqual('hello\n world.');

    obj.text = 'goodbye\n world.';

    expect(patch(existing, obj)).toEqual(
      'text = """\\' + '\r\n' +
      '  goodbye\\n \\' + '\r\n' +
      '  world."""\r\n'
    );
    expect(parse(patch(existing, obj)).text).toEqual('goodbye\n world.');
  });

  test('should not misinterpret a \\r\\n escape token as a line-continuation marker (LF document)', () => {
    const existing =
      'text = """\\' + '\n' +
      '  hello\\r\\n \\' + '\n' +
      '  world."""\n';

    const obj = parse(existing);
    expect(obj.text).toEqual('hello\r\n world.');

    obj.text = 'goodbye\r\n world.';

    expect(patch(existing, obj)).toEqual(
      'text = """\\' + '\n' +
      '  goodbye\\r\\n \\' + '\n' +
      '  world."""\n'
    );
    expect(parse(patch(existing, obj)).text).toEqual('goodbye\r\n world.');
  });

  test('should not misinterpret a starting \\r\\n escape token as a line-continuation marker (LF document)', () => {
    const existing =
      'text = """' + '\\r\\n' + '\\'  + '\n' +
      '  hello\\r\\n \\' + '\n' +
      '  world."""\n';

    const obj = parse(existing);
    expect(obj.text).toEqual('\r\nhello\r\n world.');

    obj.text = '\r\ngoodbye\r\n world.';

    expect(patch(existing, obj)).toEqual(
      'text = """' + '\\r\\n' + '\\'  + '\n' +
      '  goodbye\\r\\n \\' + '\n' +
      '  world."""\n'
    );
    expect(parse(patch(existing, obj)).text).toEqual('\r\ngoodbye\r\n world.');
  });

});
