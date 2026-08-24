# Plan: make CST positions derived, not maintained

> **Line references** are against `dev-fuzz-bug-fixes`@caefc6d.

> **Goal:** replace validate-and-retry with a direct fix. Today the writer maintains absolute coordinates
> through a side-channel offset system, gets them wrong for a specific and well-understood class of edit,
> and the library compensates by re-parsing its own output and redoing the patch with a coarser writer.
> This plan removes the cause so the compensation can be deleted.

---

## The diagnosis

Established empirically, not inferred. Three facts, each verifiable in a few minutes.

### 1. Emission paints at absolute coordinates

`src/to-toml.ts` builds a `lines: string[]` canvas and paints each node's raw text at its recorded
position. The delimiters of inline containers are painted from the container's own `loc`:

```ts
// to-toml.ts, InlineArray
writeSingle(lines, start.line, start.column, '[');
writeSingle(lines, end.line, end.column - 1, ']');

// to-toml.ts, InlineItem
if (ii.comma) writeSingle(lines, ii.loc.end.line, ii.loc.end.column, ',');
```

`write()` pads with spaces to reach `loc.start.column`. **Whitespace is therefore implicit** — it is
whatever canvas remains unpainted between two spans. Nothing in the CST records it:

```ts
export interface TreeNode {
  type: NodeType;
  loc: Location;      // line + column only. No byte range, no trivia.
}
```

That is the root of everything below. Formatting is stored *as coordinates*, so a coordinate that is stale
is not a cosmetic problem — it is a corrupt document.

### 2. The offset system cannot express a line-span change

`writer.ts` keeps two `WeakMap<TreeNode, Span>` side tables (`enter_offsets`, `exit_offsets`), a
`WeakSet` of dirty roots, and `applyWrites()` — a traversal that accumulates

```ts
let offsetLines = 0;
const offsetColumns: { [line: number]: number } = {};
```

and shifts every node's `loc` by them. **`offsetColumns` is keyed by the pre-shift line number.** So a
column delta recorded for line *N* applies to nodes whose recorded line is *N*.

When a member's own line span changes — a multiline string collapsing onto one line, an element removed —
the enclosing container's closing delimiter needs to move to a *different line* than the one its column
delta was recorded against. `shiftEnd(container)` applies the delta anyway. `Table`/`TableArray`/`Document`
escape this because `applyWrites` calls `recalcContainerEnd()` on them, recomputing the end from their
children. `InlineArray`/`InlineTable` get no such treatment, because their end carries a delimiter and so
cannot simply be the max of the children.

### 3. Every failure is one bug

Running the distilled regressions with verification off and classifying the corruption:

```
k = 0x,8                        comma painted inside a hex literal
2004-04-25T17:2,:-51408.63      comma painted inside a datetime
, false, false   -31687.66292]  separator lost
}   tail."other q               separator lost
build.artifacts = [1, '''       closing ] never painted; the real one overwrote a digit
```

Not five bugs. One: **a delimiter or separator painted at a coordinate that no longer describes the
content.** 11 of the 16 distilled seeds are saved only by the retry, and all 11 corruptions are of this
shape.

Diagnosed concretely on the smallest case: the outer array's `loc.end` says line 2 column 25 — mid-line,
just after `true` — while its content now ends at column 100.

---

## Why a repair pass cannot fix this

Worth reading before proposing one. Three attempts, all measured against the baseline as it stood at the
time (**30 failures**; it is 25 at `caefc6d`, because the validation-specific tests were since removed):

| attempt | result |
| :--- | :--- |
| re-anchor container ends in `applyWrites`, slow path | no change — the affected container takes the *fast* path (no offsets on itself, only on a descendant) |
| same, both paths, guarded against synthetic locs | **96 failures** |
| post-pass after `applyChanges`, gaps captured pre-patch by node identity | **39** (fixes 3, breaks 12) |
| same, narrowed to ends that provably overwrite content | **34** (fixes 5, breaks 9) |

The breakages name the reason:

```
recalcInlineContainerEnds post-order: triply nested inline table
BUG: tightening inline table inside inline array leaves trailing whitespace
BUG: emptying nested inline array inside inline table leaves trailing whitespace
```

**The gap between a container's last item and its delimiter is not invariant.** Three mechanisms mutate it
deliberately — `tightenInlineContainerEnd`, `applyBracketSpacing`, and the emptied-container compaction.
A repair pass restoring the captured gap undoes their work, and no predicate distinguishes "content moved,
fix this" from "this was deliberately adjusted", because both look identical in the final coordinates.

That is the argument for changing the representation rather than patching the arithmetic. The information
needed to tell those two cases apart does not exist in the CST.

---

## Design

The organising principle: **positions become outputs of emission, never inputs to it.**

