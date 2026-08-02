import dedent from 'dedent';
import { parse, patch } from '../index';

// Comment ownership for ELEMENTS inside multi-line inline tables and arrays.
// See "Extending to elements inside multi-line arrays" in docs/PLAN-Comment-Ownership.md.
//
// This is a different axis from comment-ownership.test.ts's R1-R6 model, which governs
// root key-values, [table]/[[array]] blocks, and table-body rows. Here the question is
// whether removing one INNER key (of an inline table) or one ELEMENT (of an inline array)
// correctly takes its own comment along, where that comment was hoisted by the parser out
// of the inline container into the enclosing Document/Table (Background, case 4).
//
// Implemented: resolveInlineElementSlots() (the element-level analogue of resolveSlots(),
// correlating comments hoisted into the enclosing container back to the specific InlineItem
// they belong to), removeMember()'s InlineTable/InlineArray branch, and moveInlineElement()
// (which additionally carries a moved/displaced element's own comments through a Move --
// object key removal is always a plain Remove, but compareArrays re-matches array elements
// by value, so removing anything but the trailing element requires one or more Moves).
//
// There is no R6 (commented-out-entry) analogue for array elements: they are bare values,
// not `key = value` entries, so the shape test that matters at the top level is meaningless
// here.

describe('inline table item removal', () => {
  describe('same-line trailing comment (R1 analogue) -- already passes', () => {
    test('drops it when the FIRST key is removed', () => {
      const input = dedent`
        t = {
          a = 1, # one
          b = 2, # two
          c = 3,
        }
        y = 9
      ` + '\n';

      const value = parse(input);
      delete value.t.a;

      expect(patch(input, value)).toEqual(dedent`
        t = {
          b = 2, # two
          c = 3,
        }
        y = 9
      ` + '\n');
    });

    test('drops it when a MIDDLE key is removed', () => {
      const input = dedent`
        t = {
          a = 1, # one
          b = 2, # two
          c = 3,
        }
        y = 9
      ` + '\n';

      const value = parse(input);
      delete value.t.b;

      expect(patch(input, value)).toEqual(dedent`
        t = {
          a = 1, # one
          c = 3,
        }
        y = 9
      ` + '\n');
    });

    test('drops it when the LAST key is removed', () => {
      const input = dedent`
        t = {
          a = 1, # one
          b = 2, # two
          c = 3,
        }
        y = 9
      ` + '\n';

      const value = parse(input);
      delete value.t.c;

      expect(patch(input, value)).toEqual(dedent`
        t = {
          a = 1, # one
          b = 2, # two
        }
        y = 9
      ` + '\n');
    });
  });

  describe('leading own-line comment (R2 analogue)', () => {
    test('a single leading comment is dropped with its key', () => {
      const input = dedent`
        t = {
          # doc for a
          a = 1,
          b = 2,
        }
        y = 9
      ` + '\n';

      const value = parse(input);
      delete value.t.a;

      expect(patch(input, value)).toEqual(dedent`
        t = {
          b = 2,
        }
        y = 9
      ` + '\n');
    });

    test('a multi-line leading run is dropped in full with its key', () => {
      const input = dedent`
        t = {
          # one
          # two
          a = 1,
          b = 2,
        }
        y = 9
      ` + '\n';

      const value = parse(input);
      delete value.t.a;

      expect(patch(input, value)).toEqual(dedent`
        t = {
          b = 2,
        }
        y = 9
      ` + '\n');
    });

    test('a leading comment plus a same-line trailing comment are both dropped together', () => {
      const input = dedent`
        t = {
          # doc for a
          a = 1, # inline a
          b = 2,
        }
        y = 9
      ` + '\n';

      const value = parse(input);
      delete value.t.a;

      expect(patch(input, value)).toEqual(dedent`
        t = {
          b = 2,
        }
        y = 9
      ` + '\n');
    });

    test('a leading comment survives when a DIFFERENT key is removed', () => {
      const input = dedent`
        t = {
          # doc for a
          a = 1,
          b = 2,
        }
        y = 9
      ` + '\n';

      const value = parse(input);
      delete value.t.b;

      expect(patch(input, value)).toEqual(dedent`
        t = {
          # doc for a
          a = 1,
        }
        y = 9
      ` + '\n');
    });
  });

  describe('blank line severs ownership (R3 analogue)', () => {
    test('a banner separated by a blank line is not dropped with the key below it', () => {
      const input = dedent`
        t = {
          # banner

          # doc for a
          a = 1,
          b = 2,
        }
        y = 9
      ` + '\n';

      const value = parse(input);
      delete value.t.a;

      expect(patch(input, value)).toEqual(dedent`
        t = {
          # banner

          b = 2,
        }
        y = 9
      ` + '\n');
    });
  });

  describe('commented-out key is not owned (R6 analogue)', () => {
    test('a commented-out key directly above a real key is not dropped with it', () => {
      const input = dedent`
        t = {
          # old = 1
          a = 1,
          b = 2,
        }
        y = 9
      ` + '\n';

      const value = parse(input);
      delete value.t.a;

      expect(patch(input, value)).toEqual(dedent`
        t = {
          # old = 1
          b = 2,
        }
        y = 9
      ` + '\n');
    });
  });
});

