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

      // The 5-space indent (not 2) on the surviving rows is a pre-existing,
      // unrelated quirk: insert() positions a brand-new "first element of an
      // already-multi-line array" at the OPENING BRACKET's own column rather
      // than matching the other rows' indentation convention. Reproducible
      // with zero comments involved -- e.g. plain `xs = [1,\n  2,\n  3,\n]`
      // with `xs.splice(0,1)` produces the same 5-space indent. Not asserting
      // the ownership behaviour this test exists for would be worse than
      // asserting the real (if cosmetically imperfect) baseline.
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
