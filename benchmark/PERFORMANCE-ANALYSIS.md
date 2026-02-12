# Performance Analysis: toml-patch vs smol-toml

**Date:** February 2026  
**Method:** V8 CPU profiling via `node:inspector/promises`, 5000+ iterations per file  
**Files profiled:** iarna-toml benchmark suite (43 bytes to 20KB inputs)

## Performance Gap

### Parse

| Benchmark | toml-patch (ms) | smol-toml (ms) | Ratio |
|---|---|---|---|
| Small inline array (43 chars) | 0.137 | 0.028 | **4.8×** |
| Spec example v0.4.0 (5.3KB) | 1.658 | 0.185 | **9.0×** |
| Inline arrays ×1000 (13KB) | 6.137 | 0.326 | **18.8×** |
| Inline tables ×1000 (20KB) | 9.151 | 1.241 | **7.4×** |

### Stringify

| Benchmark | toml-patch (ms) | smol-toml (ms) | Ratio |
|---|---|---|---|
| Small inline array (43 chars) | 0.216 | 0.012 | **18×** |
| Spec example v0.4.0 (5.3KB) | 2.152 | 0.060 | **36×** |
| Inline arrays ×1000 (13KB) | 10.292 | 0.351 | **29×** |
| Inline tables ×1000 (20KB) | 17.828 | 0.615 | **29×** |

> **Context:** toml-patch builds a full AST with source locations for every node (needed for `patch()` functionality). smol-toml parses directly to JS objects. Some overhead is inherent and expected — but the current gap is larger than it should be.

## CPU Profile Breakdown (Parse)

Profiled with an unminified build (`rollup` without `terser`) to get real function names.

| Function | CPU % | Source File |
|---|---|---|
| `string` (tokenizer) | 19.4% | `tokenizer.ts` |
| `unescapeLargeUnicode` | 15.1% | `parse-string.ts` |
| `tokenize` (main loop) | 10.4% | `tokenizer.ts` |
| `(anonymous)` / `utf16Iterator` | 9.8% | `cursor.ts` |
| `createLocate` | 2.4% | `location.ts` |
| `walkValue` | 3.0% | `parse-toml.ts` |
| `inlineArray` | 2.9% | `parse-toml.ts` |
| `comment` | 2.8% | `tokenizer.ts` |
| `peek` | 2.5% | `cursor.ts` |
| `merge` | 2.1% | `utils.ts` |
| `traverseNode` | 2.0% | `traverse.ts` |
| `next` | 1.7% | `cursor.ts` |
| `escapeTabsForJSON` | 1.4% | `parse-string.ts` |
| `table` | 1.4% | `parse-toml.ts` |
| `validateKey` | 1.3% | `to-js.ts` |
| `joinKey` | 1.3% | `to-js.ts` |
| Other (< 1% each) | ~22% | various |

### Grouped by subsystem

| Subsystem | CPU % | Notes |
|---|---|---|
| **Tokenizer** | **~38%** | `tokenize` loop + `string` + `comment` + `specialCharacter` + `checkThree` |
| **String processing** | **~17%** | `unescapeLargeUnicode` + `escapeTabsForJSON` + `parseString` |
| **Character iteration** | **~14%** | `utf16Iterator` + `peek` + `next` (Cursor) |
| **Location tracking** | **~5%** | `createLocate` + `findPosition` |
| **AST → JS conversion** | **~5%** | `traverseNode` + `traverseArray` + `validateKey` + `joinKey` |
| **TOML parser** | **~9%** | `walkValue` + `inlineArray` + `table` + `keyValue` |
| **Other** | **~12%** | GC, misc |

## Root Causes (Ranked by Impact)

### 1. Character-by-character generator iteration (~14% CPU)

**Location:** `cursor.ts` → `utf16Iterator`

```typescript
function* utf16Iterator(str: string): Generator<string, void, unknown> {
  for (let i = 0; i < str.length; i++) {
    yield str[i];
  }
}
```

The entire input string is iterated character-by-character through a generator. Each `yield` creates an `IteratorResult` object (`{ value, done }`). For a 20KB file, that's ~20,000 object allocations just for iteration — before any parsing happens.

The `Cursor` class then wraps this with `next()` / `peek()` method calls that add further overhead.

**Fix:** Replace the generator + Cursor with direct index-based scanning in the tokenizer (`input[index]` / `input.charCodeAt(index)`). Eliminate the character-level iterator entirely.

**Expected improvement:** ~14% of parse CPU eliminated.

---

### 2. Multi-pass string unescaping (~17% CPU)

**Location:** `parse-string.ts` → `unescapeLargeUnicode`

Every double-quoted string goes through **7 sequential passes**:

1. Escape validation regex scan (`/\\(.)/g`)
2. `\uXXXX` surrogate validation regex scan
3. `\xHH` replacement via `String.replace`
4. `\e` replacement via `String.replace`
5. `\UXXXXXXXX` replacement via `String.replace`
6. Tab escaping for JSON (`escapeTabsForJSON`)
7. Final `JSON.parse("...")` to resolve standard escapes

Additionally:
- Each regex match calls `isBackslashEscaped()` which walks backwards — O(k) per match
- `validEscapes` array `['b','t','n','f','r','"','\\','e','u','U','x']` is allocated inside the loop on every match
- Regex objects with `/g` flag are allocated fresh on every function call
- `JSON.stringify` + `trim` is used per `\UXXXXXXXX` match to convert code points