describe('inline array item removal', () => {
  describe('same-line trailing comment (R1 analogue) -- already passes for the trailing element', () => {
    test('drops it when the LAST element is removed', () => {
      const input = dedent`
        xs = [
          1, # one
          2, # two
          3,
        ]
        y = 9
      ` + '\n';

      const value = parse(input);
      value.xs.splice(2, 1);

      expect(patch(input, value)).toEqual(dedent`
        xs = [
          1, # one
          2, # two
        ]
        y = 9
      ` + '\n');
    });
  });

  describe('leading own-line comment (R2 analogue)', () => {
    // Scoped to the TRAILING element throughout this group (a plain Remove, no
    // Move involved), so these test R2 ownership in isolation from
    // moveInlineElement()'s comment-carrying, covered separately below.

    test('a single leading comment is dropped with its element', () => {
      const input = dedent`
        xs = [
          1,
          # doc for two
          2,
        ]
        y = 9
      ` + '\n';

      const value = parse(input);
      value.xs.splice(1, 1);

      expect(patch(input, value)).toEqual(dedent`
        xs = [
          1,
        ]
        y = 9
      ` + '\n');
    });

    test('a multi-line leading run is dropped in full with its element', () => {
      const input = dedent`
        xs = [
          1,
          # one
          # two
          2,
        ]
        y = 9
      ` + '\n';

      const value = parse(input);
      value.xs.splice(1, 1);

      expect(patch(input, value)).toEqual(dedent`
        xs = [
          1,
        ]
        y = 9
      ` + '\n');
    });

    test('a leading comment plus a same-line trailing comment are both dropped together', () => {
      const input = dedent`
        xs = [
          1,
          # doc for two
          2, # inline two
        ]
        y = 9
      ` + '\n';

      const value = parse(input);
      value.xs.splice(1, 1);

      expect(patch(input, value)).toEqual(dedent`
        xs = [
          1,
        ]
        y = 9
      ` + '\n');
    });

    test('a leading comment survives when a DIFFERENT element is removed', () => {
      const input = dedent`
        xs = [
          # doc for one
          1,
          2,
        ]
        y = 9
      ` + '\n';

      const value = parse(input);
      value.xs.splice(1, 1);

      expect(patch(input, value)).toEqual(dedent`
        xs = [
          # doc for one
          1,
        ]
        y = 9
      ` + '\n');
    });
  });

  describe('blank line severs ownership (R3 analogue)', () => {
    test('a banner separated by a blank line is not dropped with the element below it', () => {
      const input = dedent`
        xs = [
          1,
          # banner

          # doc for two
          2,
        ]
        y = 9
      ` + '\n';

      const value = parse(input);
      value.xs.splice(1, 1);

      expect(patch(input, value)).toEqual(dedent`
        xs = [
          1,
          # banner

        ]
        y = 9
      ` + '\n');
    });
  });

  describe('non-trailing removal (Move)', () => {
    // Removing anything but the trailing element requires compareArrays to emit
    // one or more Move changes (to re-slot surviving elements by value).
    // moveInlineElement() carries each affected element's own comment(s) through
    // the relocation and flushes after each move, so a later Move/Remove on the
    // same container never sees stale, pre-offset positions -- see the plan doc
    // ("Extending to elements inside multi-line arrays") for why an ownership-
    // unaware remove()+insert() pair corrupts rather than merely misplaces here.

    test('drops only the removed element\'s own comment when removing the FIRST element', () => {
      const input = dedent`
        xs = [
          1, # one
          2, # two
          3,
        ]
        y = 9
      ` + '\n';

      const value = parse(input);
      value.xs.splice(0, 1);

      expect(patch(input, value)).toEqual(dedent`
        xs = [
          2, # two
          3,
        ]
        y = 9
      ` + '\n');
    });

    test('drops only the removed element\'s own comment when removing a MIDDLE element', () => {
      const input = dedent`
        xs = [
          1, # one
          2, # two
          3,
        ]
        y = 9
      ` + '\n';

      const value = parse(input);
      value.xs.splice(1, 1);

      expect(patch(input, value)).toEqual(dedent`
        xs = [
          1, # one
          3,
        ]
        y = 9
      ` + '\n');
    });
  });
});

