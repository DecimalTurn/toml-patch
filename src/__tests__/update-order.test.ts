/**
 * Behaviour matrix for the `updateOrder` option. See docs/PLAN-Update-Order.md for the full
 * design and docs/CommentOwnership.md / docs/PLAN-Comment-Ownership.md for how comments
 * travel with a moved entry.
 *
 * The "default off" tests are the API-compat guarantee (§2): with the option unset (or
 * false), a pure key-order permutation must produce zero changes and byte-identical output
 * (or, for the Add/Remove cases, the current — unreordered — behaviour).
 */
import dedent from 'dedent';
import { patch } from '../index';

describe('updateOrder: true', () => {
  test('reorders root key-values to match the JS object', () => {
    const input = dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const result = patch(input, { c: 3, a: 1, b: 2 }, { updateOrder: true });

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

    const result = patch(input, { b: { y: 2 }, a: { x: 1 } }, { updateOrder: true });

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

    const result = patch(input, { t: { c: 3, a: 1, b: 2 } }, { updateOrder: true });

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

    const result = patch(input, { b: 2, a: 1 }, { updateOrder: true });

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

    const result = patch(input, { c: 3, a: 1, b: 2 }, { updateOrder: true });

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

    const result = patch(input, { c: 3, a: 1 }, { updateOrder: true });

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

    const result = patch(input, { b: 2, hello: { world: 1, moon: 3 } }, { updateOrder: true });

    expect(result).toEqual(dedent`
      hello.world = 1
      b = 2
      hello.moon = 3
    ` + '\n');
  });

  test('the same non-contiguous-group guard applies to table headers ("valid but discouraged" out-of-order tables)', () => {
    // Straight from the TOML spec's own "valid but discouraged" example: [fruit.apple] and
    // [fruit.orange] are non-contiguous (split apart by [animal]), so getMemberKey's
    // first-segment-only key ("fruit" for both) makes this the exact same hazard as the
    // dotted-key case above, just at the table-header level instead of root scalars.
    const input = dedent`
      [fruit.apple]
      color = "red"

      [animal]
      kind = "dog"

      [fruit.orange]
      color = "orange"
    ` + '\n';

    const result = patch(
      input,
      { animal: { kind: 'dog' }, fruit: { apple: { color: 'red' }, orange: { color: 'orange' } } },
      { updateOrder: true }
    );

    expect(result).toEqual(dedent`
      [fruit.apple]
      color = "red"

      [animal]
      kind = "dog"

      [fruit.orange]
      color = "orange"
    ` + '\n');
  });

  test('other genuinely-movable siblings still reorder freely around a fixed non-contiguous anchor', () => {
    // Regression test: Move.from/to are indices into the FULL key sequence compareObjects
    // saw, including "fruit" even though it's unmovable here. Naively replaying only the
    // "relevant" (movable) moves against a sequence that had ALREADY dropped fruit made an
    // in-range move look like a no-op purely because the index space had shifted -- zebra and
    // animal silently failed to reorder around fruit. [fruit.apple]/[fruit.orange] must still
    // stay exactly where they are; [zebra] and [animal] must freely swap around them.
    const input = dedent`
      [fruit.apple]
      color = "red"

      [animal]
      kind = "dog"

      [fruit.orange]
      color = "orange"

      [zebra]
      stripes = true
    ` + '\n';

    const result = patch(
      input,
      {
        fruit: { apple: { color: 'red' }, orange: { color: 'orange' } },
        zebra: { stripes: true },
        animal: { kind: 'dog' }
      },
      { updateOrder: true }
    );

    expect(result).toEqual(dedent`
      [fruit.apple]
      color = "red"

      [zebra]
      stripes = true

      [fruit.orange]
      color = "orange"

      [animal]
      kind = "dog"
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

    const result = patch(input, { b: { x: 1 }, a: [{ n: 1 }, { n: 2 }] }, { updateOrder: true });

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

    const result = patch(input, { b: { z: 3 }, a: { x: 1, sub: { y: 2 } } }, { updateOrder: true });

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
    // At the default inlineTableStart (1), parseJS/formatTopLevel would otherwise hoist `b`
    // into its own [section] via remove-then-APPEND before the diff ever runs, silently
    // reordering it after `a` regardless of the requested object order -- patch.ts's
    // applyRequestedRootKeyOrder corrects updated_js's top-level key order for exactly this
    // case, so no inlineTableStart override is needed here; `b` stays the literal inline
    // value the existing document already used.
    const input = dedent`
      a = 1
      b = {
        x = 1, # note
        y = 2,
      }
    ` + '\n';

    const result = patch(input, { b: { x: 1, y: 2 }, a: 1 }, { updateOrder: true });

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

    const result = patch(input, { b: 2, a: 1 }, { updateOrder: true });

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

    const result = patch(input, { b: { y: 2 }, a: { x: 1 } }, { updateOrder: true });

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

    const result = patch(input, { c: { z: 3 }, a: { x: 1 }, b: { y: 2 } }, { updateOrder: true });

    // Gaps belong to the POSITION, not to whichever key ends up there (docs/PLAN-Update-Order.md
    // §3.3 Step 6: "the slot now at position i gets gap[i]" — precomputed from the ORIGINAL
    // occupant of position i). Position 1 (originally the a -> b transition) had zero blank
    // lines, so whichever section lands there post-reorder (now [a]) keeps that zero-gap;
    // position 2 (originally the b -> c transition) had one blank line, so [b] gets it.
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
      { updateOrder: true, inlineTableStart: 0 }
    );

    expect(result).toEqual(dedent`
      new_root = 42

      [section]
      key = "value"
    ` + '\n');
  });

  test('an inline-table-valued root key reorders within the root-KV partition alongside a real section', () => {
    // b's value happens to be an object, but b itself is a plain KeyValue (not a Table),
    // so it's classified as a root-KV for partition purposes, same as the scalar a -- and
    // freely reorderable relative to a, same as if both were scalars.
    const input = dedent`
      a = 1
      b = { x = 1, y = 2 }

      [section]
      key = "value"
    ` + '\n';

    const result = patch(
      input,
      { b: { x: 1, y: 2 }, a: 1, section: { key: 'value' } },
      { updateOrder: true, inlineTableStart: 0 }
    );

    expect(result).toEqual(dedent`
      b = { x = 1, y = 2 }
      a = 1

      [section]
      key = "value"
    ` + '\n');
  });

  test('the validity partition still holds when the root key being reordered is an inline table', () => {
    // Same trap as the scalar version above, but with an inline-table-valued root key
    // instead of a bare scalar: requesting it after [section] must still be structurally
    // impossible to honour, regardless of inlineTableStart: 0 keeping it a literal inline
    // value rather than hoisting it into a section of its own.
    const input = dedent`
      a = 1
      b = { x = 1, y = 2 }

      [section]
      key = "value"
    ` + '\n';

    const result = patch(
      input,
      { section: { key: 'value' }, a: 1, b: { x: 1, y: 2 } },
      { updateOrder: true, inlineTableStart: 0 }
    );

    expect(result).toEqual(input);
  });

  test('identity permutation produces byte-identical output', () => {
    const input = dedent`
      a = 1
      b = 2
      c = 3
    ` + '\n';

    const result = patch(input, { a: 1, b: 2, c: 3 }, { updateOrder: true });

    expect(result).toEqual(input);
  });
});

describe('updateOrder warnings when a requested position could not be honored', () => {
  test('warns when a move targets a non-contiguous group', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Constructed so the emitted Move is literally keyed "fruit" (not "animal" or "zzz"):
    // fruit is requested first, and diff.ts's simulate-and-splice always names a Move after
    // whichever key doesn't already occupy its target scan position.
    const input = dedent`
      [animal]
      kind = "dog"

      [fruit.apple]
      color = "red"

      [zzz]
      val = 1

      [fruit.orange]
      color = "orange"
    ` + '\n';

    const result = patch(
      input,
      {
        fruit: { apple: { color: 'red' }, orange: { color: 'orange' } },
        animal: { kind: 'dog' },
        zzz: { val: 1 }
      },
      { updateOrder: true }
    );

    expect(result).toEqual(input); // left unchanged -- fruit stays non-contiguous
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('toml-patch: updateOrder could not honor the requested position for 1 entry');
    expect(spy.mock.calls[0][0]).toContain('"fruit"');
    expect(spy.mock.calls[0][0]).toContain('not contiguous');

    spy.mockRestore();
  });

  test('warns when a move targets an unsupported location (a dotted-key implicit table interior)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const input = dedent`
      [t]
      hello.world = 1
      hello.moon = 2
      other = 3
    ` + '\n';

    const result = patch(
      input,
      { t: { other: 3, hello: { moon: 2, world: 1 } } },
      { updateOrder: true }
    );

    // The outer move (relocating the whole coalesced "hello" unit within t) DOES succeed;
    // only the inner one (hello's own moon/world order) is unsupported.
    expect(result).toEqual(dedent`
      [t]
      other = 3
      hello.world = 1
      hello.moon = 2
    ` + '\n');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('toml-patch: updateOrder could not honor the requested position for 1 entry');
    expect(spy.mock.calls[0][0]).toContain('t.hello.moon');
    expect(spy.mock.calls[0][0]).toContain('unsupported location');

    spy.mockRestore();
  });

  test('reorders dotted-key members inside an array-of-tables entry (seed 3214)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const input = dedent`
      [[a]]
      y3.mklbjj.k36 = 1
      y3.mklbjj.k99 = 2
    ` + '\n';

    try {
      const result = patch(
        input,
        { a: [{ y3: { mklbjj: { k99: 9, k36: 1 } } }] },
        { updateOrder: true }
      );

      expect(result).toEqual(dedent`
        [[a]]
        y3.mklbjj.k99 = 9
        y3.mklbjj.k36 = 1
      ` + '\n');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test('warns when the requested order violates the root-KV/section validity partition', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const input = dedent`
      new_root = 42

      [section]
      key = "value"
    ` + '\n';

    const result = patch(
      input,
      { section: { key: 'value' }, new_root: 42 },
      { updateOrder: true, inlineTableStart: 0 }
    );

    expect(result).toEqual(input);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('toml-patch: updateOrder could not honor the requested position for 1 entry');
    expect(spy.mock.calls[0][0]).toContain('cannot represent');

    spy.mockRestore();
  });

  test('does not warn on a successful reorder', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    patch('a = 1\nb = 2\nc = 3\n', { c: 3, a: 1, b: 2 }, { updateOrder: true });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('does not warn when updateOrder is off, even for a request that would otherwise trigger one', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const input = dedent`
      [fruit.apple]
      color = "red"

      [animal]
      kind = "dog"

      [fruit.orange]
      color = "orange"
    ` + '\n';

    patch(input, { animal: { kind: 'dog' }, fruit: { apple: { color: 'red' }, orange: { color: 'orange' } } });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
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

  test('out-of-order table headers: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      [fruit.apple]
      color = "red"

      [animal]
      kind = "dog"

      [fruit.orange]
      color = "orange"
    ` + '\n';

    expect(patch(
      input,
      { animal: { kind: 'dog' }, fruit: { apple: { color: 'red' }, orange: { color: 'orange' } } }
    )).toEqual(input);
  });

  test('movable siblings around a fixed non-contiguous anchor: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      [fruit.apple]
      color = "red"

      [animal]
      kind = "dog"

      [fruit.orange]
      color = "orange"

      [zebra]
      stripes = true
    ` + '\n';

    expect(patch(
      input,
      {
        fruit: { apple: { color: 'red' }, orange: { color: 'orange' } },
        zebra: { stripes: true },
        animal: { kind: 'dog' }
      }
    )).toEqual(input);
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

  test('inline-table root key alongside a real section: pure reorder produces zero changes, byte-identical output', () => {
    const input = dedent`
      a = 1
      b = { x = 1, y = 2 }

      [section]
      key = "value"
    ` + '\n';

    expect(patch(
      input,
      { b: { x: 1, y: 2 }, a: 1, section: { key: 'value' } },
      { inlineTableStart: 0 }
    )).toEqual(input);
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
