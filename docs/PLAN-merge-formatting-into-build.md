# Plan: Merge formatting into the build pass (Suggestion 6)

## Problem

`stringify()` currently builds the CST in two phases:

1. **Build**: `walkObject` creates every nested object as an `InlineTable` and every array as an `InlineArray`. All top-level key-values are flat KV nodes with inline values.
2. **Restructure**: `formatTopLevel` + `formatNestedTablesMultiline` convert inline tables back into `[table]` / `[[array]]` sections by removing inline KVs and inserting Table/TableArray nodes. Each conversion triggers `remove` + `insert` + `applyWrites` — a full CST traversal.

Profiling shows `applyWrites` (specifically `visitNode`) at **14%** of stringify time for typical documents and `shiftNode` at **11%** — both dominated by the restructuring phase's traversal cycles. A document with 23 tables (e.g. the spec example) triggers 23 remove+insert cycles, each marking `dirty_roots` and causing a full `applyWrites` traversal of the document.

## Plan

Change `walkObject` to emit `Table`/`TableArray` nodes directly at the correct nesting depth, bypassing the entire restructuring phase.

### Step 1: Determine structure during walk

Currently `walkObject` yields flat `KeyValue` nodes. The new version needs to track two things:

- **Nesting depth** of each key path (e.g. `owner.name` → depth 1)
- **`inlineTableStart` threshold** from `TomlFormat` — tables at depth < threshold become sections, tables at depth ≥ threshold stay inline

A helper `walkValueAtDepth(keyPath, value, depth, format)` would emit the right node type at each level.

### Step 2: Emit Table nodes for depth < inlineTableStart

When `depth < format.inlineTableStart`:

- Create a `Table` node (or `TableArray` for arrays)
- Set its key to the dotted path (e.g. `[owner.details]`)
- Walk the object's keys as flat key-values inside the table
- Insert the Table into the document at the correct position

This is what `formatTable` currently does as a post-processing step — we'd do it inline.

### Step 3: Keep InlineTable for depth >= inlineTableStart

When `depth >= format.inlineTableStart`, keep the current behavior — create an `InlineTable` value for the key. No restructuring needed.

### Step 4: Handle array-of-tables

Arrays of objects (`[[products]]`) need special handling. When a top-level key maps to an array of objects, each element becomes a `TableArray` entry. Currently `formatTopLevel` → `formatTableArray` handles this. The new code would emit `TableArray` nodes directly from `walkObject`.

### Step 5: Handle implicit table creation

Dotted keys like `a.b.c = 1` implicitly create parent tables `[a]` and `[a.b]`. The walker needs to track which parent tables were already created to avoid duplicates.

### Step 6: Remove formatTopLevel / formatNestedTablesMultiline

Once `walkObject` emits the correct structure, `formatTopLevel` and `formatNestedTablesMultiline` become no-ops and can be removed from `parseJS`.

## Estimated impact

| Metric | Current | After | Source of gain |
|--------|---------|-------|---------------|
| `applyWrites` traversals per stringify | 3–5 (initial + formatTopLevel + per-inline-table) | 1 (initial only) | Eliminates `formatTopLevel`'s remove+insert cycles |
| `shiftNode` calls from `formatEmptyLines` | ~N (one per item) | ~N (same) | `formatEmptyLines` still runs, but on fewer items |
| `dirty_roots` marks/clears | ~3–5 | 1 | No restructuring means no dirtying |
| Code removed | — | ~150 lines (`formatTopLevel`, `formatTable`, `formatTableArray`, `formatNestedTablesMultiline`) | |

Based on the profile where `visitNode` (14%) + `traverseNode` (12%) + `shiftNode` (11%) + `insert` (8%) = **45%** of stringify time comes from the restructuring machinery, eliminating it could yield **30–40% improvement** on documents with many tables (the spec example, inline-table benchmarks). Documents with flat structures (e.g. the 40kb string benchmark) would see minimal change since `formatTopLevel` is a no-op for them.

## Risk

- **Ordering**: Tables must appear in the same order as the original object keys. JavaScript object key iteration order is deterministic (insertion order for string keys), so this is safe.
- **Implicit parents**: Dotted keys require creating intermediate tables. The logic must track which parent tables exist to avoid creating `[a]` twice if both `a.x` and `a.y` exist.
- **InlineTableStart = 0**: All tables should be inline — the current code handles this by skipping `formatTopLevel`. The new code would need to handle it by always emitting InlineTable values.
- **Backward compatibility**: The output TOML must be identical to the current two-phase approach. Extensive test coverage exists for this.

## Effort estimate

Medium-high. The restructuring logic is ~150 lines of well-tested code handling edge cases (dotted keys, array-of-tables, implicit parents, comment positioning). Replicating this correctly in the build pass requires careful testing against all existing `formatTopLevel` / `formatNestedTablesMultiline` test cases.