// Everything above operates on a ROOT-level `xs = [...]`/`t = {...}`, where the moved/removed
// element's own comments live directly in Document.items. moveInlineElement()'s and
// removeMember()'s host-container resolution (findHostContainer/resolveInlineElementSlots) was
// only ever validated against that root case. See docs/bug-notes/
// inline-array-nested-container-regression.md for the full investigation: once the array lives
// inside a [table] or [[array-of-tables]] -- i.e. hostContainer !== root -- the same Move path
// either corrupts the array outright or misplaces/loses comments. These are regressions
// introduced by the comment-ownership-for-inline-elements work (they reproduce correctly on
// root-level arrays), not pre-existing gaps, so they are NOT skipped: fixing the
// nested-host-container case is the next priority.
describe('non-trailing removal (Move) nested inside a [table] or [[array-of-tables]] (regression)', () => {
  describe('middle-element removal corrupts the array', () => {
    test('array nested in a [table] loses its opening bracket -- output is not valid TOML', () => {
      const input = dedent`
        [sec]
        xs = [
          1, # one
          2, # two
          3,
        ]
        y = 9
      ` + '\n';

      const value = parse(input);
      value.sec.xs.splice(1, 1);

      // Currently produces `xs = # one\n  1,\n  3,\n]\ny = 9`, which fails to re-parse --
      // the opening `[` is destroyed rather than merely relocating comments.
      expect(patch(input, value)).toEqual(dedent`
        [sec]
        xs = [
          1, # one
          3,
        ]
        y = 9
      ` + '\n');
    });

    test('array nested in a [[array-of-tables]] loses its opening bracket -- output is not valid TOML', () => {
      const input = dedent`
        [[aot]]
        xs = [
          1, # one
          2, # two
          3,
        ]
      ` + '\n';

      const value = parse(input);
      value.aot[0].xs.splice(1, 1);

      expect(patch(input, value)).toEqual(dedent`
        [[aot]]
        xs = [
          1, # one
          3,
        ]
      ` + '\n');
    });
  });

  describe('first-element removal misplaces the surviving element\'s own comment', () => {
    // The root-level equivalent of this test (above) correctly lands `# two` trailing
    // `2,`. Nested in a table, it lands on the bracket line instead: currently
    // `xs = [  # two\n  2,\n  3,\n]`. This test isolates that comment-placement
    // regression; the survivor rows' indentation is correct.
    test('array nested in a [table] attaches the comment to the bracket line instead of its element', () => {
      const input = dedent`
        [sec]
        xs = [
          1, # one
          2, # two
          3,
        ]
        y = 9
      ` + '\n';

      const value = parse(input);
      value.sec.xs.splice(0, 1);

      expect(patch(input, value)).toEqual(dedent`
        [sec]
        xs = [
          2, # two
          3,
        ]
        y = 9
      ` + '\n');
    });

    test('array nested in a [[array-of-tables]] attaches the comment to the bracket line instead of its element', () => {
      const input = dedent`
        [[aot]]
        xs = [
          1, # one
          2, # two
          3,
        ]
      ` + '\n';

      const value = parse(input);
      value.aot[0].xs.splice(0, 1);

      expect(patch(input, value)).toEqual(dedent`
        [[aot]]
        xs = [
          2, # two
          3,
        ]
      ` + '\n');
    });
  });

  describe('multiple non-trailing removals in one patch', () => {
    test('root-level array loses a surviving element entirely (data loss)', () => {
      const input = dedent`
        xs = [
          1, # one
          2, # two
          3, # three
          4,
        ]
      ` + '\n';

      const value = parse(input);
      value.xs.splice(0, 1);
      value.xs.splice(0, 1);

      // Currently produces `xs = [\n     3,\n     # onethree\n]` -- element `4` is
      // gone entirely and `# one`/`# three` are concatenated into one token.
      expect(patch(input, value)).toEqual(dedent`
        xs = [
          3, # three
          4,
        ]
      ` + '\n');
    });

    test('array nested in a [table] escapes a surviving comment up to the table header', () => {
      const input = dedent`
        [sec]
        xs = [
          1, # one
          2, # two
          3, # three
          4,
        ]
      ` + '\n';

      const value = parse(input);
      value.sec.xs.splice(0, 1);
      value.sec.xs.splice(0, 1);

      // Currently produces `[sec]   # three\nxs = [\n     3,\n     4,\n]` -- no data
      // loss here, but `# three` escapes the array entirely onto the [sec] line.
      expect(patch(input, value)).toEqual(dedent`
        [sec]
        xs = [
          3, # three
          4,
        ]
      ` + '\n');
    });
  });
});

