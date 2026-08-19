# Fuzz sweep 1500000–1750000 — round-trip fixes

## Range

Seeds `1500000` through `1750000` (inclusive), 250001 seeds, `mutationCount` = 3.

## Failures fixed in this sweep

### Seed 1674968 — implicit dotted table collapsed to scalar leaves stale children

**Symptom:** A round-trip mismatch / re-parse failure after collapsing an implicit
nested object to a scalar inside an array-of-tables entry. The patched TOML kept
stale dotted children (for example `""."".ti5o6 = false`) after writing
`""."" = "H3"`, causing duplicate-definition semantics.

**Root cause:** For the edit path `[
  "thqaionj0", "", 0, "", ""
]`, the parent probe (`change.path.slice(0, -1)`) can resolve by *prefix match*
to a dotted `KeyValue` node rather than the true structural container (the AOT
entry). The sibling-removal sweep then scanned the wrong parent, so stale
prefix-extending rows survived.

**Fix:** In the edit path, when `containerParent` is a prefix-matched `KeyValue`,
resolve it to its structural parent before sibling sweeps. This makes prefix
cleanup run against the actual AOT entry and removes stale children correctly.

**Files changed:**
- `src/patch.ts` — resolve prefix-matched `containerParent` to structural parent before sibling sweep.
- `src/__tests__/patch.fuzz.test.ts` — `regression for fuzz seed 1674968`.

### Seed 1657445 — AOT entry structural edit dropped table-shaped replacement tail

**Symptom:** Round-trip mismatch with `..0.rw109` missing in reparsed output after
`change-type at .0.rw109.kjzi` (object/table subtree to scalar). Expected mutated
object kept `rw109.kjzi = 3495.677...`, but patched output dropped that subtree.

**Root cause:** In `handleStructuralEdit`'s AOT-entry branch, the replacement tail
is rebuilt via `parseJS` from the changed segment. For this seed, that tail
renders as a table section (`[rw109]` + `kjzi = ...`), so `tailCst` contains a
`Table` node. The branch only upserted `KeyValue` nodes, so the `Table` payload
was ignored and nothing was reinserted for `rw109.kjzi`.

**Fix:** Extend the AOT-entry structural-edit insertion logic to handle `Table`
nodes by flattening each table row back to dotted `KeyValue`s relative to the
entry (`rw109.kjzi = ...`) and upserting them into the entry.

**Files changed:**
- `src/patch.ts` — flatten table-shaped replacement tails to dotted key-values in AOT structural edits.
- `src/__tests__/patch.fuzz.test.ts` — `regression for fuzz seed 1657445`.

## Verification

Re-sweep `1500000..1750000` with the fixes: 0 failures.
