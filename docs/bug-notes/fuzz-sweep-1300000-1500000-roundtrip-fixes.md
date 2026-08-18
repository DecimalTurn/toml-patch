# Fuzz sweep 1300000–1500000 — round-trip fixes

## Range

Seeds `1300000` through `1500000` (inclusive), 200001 seeds, `mutationCount` = 3.

## Failures fixed in this sweep

### Seed 1428499 — delete implicit sub-table of an AOT entry

**Symptom:** `patch()` threw `Node not found at .0.-vX`` for a `delete-key`
mutation at path `["", 0, "-vX`"]`.

**Root cause:** The document holds `[[[""]]]` (AOT `""`, entry 0) and a nested
AOT `[[[""."-vX`".q_nh3pjp]]]`, whose key `["", "-vX`", "q_nh3pjp"]` makes
`-vX\`` an *implicit* intermediate table (there is no `["".-vX`"]` section of its
own).  The diff emits the delete at `["", 0, "-vX`"]` — JS-object coordinates
carrying the numeric AOT entry index `0` — but CST keys carry no such index.
`findByPath`'s AOT-scope search then failed because the remaining path
`["-vX`"]` is a *prefix* of the nested AOT's relative key `["-vX`", "q_nh3pjp"]`,
and the remove handler's implicit-key fallback prefix-matched against the raw
(indexed) path, which matches no document-level key — so `findByPath` threw.

**Fix:** The remove handler's implicit-key branch now strips numeric AOT entry
indices from the change path before the prefix sweep.  A numeric segment is an
AOT index when the accumulated path is a document-level `TableArray` key
(inline-array indices, which ARE part of the CST path, never resolve to one).
`stripAotEntryIndices` converts `["", 0, "-vX`"]` → `["", "-vX`"]`, so
`findDocumentItemsByKeyPrefix` finds and removes the `["".-vX`.q_nh3pjp]`
sub-AOT (and its body).  The JS-coordinate path is kept for walking `rawUpdated`
in the materialise-empty-parent fallback, where the numeric index is required.

**Files changed:**
- `src/patch.ts` — `stripAotEntryIndices` helper + use in the implicit-key removal branch.
- `src/__tests__/patch.fuzz.test.ts` — `regression for fuzz seed 1428499`.

## Verification

Re-sweep `1300000..1500000` with the fix: 0 failures.
