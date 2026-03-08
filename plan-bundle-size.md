# Plan: Reduce bundle size

## Motivation

The single-bundle output of `@decimalturn/toml-patch` is currently **66.56 kB minified / 17.83 kB gzipped**.

This plan targets **code-level** optimizations — deduplication, dead code removal, and string trimming — that reduce the bundle within the existing single-file build. These are safe, incremental changes that don't alter the build architecture.

**Target: ~55–60 kB minified** (~10–15% reduction)

## Current state

```
src/index.ts  →  dist/toml-patch.js  (66.56 kB minified, 17.83 kB gzipped)
```

### Source file inventory (by line count)

| File | Lines | Description |
|------|------:|-------------|
| parse-toml.ts | 1624 | TOML parser — tokenizes and builds AST |
| writer.ts | 710 | AST mutation engine (insert/replace/remove/shift) |
| toml-format.ts | 487 | Format detection + `TomlFormat` class |
| patch.ts | 470 | Core patch logic — diffs JS objects and applies changes |
| date-format.ts | 397 | Date/time custom classes + format preservation |
| ast.ts | 383 | AST node types, interfaces, type guards |
| tokenizer.ts | 379 | Tokenizer — splits TOML into token stream |
| to-js.ts | 334 | AST → JavaScript object |
| generate.ts | 299 | Generates new AST nodes from JS values |
| to-toml.ts | 281 | AST → TOML string |
| formatter.ts | 216 | Inline table ↔ table section conversion |
| parse-string.ts | 168 | String escape/unescape logic |
| diff.ts | 160 | Object diff engine |
| toml-document.ts | 157 | `TomlDocument` class |
| parse-js.ts | 144 | JavaScript object → AST |
| truncate.ts | 117 | AST truncation for incremental parsing |
| traverse.ts | 111 | Generic AST visitor/traversal |
| location.ts | 106 | Position/Location types and helpers |
| find-by-path.ts | 84 | Path-based AST node lookup |
| cursor.ts | 77 | Iterator cursor wrapper |
| utils.ts | 77 | Shared utility functions |
| index.ts | 58 | Public API entry point |
| validate.ts | 55 | AST validation (debugging aid) |
| parse-error.ts | 23 | ParseError class |

## Plan

### Phase 1: Remove dead/deprecated code (low effort, low risk)

**Estimated savings: 0.5–1 kB minified**

Remove exports and functions that are never imported by any production code path:

| Symbol | File | Reason |
|--------|------|--------|
| `escapeDoubleQuotes()` | parse-string.ts | Marked `@deprecated`, unused |
| `unescapeLargeUnicode()` | parse-string.ts | Marked `@deprecated`, unused |
| `CheckMoreThanThree()` | tokenizer.ts | Exported but never imported |
| `formatPrintWidth()` | formatter.ts | Empty stub (`// TODO`), does nothing |
| `pipe()` | utils.ts | Exported but never imported by src files |
| `validate` import | patch.ts | Imported but call is commented out |
| `toDocument()` | patch.ts | Only used in tests, not in main code path |

**Approach**: Delete the dead functions. For `toDocument()`, verify it's test-only and either remove or move to test helpers. Confirm nothing breaks by running the full test suite.

### Phase 2: Deduplicate validation in parse-toml.ts (medium effort, biggest impact)

**Estimated savings: 4–6 kB minified / 1–1.5 kB gzipped**

This is the **single biggest opportunity**. `parse-toml.ts` has ~400–500 lines of repetitive validation code with identical patterns:

1. **Underscore validation** — the same checks (`/_$/`, `/^[+\-]?_/`, `/__/`) appear **3 times**: in integer parsing, float integer-part, and float fractional-part.

2. **Leading-zero checks** — `if (/^[+\-]?0\d/.test(...))` appears **3 times**.

3. **Bare key validation loop** — identical `isBareKeyCode` character loop + `throw ParseError` appears **4 times** (table header key, dotted table header, KV key, dotted KV key).

4. **DateTime digit-count validation** — hour/minute/second range checks are duplicated between the datetime-with-date branch and the standalone-time branch.

**Approach**: Extract shared helpers:
- `validateNumericUnderscore(raw, input, loc)` — handles underscore + leading-zero rules once.
- `validateBareKey(raw, input, loc)` — single function replacing 4 inline copies.
- `validateTimeParts(raw, input, loc)` — validates HH:MM:SS digit counts and ranges once.

### Phase 3: Deduplicate date-format.ts `toISOString()` logic (medium effort)

**Estimated savings: 1.5–2.5 kB minified / 0.3–0.5 kB gzipped**

