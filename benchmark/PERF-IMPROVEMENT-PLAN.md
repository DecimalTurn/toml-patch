# Performance Improvement Plan

**Date:** February 2026
**Branch:** `perf-token`
**Baseline:** Post Phase 1 (tokenizer rewrite) + Phase 2 (single-pass unescaper + binary search findPosition)

## Current CPU Profile (debug build, 6525 samples)

| Function | CPU % | File |
|---|---|---|
| `tokenize` | 15.0% | tokenizer.ts |
| `stringToken` | 11.3% | tokenizer.ts |
| `keyValue` | 7.9% | parse-toml.ts |
| `findPosition` | 7.5% | location.ts |
| `traverseNode` | 6.2% | to-js.ts (via traverse.ts) |
| `walkValue` | 5.0% | parse-toml.ts |
| `inlineArray` | 4.4% | parse-toml.ts |
| `merge` | 4.2% | utils.ts |
| `createLocate` | 4.0% | location.ts |
| `joinKey` | 2.9% | to-js.ts |
| `traverseArray` | 2.7% | traverse.ts |
| `(GC)` | 2.6% | — |
| `validateKey` | 2.3% | to-js.ts |
| `trackNestedInlineTables` | 2.1% | to-js.ts |
| `table` | 1.9% | parse-toml.ts |
| `enter` | 1.7% | traverse.ts |
| `unescapeBasicString` | 1.6% | parse-string.ts |
| `next` / `peek` (Cursor) | 2.2% | cursor.ts |
| `has` | 1.0% | utils.ts |

## Planned Improvements

### Low-complexity (Phase 2b) — Items 1–7

- [x] **#1 — `findLines` charCodeAt** (~1-2% est.)
  Use `charCodeAt` instead of string indexing in `findLines` to avoid temporary string allocations per character.

- [x] **#2 — Cache joinKey in validateKey** (~3-4% est.)
  Pre-compute partial key strings once per `validateKey` call instead of calling `joinKey(prefix.concat(key.slice(0, i)))` in 4+ inner loops.

- [x] **#3 — Push-into instead of merge** (~3% est.)
  Change `walkBlock`/`keyValue` to push directly into the target array instead of returning intermediate arrays that are immediately merged and discarded.

- [x] **#4 — Bare key regex → charCode lookup** (~1-2% est.)
  Replace `/[A-Za-z0-9_-]/.test(char)` per-character checks in `keyValue` and `table` with charCode range checks.

- [x] **#5 — `has()` → `key in object`** (~0.5% est.)
  All objects come from `blank()` (no prototype), so `key in object` is safe and avoids `Object.prototype.hasOwnProperty.call`.

- [x] **#6 — `trackNestedInlineTables` allocation** (~0.5% est.)
  Move `basePath.concat(...)` inside the `if (InlineTable)` branch so array allocation only happens when needed.

- [x] **#7 — Cache `done()` in Cursor** (~0.3% est.)
  Reuse a frozen singleton `{ value: undefined, done: true }` instead of allocating a new object on every call after iterator exhaustion.

### Medium-complexity (Phase 2c) — Items 8–10

- [ ] **#8 — Inline toJS traversal** (~5-7% est.)
  Replace generic `traverse` dispatch with a specialized walk for `toJS` that only handles the 4 node types it cares about.

- [ ] **#9 — Lazy/incremental line index** (~4% est.)
  Build the line-ending index incrementally as the tokenizer scans, instead of a separate upfront `findLines` pass.

- [ ] **#10 — Eliminate unnecessary cloneLocation** (~1% est.)
  Audit which locations are never mutated and share references directly instead of cloning.

### Architectural (Phase 3 — future)

- [ ] **Direct stringify fast-path**
  Skip AST construction for plain `stringify()` when `patch()` semantics aren't needed. Currently 24-37× slower than smol-toml.

## Estimated Total Impact

| Phase | Items | Est. CPU Savings |
|---|---|---|
| Phase 2b (low-complexity) | #1–#7 | ~10-13% |
| Phase 2c (medium-complexity) | #8–#10 | ~10-12% |
| Phase 3 (architectural) | stringify fast-path | Major (stringify only) |