// These nested-in-a-table shapes were also probed while investigating the regression above,
// and -- unlike the plain-value array cases -- they currently produce the correct output
// already (modulo the same pre-existing indentation quirk). Kept as passing coverage so a
// future fix to the regression above doesn't accidentally break them.
describe('nested inside a [table] -- shapes that are NOT regressed', () => {
  test('inline-table key removal nested in a [table] still drops only its own comment', () => {
    const input = dedent`
      [sec]
      t = {
        a = 1, # one
        b = 2, # two
        c = 3,
      }
    ` + '\n';

    const value = parse(input);
    delete value.sec.t.a;

    expect(patch(input, value)).toEqual(dedent`
      [sec]
      t = {
        b = 2, # two
        c = 3,
      }
    ` + '\n');
  });

  test('array-of-inline-tables element removal nested in a [table] still drops only its own comment', () => {
    const input = dedent`
      [sec]
      xs = [
        { a = 1 }, # one
        { a = 2 },
        { a = 3 },
      ]
    ` + '\n';

    const value = parse(input);
    value.sec.xs.splice(0, 1);

    expect(patch(input, value)).toEqual(dedent`
      [sec]
      xs = [
        { a = 2 },
        { a = 3 },
      ]
    ` + '\n');
  });

  test('a leading own-line comment on a REMOVED element inside a nested array is still dropped correctly', () => {
    const input = dedent`
      [sec]
      xs = [
        # about one
        1,
        2,
        3,
      ]
    ` + '\n';

    const value = parse(input);
    value.sec.xs.splice(0, 1);

    expect(patch(input, value)).toEqual(dedent`
      [sec]
      xs = [
        2,
        3,
      ]
    ` + '\n');
  });
});

