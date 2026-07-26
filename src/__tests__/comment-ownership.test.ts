import dedent from 'dedent';
import { parse, patch } from '../index';

// Comment ownership on deletion. See docs/PLAN-Comment-Ownership.md.
//
// When a member (a root key-value, a [table]/[[array]] block, or a row inside a
// table body) is removed, the comments it OWNS are removed with it. Ownership:
//
//   R1  Right-side wins. A comment with start.line <= member.loc.end.line is
//       owned by that member (same-line trailing, `[a] # hdr`, and comments the
//       parser hoists out of multiline inline containers).
//   R2  Adjacency. A comment run whose last line is member.loc.start.line - 1
//       is owned by the member below it.
//   R3  A blank line severs ownership; the run is pinned and never travels.
//   R4  A run with no member below it is pinned.
//   R5  A run the parser filed under the PREVIOUS table but which R2 assigns to
//       the following block is still owned by that following block.
//   R6  A run in which EVERY line is a commented-out entry is pinned.
//
// A "comment run" is maximal over *consecutive lines*. A `#`-only line is an
// ordinary comment node and keeps a run contiguous -- it is not a blank line.

describe('R1 - right-side ownership', () => {
  test('removes the same-line trailing comment with its key', () => {
    const input = dedent`
      [database]
      server = "192.168.1.1"
      enabled = true # enable this feature
      ports = [8001, 8002]
    ` + '\n';

    const value = parse(input);
    delete value.database.enabled;

    expect(patch(input, value)).toEqual(dedent`
      [database]
      server = "192.168.1.1"
      ports = [8001, 8002]
    ` + '\n');
  });

  test('removes a header trailing comment with its section', () => {
    const input = dedent`
      [a] # hdr a
      x = 1

      [b]
      z = 3
    ` + '\n';

    const value = parse(input);
    delete value.a;

    // The leading blank line here is a pre-existing quirk of removing the
    // first document block (reproducible even with no comment involved at
    // all) — unrelated to comment ownership, not asserted as desirable.
    expect(patch(input, value)).toEqual('\n[b]\nz = 3\n');
  });

  test('removes comments hoisted out of a multiline inline table with their key', () => {
    // The parser lifts interior comments into the enclosing container with locs
    // pointing inside the braces. They are owned by the key-value (R1) and must
    // go with it. Today this throws.
    const input = dedent`
      x = {
        a = 1, # interior
        b = 2
      }
      y = 9
    ` + '\n';

    const value = parse(input);
    delete value.x;

    expect(patch(input, value)).toEqual(dedent`
      y = 9
    ` + '\n');
  });

  test('removes a trailing comment on a single-line inline table with its key', () => {
    const input = dedent`
      x = { a = 1, b = 2 } # trailing x
      y = 9
    ` + '\n';

    const value = parse(input);
    delete value.x;

    expect(patch(input, value)).toEqual(dedent`
      y = 9
    ` + '\n');
  });

  test('keeps a trailing comment when only an inner key of the inline table is deleted', () => {
    // The owner (`t`) survives, so its comment survives.
    const input = dedent`
      t = { a = 1, b = 2 } # keep this comment
    ` + '\n';

    const value = parse(input);
    delete value.t.a;

    expect(patch(input, value)).toEqual(dedent`
      t = { b = 2 } # keep this comment
    ` + '\n');
  });
});

