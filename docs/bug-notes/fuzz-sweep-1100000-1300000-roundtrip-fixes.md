# Fuzz sweep 1100000–1300000 — round-trip fixes

## Range

Seeds `1100000` through `1300000` (inclusive), 200001 seeds, `mutationCount` = 3.

## Failures in this sweep

### Seed 1137525 — remove leaps past interleaved adds on reorder (OPEN, documented)

**Symptom:** `patch()` round-trip returned:

```
.gayh_v0z.nu3hrhnv5.nea32.6: 77741.96689 !== 16654.71209
```

The surplus-duplicate `16654.71209` was left in place and its neighbour
`77741.96689` removed instead.

**Root cause:** The diff emitted `Remove[1], Add[2], Add[3], Remove[6]`.
`reorder()` (in `src/patch.ts`) moved the higher-index `Remove[6]` in front of
the two interleaved Adds, so it was applied against the **original** array —
index 6 is `77741.96689`, not `16654.71209`.

This is a coordinate-space inconsistency, not a one-line bug: a Remove's index
is a *sequential-application* index when it stays put (a single remove never
gets reordered, e.g. seeds 3093/761) but a *source* index when `reorder()` moves
it before interleaved Adds.  Three attempted fixes all regressed neighbouring
seeds on re-sweep and were reverted:

- `removedBefore--` unconditional in the diff (commit `d17e606`): regressed
  seeds 761/3093 — the negative net shift is wrong for the overflow loop when a
  Move has also scrambled the sim→source mapping.
- guarding `reorder()` against crossing any Add: regressed seed 50448
  (`Remove[0] Edit[1] Remove[4]` must still cross the length-preserving Edit to
  land descending).
- guarding `reorder()` against crossing a same-context Add/Move: regressed
  seeds 84522 and 473477 (nested `Add[6,2,3]`/`Add[5,5]` in a DIFFERENT array
  context must not stop the scan).

A correct fix must make Remove indices consistently source coordinates — the
diff's `removedBefore` has to account for Adds AND Moves, and `reorder()` has to
apply all Removes first.  That is a larger change than this sweep warranted.

**Status:** left open.  A distilled `.fails` regression test is in
`src/__tests__/patch.fuzz.test.ts` (`regression for fuzz seed 1137525`) with the
full analysis in its comment.

## Failures fixed in this sweep

### Seed 1285105 — AOT collapsed to a static array leaves a non-contiguous sub-table

**Symptom:** re-parse failed with "Cannot add to static array".

**Root cause:** A top-level `[[""]]` AOT and a later non-contiguous sub-table
`["".c47eko_.bog8_vy3w]` (separated by an unrelated `[other]`) share the `""`
key prefix.  Collapsing `""` to a static (non-object) array dropped only the
AOT entries with the EXACT key, leaving the prefix-extended sub-table behind —
which re-parse rejects.

**Fix:** In the `isTableArray(existing)` branch of `applyChanges`, when the
whole AOT collapses to a static array, match the sibling sections to drop by
**key prefix** (`findDocumentItemsByKeyPrefix`) rather than exact key equality.

**Files changed:**
- `src/patch.ts` — prefix-match sibling sections when an AOT collapses to a static array.
- `src/__tests__/patch.fuzz.test.ts` — added `regression for fuzz seed 1285105`.

## Debugging notes

Minimal repros:

```toml
# 1137525
nea32 = [2005-09-17T02:03:12.077192Z, inf, false, "$R0fV=AR?~81OAaNiQ", 2018-07-23T02:49:32.062984Z, 16654.71209, 77741.96689, -8.82e-21, "/E^T8VttWr3Lq"]
```

with `obj.nea32 = [date, false, [nested], false, str, date2, 77741.96689, -8.82e-21, str2]`.
The diff emits `Remove[1], Add[2], Add[3], Remove[6]`; `Remove[6]` must stay
after the two Adds.

```toml
# 1285105
[[""]]
a = 1

[other]
b = 2

["".c47eko_.bog8_vy3w]
c = 3
```

with `obj[""] = [[1, 2]]`. The `["".c47eko_.bog8_vy3w]` section must be
dropped alongside the AOT.