### Idea 1 — byte ranges, and verbatim reuse of clean subtrees

*This is the load-bearing idea. Everything else is easier if this lands first.*

Add a byte range to every node at parse time:

```ts
export interface TreeNode {
  type: NodeType;
  loc: Location;          // derived; see Idea 4
  range: [number, number];  // absolute offsets into the source
}
```

The parser already has this — `createLocate(input)` converts offsets to positions, so the offsets exist and
are discarded. Keeping them buys the single most valuable property available here:

> **An untouched subtree is emitted by copying its source slice verbatim.**

No coordinate arithmetic, no re-derivation of quoting or number bases or delimiter style, no possibility of
a formatting regression. `source.slice(start, end)` is byte-exact by construction.

This is a correctness argument before it is a performance one. Most of what the current writer does is
re-derive text that was already correct in the input, and most of the fuzz seeds are cases where that
re-derivation went wrong for a node nobody edited. Copying removes that entire failure class.

### Idea 2 — explicit inter-node gaps for the edited regions

Clean subtrees copy. Dirty regions need layout, and layout needs to know the whitespace that the
coordinates currently encode implicitly. Derive it once, at parse time or lazily on first mutation:

```ts
interface Trivia {
  /** Text between the previous sibling's end (or the container's opener) and this node's start. */
  before: string;
}
```

Store the literal string, not a `{lines, columns}` span. Tabs, alignment padding, and the blank lines
between blocks all survive, and `useTabsForIndentation` stops needing a post-pass over the rendered output
(`to-toml.ts` currently rewrites leading whitespace after the fact, skipping lines that are inside
multiline strings — a hack that only exists because whitespace is not represented).

Layout then becomes relative: *gap, node, gap, node*. A member whose line span changes shifts everything
after it automatically, because nothing downstream holds an absolute coordinate.

### Idea 3 — dirtiness in the CST, per node, not per root

Today dirtiness is a root-level `WeakSet` plus per-node offset `WeakMap`s — a side channel that emission
cannot consult usefully. Replace it with something emission can branch on:

```ts
interface TreeNode {
  // ...
  /** Cleared on parse; set by writer mutations. Propagates to ancestors. */
  dirty?: boolean;
}
```

Mutation marks the node and walks up marking ancestors. Emission then reads:

```
emit(node, cursor):
  if (!node.dirty)  → copy source.slice(...node.range), advance cursor by its shape
  else              → emit gap + own text + recurse into children
```

Three consequences worth spelling out:

- **The fast path is byte-exact, not just fast.** A clean node cannot be mis-emitted.
- **Ancestor propagation is what makes it sound.** A dirty leaf must dirty every container that encloses
  it, because those containers' delimiters have to be re-laid-out. This is precisely the relationship the
  current offset system fails to maintain.
- **`dirty` replaces `enter_offsets`, `exit_offsets`, `dirty_roots`, `emptiedByRemove`,
  `hadNonLastRemoval`, and `inlineContainersNeedingTighten`** — six side tables collapsing into one field
  with an obvious meaning.

A `revision: number` counter on the document is a reasonable alternative if incremental re-emission is ever
wanted (compare node revision against the last-emitted revision). Start with the boolean; it is enough.

### Idea 4 — emission as a cursor walk, `loc` written back afterwards

```ts
function emit(node: TreeNode, out: StringBuilder, cursor: Position): Position
```

Append-only. No canvas, no padding-to-column, no `writeSingle`. Positions are computed as text is appended,
and assigned back to `node.loc` on the way out, so `loc` becomes a *derived artifact* rather than an input.

That write-back is not optional — two consumers depend on `loc` after patching:

- `TomlDocument.update()` uses positions to truncate the CST and incrementally re-parse from the first
  difference (`truncateCst`, `continueParsingTOML`)
- `comment-alignment.ts` reads columns to keep aligned trailing comments aligned

Both keep working, because they read `loc` after emission rather than during it.

### Idea 5 — keep verification, demote it to a development assertion

The verification machinery is the best oracle available for this work. Do not delete it at the start —
invert it:

```ts
if (process.env.TOML_PATCH_ASSERT_POSITIONS) {
  // re-parse the output, compare structurally, throw loudly on mismatch
}
```

During development it catches every regression immediately. When the new emitter is trusted, the production
fallback goes and the assertion stays for the fuzz harness. See
[`PLAN-Patch-Verification.md`](./PLAN-Patch-Verification.md) for what happens to the public-facing side.

---

## Phasing

Each phase is independently shippable and independently revertable. None of them changes output until
Phase 3.

**Phase 0 — ranges, no behaviour change.** Add `range` to nodes in `parse-toml.ts`. Assert in tests that
`range` and `loc` agree for every node of every fixture (a locator round-trip). Output identical.

