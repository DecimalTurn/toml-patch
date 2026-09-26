# Plan: `commentOwnership` option

Evaluation of adding a `commentOwnership` patch option that defaults to `true` and can be
turned off. Line numbers below are from `b59bc20` (`dev-multiline`) and will drift.

## Verdict

Feasible, and the change is well bounded.

Comment ownership is not behind an option today. `patch()` calls into
`src/comment-ownership.ts` unconditionally at about 20 places. Two facts make an opt-out
straightforward:

1. `removeMember()` in `src/comment-ownership.ts` already ends with a plain
   `remove(root, parent, member)` when the ownership model does not apply. That plain removal is
   the legacy behavior. Before ownership landed in `46476c5`, `patch.ts` had zero `removeMember`
   references and every deletion called `remove()` directly.
2. Every deletion call site that has to respect the flag already has `format` in scope. They live
   in `applyChanges` closures or in `handleStructuralEdit`, and both take `format`.

For deletions, "disable" means routing the call back to the plain `remove()` primitive, which is
exactly what the pre-ownership code did. The inline-move path is different and must not be swapped
wholesale. `moveInlineElement()`'s multiline branch does more than carry comments: it flushes
pending offsets, restores descendant columns and realigns the tail. Plain `remove()` plus
`insert()` reintroduces the corruption that `comment-ownership-inline.test.ts` documents for
ownership-unaware moves. Disabling ownership there means keeping the structural move and flush
logic and making only the comment detach/reattach steps conditional, or adding a separate
legacy-safe move path with its own regression tests.

## Option plumbing

Add `commentOwnership?: boolean` to `TomlFormat`, default `true`, patch only. This mirrors
`updateOrder`:

- `DEFAULT_COMMENT_OWNERSHIP = true` constant.
- Field declaration and doc block in `src/toml-format.ts`.
- Constructor parameter plus assignment. Append it at the end of the positional list, after
  `multilineArray`. `TomlFormat` is exported and `indentWidth` is the 11th argument, with
  `multilineTable` and `multilineArray` following it, so inserting `commentOwnership` beside
  `updateOrder` reinterprets existing positional callers' arguments and can silently reset
  indentation. Add a regression test with a positional constructor call that passes `indentWidth`.
  Accepting the option only through the partial-object path is the other backward-compatible
  choice.
- `isBool` validator in `validateFormatObject`.
- Merge line in `resolveTomlFormat`.
- Reset to the default in `autoDetectFormatWithCst`. The existing document says nothing about
  intent, so the option is not auto-detectable. `updateOrder` is handled the same way around line
  752.
- `stringify` accepts the field and ignores it, like `updateOrder`.

About 60 to 80 lines. `src/comment-ownership.ts` needs no changes if the flag is checked at the
call sites.

## Behavior gating in `src/patch.ts`

Call sites that must branch on `format.commentOwnership`:

- 19 `removeMember(...)` calls: lines 2047, 2140, 2234, 2323, 2383, 2426, 2529, 2565, 2700, 2731,
  2737, 2794, 2998, 3030, 3056, 3061, 3960, 3970, 4673.
- 1 `moveInlineElement(...)` call: line 3455. Keep its structural machinery and make only the
  comment detachment/reattachment conditional, per the Verdict. This is not a one-line swap.
- `applyKeyOrderMoves(...)` at line 3826, which reaches `resolveSlots` and
  `normalizeSectionComments` in `update-order.ts`. See the chosen contract below: this call is not
  gated by `commentOwnership` in v1.

All sites have `format` in scope except `removeSiblingsExtendingPrefix` at line 4655, which needs
`format` (or a boolean) threaded through. It has two callers, both inside `applyChanges`, so that
is cheap.

Two workable shapes:

- Add one local wrapper in `patch.ts` that picks plain `remove()` when the flag is off, and swap
  the 19 deletion calls to it. Grep to confirm no `removeMember` call escapes. The
  `moveInlineElement` call needs its own conditional inside the function, not a wrapper.
- Thread a `commentOwnership = true` parameter into `removeMember` and `moveInlineElement` so the
  compiler forces every call site to pass it. More mechanical edits, but TypeScript catches a
  missed site.

For the deletion sites this is about 100 to 150 lines. The `moveInlineElement` change is separate
and larger because the comment steps are interleaved with the offset and column bookkeeping.

## Chosen contract

`commentOwnership: false` disables comment attachment in the deletion paths (`removeMember`) and
in inline element moves (`moveInlineElement`). It does not change `updateOrder` section-level
reordering.

