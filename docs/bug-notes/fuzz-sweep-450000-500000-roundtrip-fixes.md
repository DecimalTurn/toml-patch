# Fuzz sweep 450000–500000 — round-trip fixes

## Range

Seeds `450000` through `500000` (inclusive), 50001 seeds, `mutationCount` = 3.

## Failures fixed in this sweep

### Seed 460447 — table replaced by an array-of-tables drops the second entry

**Symptom:** `patch()` round-trip returned `.jv_c.g5y2632gh.1: extra in got` —
appending a second array-of-tables entry was silently dropped.

**Root cause:** The `change-value` mutation replaced a plain single-bracket
table `[jv_c.g5y2632gh]` with a two-element array, i.e. a **table → AOT** type
change. In `applyChanges` (`src/patch.ts`), the `isTable(existing)` branch
handles this by regenerating a fresh document with
`parseJS({ [lastSegment]: jsValue })`. When `jsValue` is an array of objects,
`parseJS` + `formatTopLevel` renders **each element as its own `[[key]]`
section**, so `freshDoc.items` holds multiple top-level entries. The branch only
grabbed `freshDoc.items[0]` and discarded the rest — dropping every appended
entry (and their nested sub-tables).

**Fix:** After placing entry 0 (`freshKV`), loop over `freshDoc.items[1..]`,
extend each extra `[[key]]` section's key with the parent prefix (reusing the
new `extendSectionKeyInPlace` helper), insert it immediately after the
previously placed entry, and mark it comment-eligible.

**Files changed:**
- `src/patch.ts` — factored `extendSectionKeyInPlace` out of
  `extendSectionKeyWithParentAndReplace`; added the extra-entry insertion loop
  in the `isTable(existing)` branch.
- `src/__tests__/patch.fuzz.test.ts` — added `regression for fuzz seed 460447`.

## Debugging notes

The trigger was subtle because earlier distillation attempts used `[[...]]`
AOT sources; the actual seed has a **single-bracket `[jv_c.g5y2632gh]` table**
replaced by an array (table → AOT). The seed also contains a huge integer
(`13033900000000309534`), so manual `parse()`+`patch()` with default settings
throws "Do not know how to serialize a BigInt" — use `parse(src, { integersAsBigInt:
false })` or the `fuzzOne` harness for reproduction.