// writer.ts's insert() has its own "orphaned comment" pre-compensation block (the mirror image
// of remove()'s, fixed above), but it only ever guarded itself with `isInlineTable(parent)` --
// never `isInlineArray(parent)`, even though the SAME hoisting mechanism and offset-bleed issue
// apply identically to multiline arrays. This predates the nested-host-container regression
// above entirely (introduced in bdb8444, well before comment ownership existed) and is NOT
// specific to Move/reordering -- it reproduces on a plain `Add` (inserting a brand-new element
// via splice(), independent of moveInlineElement, which never hits this path since it always
// pre-strips every comment in the container before calling remove()+insert()). Caught by a
// GitHub Copilot review comment on this branch's PR. Fixed by adding isInlineArray(parent) to
// insert()'s guard (writer.ts) and by resolving/passing the correct host-container items array
// through patch.ts's Add handling (via findHostContainer), the same wiring removeMember/
// moveInlineElement already had.
describe('non-trailing insertion (Add) misplaces an earlier element\'s own comment (pre-existing, unrelated to the Move-path regression above)', () => {
  test('inserting a new element mid-array drags an EARLIER element\'s own comment onto the new element', () => {
    const input = dedent`
      xs = [
        1, # one
        2,
      ]
    ` + '\n';

    const value = parse(input);
    value.xs.splice(1, 0, 99);

    // Currently produces `xs = [\n  1,\n  99,    # one\n  2,\n]` -- `# one` (which
    // describes `1`) drags onto the newly-inserted `99` instead.
    expect(patch(input, value)).toEqual(dedent`
      xs = [
        1, # one
        99,
        2,
      ]
    ` + '\n');
  });

  test('same, nested in a [table]', () => {
    const input = dedent`
      [sec]
      xs = [
        1, # one
        2,
      ]
      y = 9
    ` + '\n';

    const value = parse(input);
    value.sec.xs.splice(1, 0, 99);

    expect(patch(input, value)).toEqual(dedent`
      [sec]
      xs = [
        1, # one
        99,
        2,
      ]
      y = 9
    ` + '\n');
  });

  test('same, nested in a [[array-of-tables]]', () => {
    const input = dedent`
      [[aot]]
      xs = [
        1, # one
        2,
      ]
    ` + '\n';

    const value = parse(input);
    value.aot[0].xs.splice(1, 0, 99);

    expect(patch(input, value)).toEqual(dedent`
      [[aot]]
      xs = [
        1, # one
        99,
        2,
      ]
    ` + '\n');
  });

  test('inserting a new element mid-array leaves a LATER element\'s own comment untouched (already correct)', () => {
    // The bug's own logic only misfires on comments BEFORE the insertion line, so a
    // comment on a later element was never at risk -- confirmed here so a fix for the
    // above doesn't accidentally regress this already-working case.
    const input = dedent`
      xs = [
        1,
        2, # two
      ]
    ` + '\n';

    const value = parse(input);
    value.xs.splice(1, 0, 99);

    expect(patch(input, value)).toEqual(dedent`
      xs = [
        1,
        99,
        2, # two
      ]
    ` + '\n');
  });

});

// Discovered while isolating the comment-drag bug above: this reproduces identically with
// ZERO comments involved (confirmed by stripping the fixture down to plain numbers), so it is
// a separate, pre-existing, comment-UNrelated bug in insert()'s positioning math for two
// sequential mid-array insertions in one patch -- not something the isInlineArray fix above
// touches or is responsible for. Left skipped as a known-but-deferred quirk, matching this
// repo's convention (c.f. patch.test.ts's skipped first-element-indentation test).
describe.skip('two sequential mid-array insertions in one patch collapse rows (known gap, unrelated to comment ownership)', () => {
  test('a later insertion lands on the same line as the row before it instead of its own row', () => {
    const input = dedent`
      xs = [
        1, # one
        2,
        3,
      ]
    ` + '\n';

    const value = parse(input);
    value.xs.splice(1, 0, 98);
    value.xs.splice(3, 0, 99);

    // Currently produces `xs = [\n  1, # one\n  98,\n  2, 99,\n  3,\n]` -- no data loss
    // (values are all correct, and `# one` correctly stays with `1` now), but `2,`/`99,`
    // collapse onto a single line instead of each getting their own row.
    expect(patch(input, value)).toEqual(dedent`
      xs = [
        1, # one
        98,
        2,
        99,
        3,
      ]
    ` + '\n');
  });
});

// Unlike the Move-path regression above, this gap is pre-existing (same output before and
// after the comment-ownership-for-inline-elements work landed) and is a different root cause:
// findHostContainer() doesn't resolve through an InlineTable's own KeyValue entries, so an
// array that is itself the value of a multiline inline table's key falls back to the old,
// comment-oblivious remove()+insert() path entirely. Not part of "these regressions" --
// tracked separately (see docs/bug-notes/inline-array-nested-container-regression.md, "Still open")
// and left skipped rather than failing, matching this repo's convention for known-but-deferred
// gaps (c.f. patch.test.ts's skipped first-element-indentation test).
describe.skip('nested inside a multiline inline table (known gap, unrelated to the regression above)', () => {
  test('array element removal drops the comment instead of leaving it stray near the closing bracket', () => {
    const input = dedent`
      t = {
        xs = [
          1, # one
          2, # two
          3,
        ],
      }
    ` + '\n';

    const value = parse(input);
    value.t.xs.splice(1, 1);

    // Currently produces `t = {\n  xs = [\n    1,\n    3,\n       # two\n  ],\n}` --
    // `# two` survives, stray, instead of being dropped with its removed element.
    expect(patch(input, value)).toEqual(dedent`
      t = {
        xs = [
          1,
          3,
        ],
      }
    ` + '\n');
  });
});
