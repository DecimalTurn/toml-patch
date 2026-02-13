# Stringify Performance Optimization Plan

This document tracks optimization opportunities identified for the `stringify()` pipeline.
It is meant to be temporary and removed once the optimization work is complete.

## Background

Benchmarks (spec example file, `0A-spec-01-example-v0.4.0.toml`) show stringify at ~935 ops/sec
compared to smol-toml (~35,000) and @iarna/toml (~8,700). While toml-patch intentionally does
more work (format-preserving AST with comment support), profiling reveals several algorithmic
inefficiencies where the same work is repeated unnecessarily.

## Pipeline Overview

```
stringify(value, format?)
  └─ resolveTomlFormat()
  └─ parseJS(value, fmt)          ← Phase 1: JS → AST
  │    ├─ reorderElements()
  │    ├─ walkObject() → insert() each KeyValue
  │    ├─ applyWrites(document)
  │    └─ pipe(
  │         formatTopLevel()       ← applyWrites() again
  │         formatNestedTables()   ← applyWrites() again
  │         formatPrintWidth()
  │         formatEmptyLines()     ← shiftNode() per item
  │       )
  └─ toTOML(document, fmt)        ← Phase 2: AST → string
       ├─ traverse() + write()
       └─ tab post-processing
```

## Identified Bottlenecks

### P1 — Batch/defer `applyWrites()` (High impact, Medium difficulty)

**Problem:** `applyWrites()` does a full AST traversal via `traverse()` and is called 4–5+ times
per stringify:
- Once in `parseJS` after inserting all KeyValues into the document
- Once per each inline array/table during `walkInlineArray`/`walkInlineTable`
- Once in `formatTopLevel()`
- Once in `formatNestedTablesMultiline()`
- Once more inside `formatTable()` and `formatTableArray()` helpers

Each call traverses the entire subtree to apply accumulated offsets.

**Idea:** Batch or defer offset application so there is only a single traversal at the end,
or at most one per major phase boundary.

**Files:** `src/parse-js.ts`, `src/writer.ts`, `src/toml-format.ts`

- [ ] Implemented
- [ ] Tests passing
- [ ] Benchmarked

---

### P2 — Fast-path single-line `write()` (Medium impact, Easy difficulty)

**Problem:** The `write()` function in `to-toml.ts` calls `raw.split(BY_NEW_LINE).filter()` on
every node, creating 2 temporary arrays per call. The profiler shows `RegExpSplit` at ~1.1% of
ticks. The vast majority of nodes are single-line, so the split is pure overhead.

**Idea:** Add an early return for single-line content:
```typescript
// Fast path for single-line content (most nodes)
if (!raw.includes('\n') && !raw.includes('\r')) {
  const line = getLine(lines, loc.start.line);
  const before = line.length < loc.start.column
    ? line.padEnd(loc.start.column, SPACE)
    : line.substring(0, loc.start.column);
  const after = line.substring(loc.end.column);
  lines[loc.start.line - 1] = before + raw + after;
  return;
}
```

**Files:** `src/to-toml.ts`

- [x] Implemented
- [x] Tests passing (549/549)
- [x] Benchmarked — No measurable change on spec example (927 ops/sec, within noise of 935 baseline). The `toTOML` phase is a small fraction of total stringify time; the bottleneck is in Phase 1 (AST construction). The optimization is still correct and reduces allocations — it will matter more as the bigger bottlenecks (P1/P3) are resolved.

---

### P3 — Defer `shiftNode()` positions (High impact, Hard difficulty)

**Problem:** Every call to `insert()` triggers `shiftNode()`, which traverses the entire subtree
of the inserted node. `generateKeyValue()` also calls `shiftNode()` on the value. Combined with
N key-value insertions, this is O(N × average-subtree-size) work. The profiler shows `shiftNode`
at ~2.7% of total ticks.

**Idea:** Generate nodes with placeholder/relative positions and do a single absolute positioning
pass at the end. This is tightly coupled with P1 since both involve deferring AST location work.