**Phase 1 — dirtiness, no behaviour change.** Add the `dirty` flag and ancestor propagation to the
`writer.ts` mutators (`insert`, `remove`, `replace`). Keep the offset system running and authoritative.
Verify the new signal against the old by asserting that every root the old system marks dirty contains at
least one node the new one marks dirty. Output identical.

**Phase 2 — new emitter behind a flag.** Implement Ideas 2 and 4 as a second emitter. Differential-test it
against the current one across the whole corpus: 2501 tests, 896 spec tests, and the 68-seed historical
harness. Divergence is a bug in the new emitter until proven otherwise. Existing verification runs
underneath the whole time, so a mistake surfaces as a test failure rather than as corrupt output.

**Phase 3 — flip the default, delete the workarounds.** Once the differential is clean:

| removal | size |
| :--- | :--- |
| offset machinery in `writer.ts` (`enter_offsets`, `exit_offsets`, `applyWrites`, `shiftNode`, `recalcContainerEnd`, `addExitOffset`, …) | ~52 references across 1337 lines |
| multiline transaction planner in `patch.ts` | 111 lines |
| `layoutSensitiveArray` / `hasMixedStringAndObject` in `diff.ts` | 6 references, including the `values.length > 4` magic threshold |
| `recalcInlineContainerEnds`, `compactInlineContainerAncestors` in `patch.ts` | ~110 lines |
| coordinate painting in `to-toml.ts` (`write`, `writeSingle`, the tab post-pass) | most of 319 lines |

**Phase 4 — retire verification.** Delete `patch-validate.ts` (115 lines) and the retry, keeping the
Phase-2 assertion behind an env var for the fuzz harness.

---

## How we will know it worked

The test that matters is not "the suite is green" — it is green today via the fallback. It is:

> With verification disabled entirely, everything passes.

**That baseline is 25 failures at `caefc6d`**, and it is cheap to re-check: stub the `needsVerification`
branch in `patch.ts` and `toml-document.ts`, then run `pnpm run test`. The breakdown is stable and worth
knowing, because it tells you which layer a phase actually helped:

| group | count |
| :--- | ---: |
| `historical fuzz seed N still passes the full harness` | 13 |
| distilled regressions in `patch.fuzz.test.ts` | 11 |
| `TomlDocument` produces valid TOML where the fine-grained writer would not | 1 |

The 13 harness seeds are the demanding set. They run `fuzzOne` with three mutations rather than one
reduced case, so a phase can fix all 11 distilled regressions and still leave harness seeds failing. Any
phase that does not move 25 toward 0 has not addressed the cause.

A second, stronger check once Phase 3 lands: run the transaction planner *never* rather than *on retry*.
Today forcing it always-on fixes the seeds but breaks 21 formatting tests, because it rewrites whole
containers. If the positions work is correct, deleting it should break nothing.

---

## Risks and open questions

- **Perf.** Expected to improve — clean subtrees become `slice` instead of a re-derivation plus a shifting
  traversal — but the current emitter has heavily tuned fast paths (`shiftPositionsNoOffsets`, monomorphic
  IC comments in `applyWrites`) and appending to a builder has different allocation behaviour than painting
  a canvas. Benchmark per phase; `benchmark/` already has the harnesses.
- **`inlineTableStart`.** Controls where an inline table begins relative to its key. It is a layout policy,
  so it belongs in the gap computation of Idea 2 rather than in coordinate arithmetic — but it currently
  interacts with the tightening code that Phase 3 deletes. Map that interaction before Phase 3.
- **Comment alignment.** `comment-alignment.ts` post-processes the *rendered string* to realign trailing
  comments. With explicit trivia this should become a gap computation instead, but that is a follow-up, not
  a prerequisite.
- **Blank lines between blocks.** Currently implied by line gaps in coordinates. Idea 2's `before` string
  captures them, but check the `trailingNewline` and emptied-table paths, which manipulate them explicitly.
- **Generated subtrees have no `range`.** Nodes built by `generate.ts` for the updated document describe no
  source text. They must be born `dirty: true` with `range` absent, and the emitter must never try to slice
  them. My third repair attempt failed partly on exactly this — a "preserve the original gap" invariant is
  meaningless for a synthetic node, which showed up as negative gaps in the trace. Make it a type-level
  distinction if possible (`range?: [number, number]` and require `dirty` when absent) rather than a
  runtime guard.
- **Scale.** This is a major version. `parse-toml.ts` (1301 lines changed on this branch alone),
  `writer.ts`, `to-toml.ts`, and `patch.ts` all move. Phases 0 and 1 are safe and additive; Phase 2 is the
  real work and can sit behind a flag indefinitely.