`applyKeyOrderMoves` relocates whole slots, and a member's comment run is physically contiguous
with it in the items array, so "reorder but leave the comments behind" is not a natural operation
there. Detaching comments from a moved slot needs its own design and its own tests. v1 leaves
`applyKeyOrderMoves` untouched: with `updateOrder: true` and `commentOwnership: false`, a
reordered section still moves its contiguous comment run. Gate `applyKeyOrderMoves` only if a
later version implements non-carrying reorder.

The test matrix follows this contract: opt-out cases cover deletion and inline moves, plus one
case pinning that `updateOrder: true` with `commentOwnership: false` keeps the slot-move behavior.

## One caveat about "off"

Ownership off does not mean comments are never touched. `writer.remove()` still does its own
same-line trailing comment absorption and orphaned comment cleanup in the plain path. Expected
outputs in the new tests must match the real legacy primitive, not an ideal. Exact legacy
snapshots can be recovered from git history, from the pre-`46476c5` versions of the fixtures.

## Tests

Ownership behavior today is pinned by 45 tests in `comment-ownership.test.ts`, 33 in
`comment-ownership-inline.test.ts`, and 46 in `update-order.test.ts`, all with the default on.

The new work is an opt-out suite that mirrors those fixtures at `{ commentOwnership: false }` and
asserts the legacy leave-behind output: root key-value removal, `[table]` removal,
`[[array-of-tables]]` entry removal, table body row removal, multiline inline array and table
element removal, and the `updateOrder` interplay. Roughly 30 to 50 cases, 400 to 700 lines.

Output fixtures alone cannot catch a miswired option, since a wrongly plumbed value would still
produce default output. Add wiring tests in `src/__tests__/toml-format.test.ts` next to the
existing `updateOrder` wiring block (line 777):

- default is `true` when the option is unset
- explicit `true` and `false` are accepted, and a non-boolean throws
- `resolveTomlFormat` merges the value over the fallback and keeps the fallback when unset
- the value survives the partial-object path and the appended positional constructor argument,
  with a case pinning that `indentWidth` still occupies the 11th position
- `autoDetectFormatWithCst` resolves it to the default `true`, mirroring the "always resolves to
  false" test for `updateOrder`
- `stringify` accepts the field and its output is byte-identical to omitting it

The default suites stay green untouched because the default does not change. The risk is the
disabled path, which nothing exercises today while `patch.ts` has been tuned for years with
ownership on. That path deserves its own fuzz coverage. `src/__tests__/fuzz-patch.ts` randomizes a
format config, but `src/__tests__/inspect-fuzz-seed.ts` has its own copy of `randomTomlFormat`
(line 31) and the two are documented as companions. Add the `commentOwnership` draw to both
generators with the same draw order, or seed inspection diverges from the fuzz run and stops
reproducing failures.

## Cost

| Piece | Size | Effort |
| --- | --- | --- |
| Option plumbing in `toml-format.ts` plus doc references | 60 to 80 lines | half a day |
| Deletion gating in `patch.ts` | 100 to 150 lines across 19 sites | one day |
| `moveInlineElement` conditional comment steps | interleaved with offset bookkeeping | half to one day |
| Option wiring tests in `toml-format.test.ts` | 8 to 12 cases | half a day |
| Opt-out output suite | 30 to 50 cases, 400 to 700 lines | one to two days |
| Fuzz config in both generators plus sweep under `false` | small plus runtime | half to one day |
| Docs (`Comment-Ownership.md`, README, CHANGELOG) | about 40 lines | small |

Realistic total for a careful, tested implementation: four to six working days.

A narrower v1 (option plumbing, deletion gating, the `moveInlineElement` comment conditional,
15 to 20 mirror tests, no fuzz) is closer to two to three days. It ships a disabled path that has
not been fuzz validated, which is the main risk given how much of `patch.ts` assumes ownership is
on.

## Risks

- The disabled path revives legacy behaviors that the rest of `patch.ts` is no longer tuned for.
  Writer and comment alignment interactions could misplace or duplicate comments. Mitigation:
  dedicated fuzz config plus mirror tests.
- Section reordering stays out of scope for the opt-out. With `updateOrder: true` and
  `commentOwnership: false`, a reordered section still carries its contiguous comment run.
  Implementing non-carrying reorder is separate work.
- The `TomlFormat` positional constructor is already long. Appending at the end keeps the
  existing contract, but the list keeps growing. Moving to an options object is a separate
  change.
- `docs/Comment-Ownership.md` describes ownership as unconditional for `patch()` removals and
  reorders. It must be updated for the opt-out, including the chosen `updateOrder` and
  array-of-tables behavior, or the public contract contradicts the option.