**Files:** `src/writer.ts`, `src/generate.ts`

- [ ] Implemented
- [ ] Tests passing
- [ ] Benchmarked

---

### P4 — Replace WeakMap with Map for stringify path (Low-Medium impact, Medium difficulty)

**Problem:** Offset storage uses two levels of WeakMap indirection:
```
WeakMap<Root, WeakMap<TreeNode, Span>>
```
Every `insert`, `remove`, and `applyWrites` call goes through `getEnterOffsets(root)` /
`getExitOffsets(root)`, doing two WeakMap lookups. The profiler shows `WeakMapLookupHashIndex` +
`WeakMapGet` at ~2.9% combined. WeakMap is designed for GC-sensitive scenarios — not needed here
since the AST is freshly generated and discarded immediately after serialization.

**Idea:** For the `stringify` code path, use a regular `Map` or direct node properties instead
of WeakMap. This may require a separate code path or a configurable storage backend.

**Files:** `src/writer.ts`

- [ ] Implemented
- [ ] Tests passing
- [ ] Benchmarked

---

### P5 — Fold `formatEmptyLines` into toTOML emission (Medium impact, Medium difficulty)

**Problem:** `formatEmptyLines()` iterates all document items and calls `shiftNode()` on each one.
Since `shiftNode` itself traverses the subtree, this is another O(total-nodes) pass over the AST.

**Idea:** Instead of adjusting AST positions, handle empty-line collapsing during the `toTOML`
output phase by adjusting line coordinates on the fly during emission.

**Files:** `src/toml-format.ts`, `src/to-toml.ts`

- [ ] Implemented
- [ ] Tests passing
- [ ] Benchmarked

---

### P6 — Inline generator spread in `walkInlineTable` (Low impact, Easy difficulty)

**Problem:** In `walkInlineTable()`:
```typescript
const items = [...walkObject(value, format)];
```
This allocates a temporary array by spreading the generator, then iterates it again. The generator
could be consumed directly.

**Idea:** Replace with direct iteration:
```typescript
for (const item of walkObject(value, format)) {
  const inline_table_item = generateInlineItem(item);
  insert(inline_table, inline_table, inline_table_item);
}
```

**Files:** `src/parse-js.ts`

- [ ] Implemented
- [ ] Tests passing
- [ ] Benchmarked

---

## Profiler Data (V8 `--prof`, 5000 iterations, spec example file)

| Function | Ticks % | Notes |
|---|---|---|
| Traverse/visitor (multiline string check) | 13.3% | Hot path in `applyWrites` + `shiftNode` |
| `LoadIC_Megamorphic` | 10.3% | Polymorphic property access from varied node shapes |
| `KeyedLoadIC_Megamorphic` | 5.6% | Same root cause as above |
| Inline positioning calculation | 2.9% | `calculateInlinePositioning` in writer |
| `shiftNode` | 2.7% | Full subtree traversal per insert |
| `WeakMapLookupHashIndex` + `WeakMapGet` | 2.9% | Double WeakMap indirection for offsets |
| `RegExpSplit` | 1.1% | `raw.split(BY_NEW_LINE)` in `write()` |
| `ArrayPrototypeSplice` | 1.1% | `items.splice()` in insert/remove |

> Note: `LoadIC_Megamorphic` / `KeyedLoadIC_Megamorphic` are V8 inline cache misses caused by
> the visitor pattern touching 13+ node types through the same functions. Reducing the total
> number of traversals (P1, P3, P5) directly reduces how often these are hit.

## Benchmark Baseline (pre-optimization)

Capture current numbers before starting work:

```
stringify (spec example): ~935 ops/sec (~1.07 ms/op)
```

Competitors for reference:
```
smol-toml:       ~35,035 ops/sec
@iarna/toml:     ~8,685 ops/sec
toml-edit-js:    ~25,060 ops/sec
```
