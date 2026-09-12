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
2. Every call site that has to respect the flag already has `format` in scope. They live in
   `applyChanges` closures or in `handleStructuralEdit`, and both take `format`.

So "disable" means routing deletions back to plain `remove()` and inline moves back to plain
remove plus insert. No new removal machinery is needed.

## Option plumbing

Add `commentOwnership?: boolean` to `TomlFormat`, default `true`, patch only. This mirrors
`updateOrder`:

- `DEFAULT_COMMENT_OWNERSHIP = true` constant.
- Field declaration and doc block in `src/toml-format.ts`.
- Constructor positional parameter plus assignment.
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
- 1 `moveInlineElement(...)` call: line 3455.
- `applyKeyOrderMoves(...)` at line 3826, which reaches `resolveSlots` and
  `normalizeSectionComments` in `update-order.ts`.

All sites have `format` in scope except `removeSiblingsExtendingPrefix` at line 4655, which needs
`format` (or a boolean) threaded through. It has two callers, both inside `applyChanges`, so that
is cheap.

Two workable shapes:

- Keep the exported functions as they are and add one local wrapper in `patch.ts` that picks plain
  `remove()` when the flag is off. Swap the 19 calls to the wrapper, gate the move and reorder
  calls, and grep to confirm no `removeMember` call escapes.
- Thread a `commentOwnership = true` parameter into `removeMember` and `moveInlineElement` so the
  compiler forces every call site to pass it. More mechanical edits, but TypeScript catches a
  missed site.

Either way this is about 100 to 150 lines of mechanical edits.

## Semantic decision

`updateOrder` reordering in `update-order.ts` moves whole slots. A comment run and its member are
contiguous in the items array, so "reorder but leave the comments behind" is not a natural
operation there. Pick one and document it:

- `commentOwnership: false` disables comment carrying on deletion and inline moves only. Section
  reorders under `updateOrder: true` still move slots as units.
- `commentOwnership: false` also suppresses `applyKeyOrderMoves` entirely.

The first option is cheaper. The second is a one line gate plus documentation.

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

The default suites stay green untouched because the default does not change. The risk is the
disabled path, which nothing exercises today while `patch.ts` has been tuned for years with
ownership on. That path deserves its own fuzz coverage. `src/__tests__/fuzz-patch.ts` already
randomizes a format config, so add `commentOwnership: false` as one of the rolled combinations and
run sweeps.

## Cost

| Piece | Size | Effort |
| --- | --- | --- |
| Option plumbing in `toml-format.ts` plus doc references | 60 to 80 lines | half a day |
| Call-site gating in `patch.ts` | 100 to 150 lines across 21 sites | one day |
| `updateOrder` interplay, decision and gate | small with option one | half a day |
| Opt-out test suite | 400 to 700 lines | one to two days |
| Fuzz config plus sweep under `false` | small plus runtime | half to one day |
| Docs and CHANGELOG | about 30 lines | small |

Realistic total for a careful, tested implementation: three to five working days.

A narrower v1 (option plumbing, deletion and move gating, 15 to 20 mirror tests, no fuzz,
`updateOrder` interplay documented as a limitation) is closer to one and a half to two days. It
ships a disabled path that has not been fuzz validated, which is the main risk given how much of
`patch.ts` assumes ownership is on.

## Risks

- The disabled path revives legacy behaviors that the rest of `patch.ts` is no longer tuned for.
  Writer and comment alignment interactions could misplace or duplicate comments. Mitigation:
  dedicated fuzz config plus mirror tests.
- `updateOrder` interplay needs an explicit decision. Documenting it is cheap, implementing
  "reorder without carrying comments" is not.
- The `TomlFormat` positional constructor is already long. Adding a field continues that. Keeping
  the change consistent with the existing options is probably worth more than fixing the
  constructor now.
