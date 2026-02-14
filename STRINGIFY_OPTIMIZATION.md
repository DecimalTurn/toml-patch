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

### P1 — Reduce traversal overhead in `applyWrites()` and `shiftNode()` (High impact, Medium difficulty)

**Problem:** `applyWrites()` does a full AST traversal via `traverse()` and is called 4–5+ times
per stringify. `shiftNode()` similarly traverses entire subtrees on every `insert()` call.
Together these dominate the profile.

**Approach taken:** Three targeted optimizations in `src/writer.ts`:
1. **Dirty tracking for `applyWrites`** — Added a `WeakSet<Root>` (`dirty_roots`) that tracks
   which roots have pending offsets. `applyWrites` returns immediately when the root isn't dirty.
   This skips redundant full traversals when no structural changes occurred between calls.
2. **Early return in `shiftNode` for (0,0) shifts** — The first item inserted into a container
   always has shift (0,0) since generated nodes start at position (1,0). Skipping the traversal entirely.
3. **Fast-path `shiftNode` for leaf nodes and simple KeyValues** — Instead of going through
   the generic `traverse()` with switch dispatch, leaf nodes (String, Integer, Float, Boolean,
   DateTime, Key, Comment) and KeyValues with leaf values are handled inline with direct
   property access. This avoids function call overhead for the most common node types.

**Files:** `src/writer.ts`

- [x] Implemented
- [x] Tests passing (549/549 unit + 855/855 spec)
- [x] Benchmarked — Significant gains across the board:
  - Scalar-heavy benchmarks: +73–85% (from shiftNode leaf fast-path)
  - Inline table/array benchmarks: +14–51% (from dirty tracking skip)
  - Spec example file: +9% (927 → 1,011 ops/sec)
  - Small doc benchmark: +42% (26,871 → 38,149 ops/sec)
  - Overall average: +18% (2,672 → 3,160 ops/sec)

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

### P4 — Replace WeakMap with Map for stringify path ~~(Low-Medium impact, Medium difficulty)~~ **ABANDONED**

**Problem:** Offset storage uses two levels of WeakMap indirection. The profiler shows
`WeakMapLookupHashIndex` + `WeakMapGet` at ~2.9% combined.

**Finding:** Benchmarking showed Map is ~16% **slower** than WeakMap for this use case (860 vs 1,031 ops/sec).
V8 implements WeakMap via hidden properties on key objects, making `.get(key)` essentially a fast
property lookup. Regular Map uses a hash table, which is slower for object keys in this pattern.

- [x] Tested — **Map is slower; WeakMap stays**

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
This allocates a temporary array by spreading the generator, then iterates it again.

**Files:** `src/parse-js.ts`

- [x] Implemented
- [x] Tests passing (549/549 + 855/855)
- [x] Benchmarked — No measurable change on spec example (code path not hit for spec example),
  but avoids unnecessary array allocation for inline table construction.

---

### P7 — Inline `traverse()` in `applyWrites` and `toTOML` (High impact, Medium difficulty)

**Problem:** The generic `traverse()` function uses a visitor pattern that dispatches all 13+ node
types through the same `traverseNode()` function and visitor callbacks. V8's inline caches become
megamorphic (slow) because different node shapes (Document, Table, KeyValue, String, etc.) flow
through the same property access sites. The profiler shows:
- `traverseNode`: 13.8% of ticks (single hottest JS function)
- `LoadIC_Megamorphic`: 11.3% — polymorphic property access
- `KeyedLoadIC_Megamorphic`: 5.3% — polymorphic keyed access
- `LoadICTrampoline_Megamorphic`: 3.2% — more IC misses
- Combined megamorphic overhead: **19.8%** of total ticks

**Approach taken:** Replace generic `traverse()` calls with inline switch/case traversals:

1. **`applyWrites`**: Custom `visitNode()` function with a switch on `node.type`. Each case
   accesses typed properties directly (e.g., `(node as Table).key`, `(node as Table).items`),
   enabling V8 to maintain monomorphic inline caches at each access site.

2. **`toTOML`**: Custom `emitNode()` function with a switch on `node.type`. Each case handles
   both the write operation and child recursion directly. Added `writeSingle()` and `writeChars()`
   fast paths for bracket/comma writes that avoid creating temporary Location objects.

3. **`parseJS`**: Replaced `pipe()` with direct function calls. Avoids rest args array allocation,
   `reduce` callback closure, and wrapper arrow functions.

4. **Removed unused `formatPrintWidth()` call** (currently a no-op stub).

**Files:** `src/writer.ts`, `src/to-toml.ts`, `src/parse-js.ts`

- [x] Implemented
- [x] Tests passing (549/549 unit + 855/855 spec)
- [x] Benchmarked — Significant gains from reduced megamorphic IC misses:
  - Spec example: 1,031 → 1,177 ops/sec (**+14%**)
  - Small doc: 36,581 → 45,738 ops/sec (**+25%**)
  - Hard unicode: 7,806 → 9,185 ops/sec (**+18%**)
  - Nested-1000: 4.93 → 6.61 ops/sec (**+34%**)
  - Full suite average: 3,185 → 3,495 ops/sec (**+10%**)

---

## Profiler Data (V8 `--prof`, 5000 iterations, spec example file)

### Pre-optimization profiler

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

### Post-P1+P2 profiler

| Function | Ticks % | Notes |
|---|---|---|
| `traverseNode` | 13.8% | Generic AST visitor dispatch — **#1 hottest JS function** |
| `LoadIC_Megamorphic` | 11.3% | Megamorphic property access (13+ node shapes) |
| `KeyedLoadIC_Megamorphic` | 5.3% | Megamorphic keyed access |
| `shiftNode` | 3.6% | Position shifting (leaf fast-path helps but generic path still hot) |
| `LoadICTrampoline_Megamorphic` | 3.2% | More IC trampoline misses |
| `shiftStart` (in applyWrites) | 2.9% | Start position shifting in applyWrites |
| `move` (in shiftNode) | 2.7% | Generic move closure in shiftNode |
| `WeakMapLookupHashIndex` | 2.0% | WeakMap lookups (faster than Map per P4 finding) |
| `traverseArray` | 1.6% | Array traversal in generic traverse |
| `insert` | 1.6% | AST insertion |
| `walkObject` | 1.6% | Object → KeyValue generator |
| `WeakMapGet` | 1.6% | WeakMap gets |
| `toTOML` | 1.1% | AST → string emission |
| `ArrayPrototypeSplice` | 1.2% | Array splicing in insert/remove |
| `calculateInlinePositioning` | 1.0% | Inline positioning calc |

> Combined megamorphic overhead: **19.8%** — addressed by P7 (inline traverse).

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

## Progress Summary

| Optimization | Spec Example | Suite Average | Status |
|---|---|---|---|
| Baseline | 935 ops/sec | 2,672 ops/sec | — |
| + P1 (shiftNode/applyWrites) | 1,011 ops/sec (+8%) | 3,160 ops/sec (+18%) | Done |
| + P2 (fast-path write) | ~1,011 ops/sec (neutral) | ~3,160 ops/sec (neutral) | Done |
| + P6 (spread removal) | ~1,031 ops/sec (neutral) | ~3,185 ops/sec (neutral) | Done |
| + P7 (inline traverse) | **1,177 ops/sec (+14%)** | **3,495 ops/sec (+10%)** | Done |
| **Total improvement** | **+26% from baseline** | **+31% from baseline** | |