For multiline `"""` strings, there are 6 additional function calls before `unescapeLargeUnicode`, bringing the total to ~13 passes.

**Fix:** Replace with a single-pass state machine that handles all escape sequences in one traversal. Process characters sequentially, accumulating output, and handle `\n`, `\t`, `\uXXXX`, `\UXXXXXXXX`, `\xHH`, `\e` in-place.

**Expected improvement:** ~15% of parse CPU eliminated.

---

### 3. Regex on every character in tokenizer (~3% CPU)

**Location:** `tokenizer.ts` → `tokenize` main loop

```typescript
if (IS_WHITESPACE.test(cursor.value!)) {
```

`IS_WHITESPACE` is `/\s/`, tested on every single character of input. The regex engine has overhead compared to direct character code comparison.

Also in the `string` function's `isFinished` closure:
```typescript
IS_WHITESPACE.test(next_item)
```

**Fix:** Replace with:
```typescript
const code = cursor.value!.charCodeAt(0);
if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
```

**Expected improvement:** ~3% CPU, trivial change.

---

### 4. Linear scan in `findPosition` (~5% CPU)

**Location:** `location.ts` → `findPosition`

```typescript
const line = lines.findIndex(line_index => line_index >= index) + 1;
```

`findPosition` converts a byte offset to `{ line, column }`. It uses `Array.findIndex` — a linear scan from the start of the lines array. This is called **twice per token** (for start and end positions).

For a file with L lines and T tokens: O(T × L) total comparisons.

**Fix:** The `lines` array is sorted (line-ending indices in order). Use binary search: O(T × log L). For a 1000-line file with 5000 tokens, this is 10M → ~60K comparisons.

**Expected improvement:** ~4-5% of parse CPU, growing with file/line count.

---

### 5. `checkThree` does O(n) string copy

**Location:** `tokenizer.ts` → `checkThree`

```typescript
const precedingText = input.slice(0, current);
const backslashes = precedingText.match(/\\+$/);
```

When 3 consecutive quotes are found, `input.slice(0, current)` copies the entire string prefix. Then a regex scans it for trailing backslashes.

**Fix:** Walk backwards from `current - 1` counting backslashes in O(k) where k = number of consecutive backslashes (typically 0-2).

**Expected improvement:** Small for typical files, prevents O(n²) pathological case with many quoted strings.

---

### 6. String concatenation in tokenizer loops

**Location:** `tokenizer.ts` → `string` function, `comment` function

```typescript
raw += cursor.value!;
```

Building token `raw` strings via repeated concatenation. V8's "cons string" optimization handles this reasonably for short strings, but for long string values it can degrade.

**Fix:** After switching to index-based scanning, use `input.slice(start, end)` to extract token text in one operation instead of accumulating character by character.

**Expected improvement:** Moderate, especially for files with large string values.

---

### 7. Stringify: full AST roundtrip (architectural)

**Location:** `parse-js.ts` → `to-toml.ts`

`stringify(obj)` builds a complete AST from the JS object (`parseJS` → generate nodes + writer + 3 formatting heuristic passes), then serializes the AST back to a TOML string (`toTOML` via coordinate-based `traverse` + string assembly).

This is fundamentally heavier than smol-toml's approach (direct recursive string concatenation). The AST roundtrip is needed for `patch()` but is unnecessary overhead for plain `stringify()`.

**Fix (future):** Add a direct stringify fast-path that skips AST construction when `patch()` semantics aren't needed. This is a larger architectural change.

**Expected improvement:** Could bring stringify from ~30× to ~3-5× slower.

## Recommended Implementation Order

| Phase | Change | Est. Impact | Risk |
|---|---|---|---|
| **Phase 1** | Replace `utf16Iterator` with index-based tokenizer scanning | -14% CPU | Medium (tokenizer rewrite) |
| **Phase 1** | Replace regex whitespace with charCode checks | -3% CPU | Low (trivial) |
| **Phase 1** | `input.slice(start, end)` for token text (eliminates string concat) | -5% CPU | Low (follows from index-based) |
| **Phase 2** | Single-pass string unescaping | -15% CPU | Medium (complex string logic) |
| **Phase 2** | Binary search in `findPosition` | -4% CPU | Low (isolated change) |
| **Phase 2** | Fix `checkThree` to walk backwards | -1% CPU | Low (isolated) |
| **Phase 3** | Direct stringify fast-path (skip AST) | Major | High (architectural) |

**Phase 1 target:** Parse ~2-4× faster (from ~8× to ~3-4× vs smol-toml)  
**Phase 2 target:** Parse ~3-5× faster (from ~3-4× to ~2-3× vs smol-toml)  
**Phase 3 target:** Stringify ~5-10× faster (from ~30× to ~3-5× vs smol-toml)

A ~2-3× overhead vs smol-toml is a reasonable cost for maintaining a full AST with source locations (which enables the `patch()` feature that smol-toml doesn't have).

## Reproducing

```bash
# Run the profiling script
node benchmark/profile.mjs

# Run benchmarks with comparison
node benchmark/parse-benchmark.mjs --file "small"
node benchmark/stringify-benchmark.mjs --file "small"

# For unminified CPU profile (Chrome DevTools compatible):
npx rollup -i src/index.ts -f es -o dist/toml-patch-debug.js -p @rollup/plugin-typescript
# Edit profile.mjs to import toml-patch-debug.js, then run
# Open benchmark/cpu-profile.cpuprofile in Chrome DevTools → Performance tab
```