describe('R2 - adjacency ownership', () => {
  test('removes the leading comment of a deleted root key-value', () => {
    const input = dedent`
      # doc for a
      a = 1
      # doc for c
      c = 3
    ` + '\n';

    const value = parse(input);
    delete value.c;

    expect(patch(input, value)).toEqual(dedent`
      # doc for a
      a = 1
    ` + '\n');
  });

  test('removes the leading comment of a deleted table row', () => {
    const input = dedent`
      [t]
      a = 1
      # doc for b
      b = 2
      c = 3
    ` + '\n';

    const value = parse(input);
    delete value.t.b;

    expect(patch(input, value)).toEqual(dedent`
      [t]
      a = 1
      c = 3
    ` + '\n');
  });

  test('removes the leading comment of the first row in a table body', () => {
    const input = dedent`
      [t]
      # doc for a
      a = 1
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.t.a;

    expect(patch(input, value)).toEqual(dedent`
      [t]
      b = 2
    ` + '\n');
  });

  test('removes a leading comment that starts at line 1', () => {
    const input = dedent`
      # doc for a
      a = 1
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.a;

    expect(patch(input, value)).toEqual(dedent`
      b = 2
    ` + '\n');
  });

  test('removes a multi-line leading run in full', () => {
    const input = dedent`
      a = 1
      # one
      # two
      # three
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
    ` + '\n');
  });

  test('treats a #-only line as part of the run, not as a blank line', () => {
    const input = dedent`
      a = 1
      # here is some information
      #
      # And some more, with a key example:
      # key = "value1"
      Key = "value2"
    ` + '\n';

    const value = parse(input);
    delete value.Key;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
    ` + '\n');
  });

  test('removes both a leading run and a same-line trailing comment', () => {
    const input = dedent`
      a = 1
      # doc for b
      b = 2 # trailing b
      c = 3
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
      c = 3
    ` + '\n');
  });

  test('does not sweep up the previous member\'s trailing comment', () => {
    // `# trailing a` is owned by `a` (R1), so it is not part of b's leading run.
    const input = dedent`
      a = 1 # trailing a
      # doc for b
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1 # trailing a
    ` + '\n');
  });

  test('removes the leading run of a deleted section', () => {
    const input = dedent`
      [a]
      x = 1

      # one
      # two
      # three
      [b]
      z = 3
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      [a]
      x = 1
    ` + '\n');
  });
});

describe('R3 - a blank line severs ownership', () => {
  test('keeps a banner separated from the deleted key by a blank line', () => {
    const input = dedent`
      a = 1

      # banner

      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1

      # banner
    ` + '\n');
  });

  test('keeps a comment separated from the deleted section by a blank line', () => {
    const input = dedent`
      [a]
      x = 1

      # not about b

      [b]
      z = 3
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      [a]
      x = 1

      # not about b
    ` + '\n');
  });

  test('splits a comment block at the blank line and removes only the adjacent run', () => {
    const input = dedent`
      # one

      # two
      a = 1
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.a;

    expect(patch(input, value)).toEqual(dedent`
      # one

      b = 2
    ` + '\n');
  });
});

describe('R4 - trailing runs are pinned', () => {
  test('keeps a trailing comment run when the last row is deleted', () => {
    const input = dedent`
      [t]
      a = 1
      b = 2
      # tail note
    ` + '\n';

    const value = parse(input);
    delete value.t.b;

    expect(patch(input, value)).toEqual(dedent`
      [t]
      a = 1
      # tail note
    ` + '\n');
  });

  test('keeps a multi-line trailing run at the end of the document', () => {
    const input = dedent`
      a = 1
      b = 2
      # one
      # two
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
      # one
      # two
    ` + '\n');
  });
});

describe('R5 - comments the parser files under the previous table', () => {
  // The headline case -- a comment separated from the previous row by a blank
  // line but adjacent to the following [b] -- is the previously-skipped test
  // 'should remove comment that precedes a deleted table section' in
  // patch.test.ts. Not duplicated here.

  test('removes an adjacent comment that precedes a deleted section with no blank line', () => {
    const input = dedent`
      [a]
      x = 1
      # section about b
      [b]
      z = 3
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      [a]
      x = 1
    ` + '\n');
  });

  test('removes the leading comment of a deleted table-array entry', () => {
    // Removing the LAST entry (rather than the first) keeps this a pure
    // Remove diff change. Splicing out a non-last entry instead produces a
    // Move (relocating the survivor) plus a Remove, and Move does not carry
    // comments along today — that's a distinct, out-of-scope gap tracked in
    // docs/PLAN-Update-Order.md (comment-preserving Move is bundled with the
    // updateOrder feature, not comment ownership on deletion).
    const input = dedent`
      # about first
      [[p]]
      n = 1

      # about second
      [[p]]
      n = 2
    ` + '\n';

    const value = parse(input);
    value.p.splice(1, 1);

    expect(patch(input, value)).toEqual(dedent`
      # about first
      [[p]]
      n = 1
    ` + '\n');
  });

  test('keeps the previous section\'s own trailing comment when the next section is deleted', () => {
    // `# end of a` is separated from [b] by a blank line, so R3 pins it inside [a].
    const input = dedent`
      [a]
      x = 1
      # end of a

      [b]
      z = 3
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      [a]
      x = 1
      # end of a
    ` + '\n');
  });
});