`LocalTime`, `LocalDateTime`, `OffsetDateTime`, and `DateFormatHelper.createDateWithOriginalFormat()` all contain nearly identical formatting code:

- Same `padStart(2, '0')` formatting of year/month/day/hours/minutes/seconds (repeated 4×)
- Same millisecond precision logic: `originalHadMs` → `msMatch` → `slice(0, msDigits)` vs `replace(/0+$/, '')` (repeated 4×)
- Same UTC offset calculation (`sign * (hours*60 + minutes)`) appears twice

**Approach**: Extract shared helpers:
- `formatDateParts(date)` → returns `{ year, month, day, hours, minutes, seconds }` already zero-padded.
- `formatMsPrecision(ms, originalFormat)` → handles ms digit logic once.

### Phase 4: Shorten error message strings (medium effort)

**Estimated savings: 1–2 kB minified / 0.3–0.5 kB gzipped**

Strings survive minification. There are ~80–100 error messages averaging 60–80 characters. Many include redundant context that's already available from the error location.

Examples of verbose → concise:

```
// Before (108 chars)
"Invalid timezone offset \"${fullOffset}\": minute must be between 00 and 59, found ${minutes}"

// After (52 chars)
"Invalid timezone offset: minute must be 00-59"
```

```
// Before (95 chars)
"Invalid float: underscore at the end of the number is not allowed in ${raw}"

// After (48 chars)
"Invalid float: trailing underscore not allowed"
```

**Approach**: Audit all `ParseError` and `throw new Error` messages. Shorten while preserving enough context for debugging. The `ParseError` class already captures position info, so redundant position details in the message text can be removed.

> **Note**: Error messages are user-facing for debugging. The goal is "concise and clear", not "cryptic". Each message should still describe the problem unambiguously.

### Phase 5: Simplify validateFormatObject in toml-format.ts (low effort)

**Estimated savings: 0.5–1 kB minified**

`validateFormatObject()` has a large switch statement doing type validation for ~7 properties, building arrays of strings for warning/error messages. This can be compressed into a schema-driven validator.

**Approach**: Define a `formatSchema` object mapping property names to expected types and valid values, then validate in a single loop.

### Phase 6: Verify terser strips all comments (low effort)

**Estimated savings: 0.3–0.8 kB minified**

`writer.ts` and `ast.ts` have extensive `//`-style comments between code. Verify the rollup/terser config has `comments: false` (or the default that strips non-license comments). If some survive, update the terser options.

**Approach**: Inspect the built `dist/toml-patch.js` for any remaining comments. Adjust terser config if needed.

## Estimated savings summary

| Phase | Opportunity | Min Est. | Gzip Est. | Actual Min | Actual Gz | Status |
|-------|------------|----------|-----------|------------|-----------|--------|
| 1 | Remove dead/deprecated code | 0.5–1 kB | 0.1–0.3 kB | ~0.5 kB | ~0.1 kB | ✅ Done |
| 2 | Deduplicate validation in parse-toml.ts | 4–6 kB | 1–1.5 kB | 3.25 kB | 0.03 kB | ✅ Done |
| 3 | Deduplicate date-format.ts toISOString | 1.5–2.5 kB | 0.3–0.5 kB | 2.19 kB | 0.35 kB | ✅ Done |
| 4 | Shorten error message strings | 1–2 kB | 0.3–0.5 kB | 2.31 kB | 0.47 kB | ✅ Done |
| 5 | Simplify validateFormatObject | 0.5–1 kB | 0.1–0.2 kB | 0.25 kB | 0.05 kB | ✅ Done |
| 6 | Verify terser strips all comments | 0.3–0.8 kB | 0.1–0.2 kB | 0 kB | 0 kB | ✅ Done (already clean) |
| **Total** | | **~8–13 kB** | **~2–3 kB** | **~8.5 kB** | **~1 kB** | |

**Starting point: 66.56 kB min / 17.83 kB gz**
**Final result: 58.56 kB min / 16.93 kB gz (-12.0% min / -5.0% gz)**

## Implementation order

Phases are independent and can be done in any order. All phases completed:

1. **Phase 1** — removed unused functions (commit 737be40)
2. **Phase 6** — verified terser strips all comments (no changes needed)
3. **Phase 2** — deduplicated parse-toml.ts validation (commit b2b7f80)
4. **Phase 3** — deduplicated date-format.ts helpers (commit 2cef199)
5. **Phase 5** — schema-driven validateFormatObject (commit 70f9e6d)
6. **Phase 4** — shortened error messages (commit c745da5)

Each phase is a separate commit on branch `dev-bundle-size` for easy review and revert.
