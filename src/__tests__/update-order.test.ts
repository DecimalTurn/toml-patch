/**
 * Behaviour matrix for the (not yet implemented) `updateOrder` option.
 * See docs/PLAN-Update-Order.md for the full design.
 *
 * `updateOrder` does not exist on `TomlFormat` yet, so every `{ updateOrder: true }` call
 * below uses an `as any` cast -- remove the casts once the option ships. Passing it today
 * triggers `validateFormatObject`'s "unsupported format properties" console.warn and is
 * silently ignored, which is exactly why the "updateOrder: true" tests below fail: the
 * assertions describe the DESIRED, post-implementation output, not what patch() does today.
 *
 * The "default off" tests are NOT placeholders -- they pass today and must keep passing
 * once the feature ships: with the option unset (or false), a pure key-order permutation
 * must produce zero changes and byte-identical output (or, for the add/remove cases, the
 * current — unreordered — behaviour), per the "API-compat guarantee" in the plan (§2).
 */
import dedent from 'dedent';
import { parse, patch } from '../index';

describe('updateOrder: true (not yet implemented -- desired behavior)', () => {
  test('reorders root key-values to match the JS object', () => {
    const input = dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const result = patch(input, { c: 3, a: 1, b: 2 }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      c = 3
      a = 1
      b = 2
    ` + '\n');
  });

  test('reorders [table]/[[array]] section blocks to match the JS object', () => {
    const input = dedent`
      [a]
      x = 1

      [b]
      y = 2
    ` + '\n';

    const result = patch(input, { b: { y: 2 }, a: { x: 1 } }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      [b]
      y = 2

      [a]
      x = 1
    ` + '\n');
  });

  test('reorders rows inside a table body to match the JS object', () => {
    const input = dedent`
      [t]
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const result = patch(input, { t: { c: 3, a: 1, b: 2 } }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      [t]
      c = 3
      a = 1
      b = 2
    ` + '\n');
  });

  test('a leading own-line comment and a trailing same-line comment both travel with their key', () => {
    const input = dedent`
      # leads a
      a = 1 # trail a
      b = 2
    ` + '\n';

    const result = patch(input, { b: 2, a: 1 }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      b = 2
      # leads a
      a = 1 # trail a
    ` + '\n');
  });

  test('Add + reorder: a genuinely new key is placed at its requested position, not just appended', () => {
    const input = dedent`
      a = 1
      b = 2
    ` + '\n';

    const result = patch(input, { c: 3, a: 1, b: 2 }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      c = 3
      a = 1
      b = 2
    ` + '\n');
  });

  test('Remove + reorder: a deleted key does not block reordering the survivors', () => {
    const input = dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const result = patch(input, { c: 3, a: 1 }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      c = 3
      a = 1
    ` + '\n');
  });

  test('dotted-key coalescing guard: a non-contiguous key.segment group is left untouched', () => {
    // `hello.world` and `hello.moon` are two SEPARATE, non-adjacent root KeyValues (`b` sits
    // between them) that both resolve to member key "hello" (getMemberKey only reads the
    // first segment). This is the dotted-key analogue of the descoped "[a], [b], [a.c]"
    // non-contiguous-group hazard (docs/PLAN-Update-Order.md, Scope): reordering must detect
    // that "hello" doesn't form one contiguous slot and bail out on that move rather than
    // coalescing the two into an adjacent pair or corrupting either one. "Did nothing" is the
    // required safe failure mode here.
    const input = dedent`
      hello.world = 1
      b = 2
      hello.moon = 3
    ` + '\n';

    const result = patch(input, { b: 2, hello: { world: 1, moon: 3 } }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      hello.world = 1
      b = 2
      hello.moon = 3
    ` + '\n');
  });

  test('an [[array-of-tables]] block moves as a unit, preserving its own entry order', () => {
    const input = dedent`
      [[a]]
      n = 1

      [[a]]
      n = 2

      [b]
      x = 1
    ` + '\n';

    const result = patch(input, { b: { x: 1 }, a: [{ n: 1 }, { n: 2 }] }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      [b]
      x = 1

      [[a]]
      n = 1

      [[a]]
      n = 2
    ` + '\n');
  });

  test('[a] and its sub-table [a.sub] move together as one contiguous unit', () => {
    const input = dedent`
      [a]
      x = 1

      [a.sub]
      y = 2

      [b]
      z = 3
    ` + '\n';

    const result = patch(input, { b: { z: 3 }, a: { x: 1, sub: { y: 2 } } }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      [b]
      z = 3

      [a]
      x = 1

      [a.sub]
      y = 2
    ` + '\n');
  });

  test('a multi-line inline-table value shifts intact, including its hoisted in-brace comment', () => {
    const input = dedent`
      a = 1
      b = {
        x = 1, # note
        y = 2,
      }
    ` + '\n';

    const result = patch(input, { b: { x: 1, y: 2 }, a: 1 }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      b = {
        x = 1, # note
        y = 2,
      }
      a = 1
    ` + '\n');
  });

  test('a blank-line-severed banner stays pinned at the top of the file while keys reorder around it', () => {
    const input = dedent`
      # General file banner

      a = 1
      b = 2
    ` + '\n';

    const result = patch(input, { b: 2, a: 1 }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      # General file banner

      b = 2
      a = 1
    ` + '\n');
  });

  test('a same-line header comment ([a] # hdr) travels with its table', () => {
    const input = dedent`
      [a] # hdr
      x = 1

      [b]
      y = 2
    ` + '\n';

    const result = patch(input, { b: { y: 2 }, a: { x: 1 } }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      [b]
      y = 2

      [a] # hdr
      x = 1
    ` + '\n');
  });

  test('R5 payoff: a comment visually introducing the next section travels with THAT section, not the previous one', () => {
    // The parser physically files "# about b" as a trailing item of [a] (it consumes
    // everything up to the next `[` into the current table), but it visually introduces
    // [b]. Reordering must apply R5 normalization before permuting, so the comment travels
    // with [b] rather than staying stranded under [a] once [c] is moved in front of both.
    const input = dedent`
      [a]
      x = 1
      # about b
      [b]
      y = 2

      [c]
      z = 3
    ` + '\n';

    const result = patch(input, { c: { z: 3 }, a: { x: 1 }, b: { y: 2 } }, { updateOrder: true } as any);

    expect(result).toEqual(dedent`
      [c]
      z = 3

      [a]
      x = 1

      # about b
      [b]
      y = 2
    ` + '\n');
  });

  test('validity partition: a root scalar can never be pushed after a section, even under inlineTableStart: 0', () => {
    // inlineTableStart: 0 is the one format combination where the JS object's key order can
    // literally ask for a scalar after a section (docs/PLAN-Update-Order.md, Scope). The
    // partition rule (root keys and sections permute within their own partition only) makes
    // this structurally impossible to honour, so the safe failure mode is to leave the
    // document untouched rather than emit invalid TOML.
    const input = dedent`
      new_root = 42

      [section]
      key = "value"
    ` + '\n';

    const result = patch(
      input,
      { section: { key: 'value' }, new_root: 42 },
      { updateOrder: true, inlineTableStart: 0 } as any
    );

    expect(result).toEqual(dedent`
      new_root = 42

      [section]
      key = "value"
    ` + '\n');
  });

  test('identity permutation produces byte-identical output', () => {
    const input = dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const result = patch(input, { a: 1, b: 2, c: 3 }, { updateOrder: true } as any);

    expect(result).toEqual(input);
  });
});

describe('updateOrder default (off): API-compat guarantee -- every case above must stay a no-op reorder', () => {
  test('root key-values: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n';

    expect(patch(input, { c: 3, a: 1, b: 2 })).toEqual(input);
  });

  test('section blocks: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      [a]
      x = 1

      [b]
      y = 2
    ` + '\n';

    expect(patch(input, { b: { y: 2 }, a: { x: 1 } })).toEqual(input);
  });

  test('table-body rows: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      [t]
      a = 1
      b = 2
      c = 3
    ` + '\n';

    expect(patch(input, { t: { c: 3, a: 1, b: 2 } })).toEqual(input);
  });

  test('comments: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      # leads a
      a = 1 # trail a
      b = 2
    ` + '\n';

    expect(patch(input, { b: 2, a: 1 })).toEqual(input);
  });

  test('Add without reorder: the new key is simply appended, existing keys keep their position', () => {
    const input = dedent`
      a = 1
      b = 2
    ` + '\n';

    expect(patch(input, { c: 3, a: 1, b: 2 })).toEqual(dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n');
  });

  test('Remove without reorder: survivors keep their original relative order', () => {
    const input = dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n';

    expect(patch(input, { c: 3, a: 1 })).toEqual(dedent`
      a = 1
      c = 3
    ` + '\n');
  });

  test('dotted keys: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      hello.world = 1
      b = 2
      hello.moon = 3
    ` + '\n';

    expect(patch(input, { b: 2, hello: { world: 1, moon: 3 } })).toEqual(input);
  });

  test('AOT block: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      [[a]]
      n = 1

      [[a]]
      n = 2

      [b]
      x = 1
    ` + '\n';

    expect(patch(input, { b: { x: 1 }, a: [{ n: 1 }, { n: 2 }] })).toEqual(input);
  });

  test('[a] + [a.sub]: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      [a]
      x = 1

      [a.sub]
      y = 2

      [b]
      z = 3
    ` + '\n';

    expect(patch(input, { b: { z: 3 }, a: { x: 1, sub: { y: 2 } } })).toEqual(input);
  });

  test('multiline inline-table value: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      a = 1
      b = {
        x = 1, # note
        y = 2,
      }
    ` + '\n';

    expect(patch(input, { b: { x: 1, y: 2 }, a: 1 })).toEqual(input);
  });

  test('pinned banner: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      # General file banner

      a = 1
      b = 2
    ` + '\n';

    expect(patch(input, { b: 2, a: 1 })).toEqual(input);
  });

  test('header comment: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      [a] # hdr
      x = 1

      [b]
      y = 2
    ` + '\n';

    expect(patch(input, { b: { y: 2 }, a: { x: 1 } })).toEqual(input);
  });

  test('R5 comment: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      [a]
      x = 1
      # about b
      [b]
      y = 2

      [c]
      z = 3
    ` + '\n';

    expect(patch(input, { c: { z: 3 }, a: { x: 1 }, b: { y: 2 } })).toEqual(input);
  });

  test('validity partition scenario: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      new_root = 42

      [section]
      key = "value"
    ` + '\n';

    expect(patch(input, { section: { key: 'value' }, new_root: 42 }, { inlineTableStart: 0 })).toEqual(input);
  });

  test('identity permutation produces byte-identical output', () => {
    const input = dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n';

    expect(patch(input, { a: 1, b: 2, c: 3 })).toEqual(input);
  });
});
