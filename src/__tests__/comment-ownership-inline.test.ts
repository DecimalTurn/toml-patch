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
// This file specifies the DESIRED, exhaustive behaviour -- the element-level model does not
// exist yet (only resolveSlots()/removeMember() for Document/Table/TableArray members has
// been built), so most tests below currently FAIL. That is expected: this is the target for
// the work described in the plan doc, not a report of what patch() does today. The only
// exceptions are the "same-line trailing comment" groups, which already pass -- table key
// removal is always a plain Remove diff change (object keys are addressed by name, not
// position), and array trailing-element removal is also a plain Remove; both already take
// the working single-remove() path in writer.ts.
//
// Array element removal at any position OTHER than the trailing one requires a Move
// (compareArrays re-matches surviving elements by value across the whole array), and Move
// does not carry an element's own comment along -- see the "non-trailing removal" group and
// the plan doc for why this can actively misplace a comment rather than merely leave it
// stale. There is no R6 (commented-out-entry) analogue for array elements: they are bare
// values, not `key = value` entries, so the shape test that matters at the top level is
// meaningless here.

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

  describe('leading own-line comment (R2 analogue) -- not yet implemented', () => {
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

  describe('blank line severs ownership (R3 analogue) -- not yet implemented', () => {
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

  describe('commented-out key is not owned (R6 analogue) -- not yet implemented', () => {
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

  describe('leading own-line comment (R2 analogue) -- not yet implemented', () => {
    // Scoped to the TRAILING element throughout this group, so a failure here is
    // isolated to "the ownership model doesn't exist" rather than conflated with
    // the separate Move-corruption bug covered below.

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

  describe('blank line severs ownership (R3 analogue) -- not yet implemented', () => {
    test('a banner separated by a blank line is not dropped with the element below it', () => {
      // Exact blank-line/trailing-comma bookkeeping around the removed run is a
      // best-effort guess pending real implementation -- the load-bearing
      // assertion is that "# banner" survives and "# doc for two" does not.
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

  describe('non-trailing removal (Move) -- not yet implemented, actively corrupts today', () => {
    // Removing anything but the trailing element requires compareArrays to emit a
    // Move (to re-slot surviving elements by value), and Move does not carry an
    // element's own comment along -- it can misplace it onto an unrelated line
    // entirely (see the plan doc for the exact mechanism). These assert the
    // correct end state once "Comment-preserving Move" is built.

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
