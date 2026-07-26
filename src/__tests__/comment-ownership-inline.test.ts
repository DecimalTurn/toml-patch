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
// Same-line trailing comments on inline table keys are, today, correctly dropped with
// their key at any position -- object key removal is always a plain Remove diff change,
// which already takes the working single-remove() path. Same-line trailing comments on
// inline array elements are correctly dropped ONLY when removing the trailing element;
// removing any other element requires a Move (compareArrays re-matches by value across
// the whole array), and Move corrupts rather than carries the comment -- see the plan doc
// for why. Leading own-line comments are not associated with anything at this level at
// all yet, in either container type: they simply stay at their line regardless of which
// key/element is removed.

describe('inline table item removal', () => {
  test('drops a same-line trailing comment when the FIRST key is removed', () => {
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

  test('drops a same-line trailing comment when a MIDDLE key is removed', () => {
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

  test('drops a same-line trailing comment when the LAST key is removed', () => {
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

  test('KNOWN GAP: a leading own-line comment does not travel with its key', () => {
    // Own-line comments inside an inline table are not associated with the
    // following key at all yet -- they simply stay pinned at their line and
    // end up mislabeling whichever key survives in that spot.
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
        # doc for a
        b = 2,
      }
      y = 9
    ` + '\n');
  });
});

describe('inline array item removal', () => {
  test('drops a same-line trailing comment when the LAST element is removed', () => {
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

  test('KNOWN GAP: a leading own-line comment does not travel with its element', () => {
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

  describe('non-trailing removal (Move) - corrupts today, not yet fixed', () => {
    // Removing anything but the trailing element requires compareArrays to
    // emit a Move (to re-slot surviving elements by value), and Move does
    // not carry an element's own comment along -- worse, it can misplace it
    // onto an unrelated line entirely. These describe the CORRECT behaviour
    // once "Comment-preserving Move" is built (see the plan doc); they are
    // not what patch() produces today.

    test.skip('should drop only the removed element\'s own comment when removing the FIRST element', () => {
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

    test.skip('should drop only the removed element\'s own comment when removing a MIDDLE element', () => {
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