describe('R6 - commented-out entries are not owned', () => {
  test('keeps a commented-out key above the deleted key', () => {
    const input = dedent`
      a = 1
      # old_b = 9
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
      # old_b = 9
    ` + '\n');
  });

  test('keeps a run in which every line is a commented-out entry', () => {
    const input = dedent`
      a = 1
      # retries = 3
      # timeout = 30
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
      # retries = 3
      # timeout = 30
    ` + '\n');
  });

  test('keeps a commented-out dotted or quoted key', () => {
    const input = dedent`
      a = 1
      # x.y = 1
      # "my key" = 2
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
      # x.y = 1
      # "my key" = 2
    ` + '\n');
  });

  test('keeps a commented-out section header above a deleted section', () => {
    const input = dedent`
      [a]
      x = 1

      # [old_b]
      [b]
      z = 3
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      [a]
      x = 1

      # [old_b]
    ` + '\n');
  });

  test('removes a mixed run - one prose line defeats R6', () => {
    const input = dedent`
      a = 1
      # Legacy, kept for reference:
      # b = 8080
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
    ` + '\n');
  });

  test('removes prose that merely contains an equals sign', () => {
    // `TODO: set b` is not a valid TOML key, so this is not a commented-out entry.
    const input = dedent`
      a = 1
      # TODO: set b = 2 later
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
    ` + '\n');
  });

  test('keeps prose of the exact shape "word = word" - known false positive', () => {
    // `note` is a valid bare key, so this reads as a commented-out entry.
    // Documented limitation; asserted so a future change is a deliberate one.
    const input = dedent`
      a = 1
      # note = important
      b = 2
    ` + '\n';

    const value = parse(input);
    delete value.b;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
      # note = important
    ` + '\n');
  });
});

describe('combinations', () => {
  test('removes every owned comment when every member is deleted', () => {
    const input = dedent`
      # doc a
      a = 1
      # doc b
      b = 2
    ` + '\n';

    const patched = patch(input, {});

    expect(patched.trim()).toBe('');
  });

  test('keeps a pinned banner while removing the deleted key\'s own doc comment', () => {
    const input = dedent`
      # ==========================
      # Server configuration
      # ==========================

      # Which interface to bind.
      host = "127.0.0.1"
      port = 80
    ` + '\n';

    const value = parse(input);
    delete value.host;

    expect(patch(input, value)).toEqual(dedent`
      # ==========================
      # Server configuration
      # ==========================

      port = 80
    ` + '\n');
  });

  test('deleting one row leaves the surviving rows\' comments intact', () => {
    const input = dedent`
      [t]
      # doc a
      a = 1 # trailing a
      # doc b
      b = 2 # trailing b
      # doc c
      c = 3 # trailing c
    ` + '\n';

    const value = parse(input);
    delete value.t.b;

    expect(patch(input, value)).toEqual(dedent`
      [t]
      # doc a
      a = 1 # trailing a
      # doc c
      c = 3 # trailing c
    ` + '\n');
  });

  test('removes an owned comment when the key is deleted via undefined', () => {
    const input = dedent`
      a = 1
      # doc for b
      b = 2
    ` + '\n';

    const value = parse(input);
    value.b = undefined;

    expect(patch(input, value)).toEqual(dedent`
      a = 1
    ` + '\n');
  });

  test('leaves an empty table header and its own comment when the only row is deleted', () => {
    const input = dedent`
      # doc for t
      [t]
      # doc for a
      a = 1

      [u]
      z = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.a;

    // Two blank lines (not one) is a pre-existing quirk of emptying a table
    // that sits directly before another, with nothing re-inserted afterward
    // (reproducible with a single plain key and no comment at all) —
    // unrelated to comment ownership, not asserted as desirable.
    expect(patch(input, value)).toEqual('# doc for t\n[t]\n\n\n[u]\nz = 9\n');
  });
});
