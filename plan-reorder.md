# Plan: Key Reordering Feature

## Complexity: Medium

The infrastructure is partially in place, but there are a few non-trivial problems to solve.

---

## What already exists

- `diff.ts` already has a `Move` change type (`{ type: 'Move', path, from: number, to: number }`) used for arrays.
- `patch.ts` `applyChanges` already handles `isMove(change)` — it does a `remove` + `insert` at the new index.
- `compareArrays` already emits `Move` changes when it detects a reorder. We need the same for `compareObjects`.

---

## The plan

### Step 1 — Detect key order changes in `compareObjects` (`diff.ts`)

After the existing Add/Edit/Remove/Rename detection, compare the relative order of **surviving keys** (present in both before and after with the same value). Use an algorithm similar to `compareArrays`: walk `after_keys` in order; if a surviving key is out of place relative to a simulated "current" state of `before_keys`, emit a `Move` with numeric `from`/`to` indices (position within the parent's key list).

### Step 2 — Fix the AST index mapping in `applyChanges` (`patch.ts`)

This is the trickiest part. The existing `Move` handler indexes into `parent.items` directly, but for a `Table` or `Document`, `.items` mixes KV pairs, blank lines, comments, etc. — so the JS key index ≠ the `.items` index.

Need a helper `kvIndexToItemsIndex(parent, kvIndex)` that counts only `KeyValue` children. When handling a key `Move`:
1. Collect the `KeyValue` nodes from `parent.items` (filtering out comments/whitespace).
2. Use `from` to find the KV node to move.
3. Use `to` to compute the correct `.items` insertion index relative to the surrounding KV nodes.

### Step 3 — Handle table-level vs inline-table-level moves

- **Regular `[table]`**: parent is a `Table` or `Document`. Uses the KV index mapping from Step 2.
- **Inline tables** (`{ a = 1, b = 2 }`): parent is an `InlineTable`. Items are `InlineItem` wrappers. The existing array `Move` handler already works for `WithItems` containers, so this may need minimal changes.

### Step 4 — Update `reorder()` in `patch.ts`

The `reorder()` function currently sorts `Remove` changes to avoid index corruption. It may need to be extended to order `Move` changes relative to `Remove`/`Add` operations when both occur in the same object.

### Step 5 — Enable the skipped tests

Change `test.skip` → `test` for the 4 tests (3 in multiline inline table + 1 in regular table).

---

## Risks / edge cases

- Keys with comments attached — moving a KV should carry its leading comment with it.
- Mixed changes in the same object (e.g., add + reorder at the same time) — the simulated `before_keys` walk must account for adds/removes first.
- Table arrays (`[[section]]`) — these appear as separate top-level Document items, not as KV children of a table. Reordering them would be a separate problem and could be left out of scope initially.
