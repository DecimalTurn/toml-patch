# Patch-lite

`patch-lite` is a smaller, edit-only distribution of `patch()`. It updates values that already
exist in a TOML document and leaves everything else untouched. It cannot add, remove, reorder or
rename anything.

It exists to answer one question: *do you only need to change values in a document you already
have?* If the answer is yes, `patch-lite` gives you the same guarantees as the full `patch()` for
those edits at **26.7% of the minified size** and roughly **1.9x the throughput**.

```js
import { patch } from '@decimalturn/toml-patch/patch-lite';

const existing = 'version = "1.0.0"\n';
patch(existing, { version: '1.0.1' });
// 'version = "1.0.1"\n'
```

## Is patch-lite enough for your needs?

| You need to… | `patch-lite` | full `patch()` |
| --- | --- | --- |
| Change an existing value (string, number, boolean, bigint, date/time) | ✅ | ✅ |
| Change a value nested in tables, dotted keys, inline tables, arrays or arrays of tables | ✅ | ✅ |
| Apply several value edits in one call | ✅ | ✅ |
| Keep comments, whitespace | ✅ | ✅ |
| Preserve a leading BOM byte-for-byte | ✅ | ✅ |
| Get the original string back unchanged when nothing changed | ✅ | ✅ |
| Keep the quote style of an edited string, when the value allows it | ✅ | ✅ |
| Add or remove a key | ❌ | ✅ |
| Rename a key | ❌ | ✅ |
| Add or remove array elements | ❌ | ✅ |
| Reorder array elements or object keys | ❌ | ✅ |
| Replace a primitive with a table/array, or the reverse | ❌ | ✅ |
| Choose formatting options (line endings, indentation, trailing commas) | ❌ | ✅ |
| Control the case of generated escape sequences | ❌ | ✅ |
| Reject strings with unpaired UTF-16 surrogates | ❌ | ✅ |
| Use `Temporal` objects for date/time values | ❌ | ✅ |
| Use `parse()`, `stringify()` or the `TomlDocument` class | ❌ | ✅ |
| Preserve underscore formatting of numbers | ❌ | ✅ |
| Preserve comments alignment | ❌ | ✅ |
| Control the number of decimal places for float values | ❌ | ✅ |
| Preserve line ending backslashes in multiline basic strings | ❌ | ✅ |

If any item marked ❌ is a requirement, use the full `patch()` from the package root. The two
share a call shape, so switching later is an import change — but see
[Switching from the full API](#switching-from-the-full-api) for the caveats.

## Installation and imports

As a subpath of the main package:

```js
import { patch } from '@decimalturn/toml-patch/patch-lite';
```

As a standalone package published under the `lite` dist-tag:

```sh
npm install @decimalturn/toml-patch@lite
```

```js
import { patch } from '@decimalturn/toml-patch';
```

Both expose exactly one name, `patch`. There is no `parse`, `stringify`, `parseDocument`,
`TomlDocument`, `TomlFormat` or date class, and no exported error class. You must already have a
way to produce the `updated` object — for example `parse()` from the main package, a TOML parser of
your own, or a data structure your application builds directly.

## API

```ts
function patch(existing: string, updated: any): string
```

- `existing` — the original TOML document.
- `updated` — an object with the same keys and array lengths as `existing`, carrying the values you
  want to write. Only keys present in `existing` are read.
- Returns a new TOML string with only the edited value spans replaced.

The full `patch()` has a third optional `format` parameter. `patch-lite` has no formatting options,
so passing one throws a `PatchLiteError` with the code `UnsupportedOption` rather than ignoring it.

### What counts as an edit

An edit is a **leaf change at a path that already exists**: same key, same array index, same
container type at every level. Anything that would change the document's structure is rejected
before any output is produced.

### Supported value types

| Type | Notes |
| --- | --- |
| `string` | Re-encoded in the source's string style where possible. See [String re-encoding](#3-edited-values-are-re-encoded-with-fixed-rules). |
| `number` | Integers, floats, exponents, `inf`, `-inf`, `nan`, `-0`. Radix prefixes (`0x`, `0o`, `0b`) including digit case, and exponent notation including the `e`/`E` case, are preserved when the source used them. Underscore digit grouping is **not** preserved. |
| `boolean` | |
| `bigint` | |
| `Date` | toml-patch's `LocalDate`, `LocalTime`, `LocalDateTime`, `OffsetDateTime` and duck-typed smol-toml `TomlDate` objects. The source value's kind (date / time / datetime / offset), separator, offset style and fractional-digit count are kept. |
| `Temporal` | **Not supported.** `Temporal.PlainDate` and friends are rejected with `TypeChange`. Convert to a `Date` subclass first, or use the full `patch()`. |

Objects and arrays may appear in `updated` at a path where `existing` already holds a container, but
they are only traversed — the container type and shape must not change.

## Rejected operations

All of these throw before the source is modified, so a failed call never produces a partial
document.

| Operation | `code` | Example message |
| --- | --- | --- |
| Adding a key | `AddedKey` | `Cannot add key b` |
| Removing a key | `RemovedKey` | `Cannot remove key b` |
| Renaming a key | `RemovedKey` | `Cannot remove key a` (the missing old key throws first) |
| Changing array length | `ArrayLengthChange` | `Cannot change the length of array at a (2 to 3)` |
| Reordering array elements | `ArrayReorder` | `Cannot reorder array elements at a` |
| Changing a primitive to a table or array, or the reverse | `TypeChange` | `Cannot change a number to a table at a` |
| Changing a date to a non-date, or the reverse | `TypeChange` | `Cannot change a date to a number at a` |
| `undefined`, `null`, functions, symbols, unsupported objects | `UnsupportedValue` | `Unsupported value type undefined at a` |
| Passing a `format` argument | `UnsupportedOption` | `patch-lite does not support formatting options` |

### Error contract

Rejections throw a `PatchLiteError`:

- `name` is `'PatchLiteError'`
- `code` is one of the six codes above
- `path` is an array of keys and indices, such as `['t', 'a', 0]`
- `message` ends with the path formatted as `a.b[0].c`, or `(root)` for the document root

The class itself is **not exported** from the lite entry, so branch on `err.name` or `err.code`
rather than using `instanceof`:

```js
try {
  patch(existing, updated);
} catch (err) {
  if (err.code === 'ArrayLengthChange') {
    // fall back to the full patch()
  }
  throw err;
}
```

Malformed TOML in `existing` is not a `PatchLiteError`: `patch-lite` uses the same parser as the
main package, so the parser's own error is thrown instead. That error carries `line` and `column`
properties, but its `name` is `'Error'` because the `ParseError` class does not set one, and the
class is not exported either. Detect it by the presence of a `line` property, which is what the
library's own internal `isParseError` helper does.

Two plain `Error`s exist for internal invariants and are not expected in normal use:
`Cannot locate a value at <path>` and `Missing source location for value at <path>`.

## Simplifications compared with the full `patch()`

### 1. No structural machinery

`patch-lite` has no diff of change categories, no writer for insertions or removals, no comment
ownership tracking and no reordering. It parses the source, compares values, and replaces value
spans directly — back to front, so earlier offsets stay valid. Two consequences worth knowing:

- A comment that describes a key is never moved, because nothing is ever moved.
- Nothing outside the edited spans can change, including line endings and the trailing newline.
  There is no way to normalise a document's formatting.

### 2. No formatting options

`patch-lite` accepts no format object and no `TomlFormat` instance. Every option available to the
full `patch()` — `newLine`, `trailingNewline`, `trailingComma`, `indentWidth`, `multilineTable`,
`multilineArray`, `bracketSpacing`, `escapeSequenceUpperCase`, `updateOrder` and the rest — is
unavailable. The source's existing formatting is always preserved as-is. A third argument passed to
`patch-lite` throws a `PatchLiteError` with the code `UnsupportedOption`.

Object key order in `updated` is likewise ignored: edits are resolved by path, so you cannot use the
order of your object to reorder the document.

### 3. Edited values are re-encoded with fixed rules

The edited value span has to be rewritten, so the string style of that span may change. `patch-lite`
follows a fixed table:

| Source style | `patch-lite` output | Full `patch()` |
| --- | --- | --- |
| `"…"` single-line basic | `"…"` basic, escaping as needed | same |
| `'…'` single-line literal | `'…'`, growing to `'''…'''` when the value contains an apostrophe or a newline | keeps the literal style |
| `"""…"""` multiline basic | `"""…"""`, keeping the leading-newline style | same |
| `'''…'''` multiline literal | `'''…'''` when the value can be literal, otherwise a **single-line `"…"`** | falls back to `"""…"""` |

So a single-line literal keeps its quotes whenever the value can still be written literally, and an
edited multiline literal string that can no longer be literal collapses onto one line. Untouched
strings are never rewritten and keep their exact bytes.

Content rules inside a basic string: backslashes are doubled, `\b`, `\t` and `\f` use their short
forms, a carriage return is only emitted literally as part of CRLF (otherwise as `\r`), other control
characters and DEL become `\uXXXX`, and an embedded `"""` is protected as `""\"`. Inside a multiline
basic string, newlines stay literal.

**Numbers.** Radix prefixes are kept (`0xff` stays hexadecimal, with the digit case of the source),
and exponent notation is kept, including whether the source wrote `e` or `E`. Two things are not
kept:

- **Underscore digit grouping.** `a = 1_000_000` edited to `2000000` comes back as `2000000`; the
  full `patch()` returns `2_000_000`.
- **A radix prefix for a negative value.** TOML prefixed integers cannot carry a sign, so a `0xff`
  source edited to a negative number falls back to decimal (`-5`). The full `patch()` does the same.

### 4. Escape sequences are always uppercase

Generated hex escapes are always uppercase, for example `\u007F`. The full `patch()` mirrors the
case of the first hex escape it finds in the document (`\u007f` stays lowercase) and lets you
override that with `escapeSequenceUpperCase`. `patch-lite` does neither: it has no detection and no
option.

Escape sequences inside spans that are not edited are left exactly as they were, so a document can
end up with both cases if it already used lowercase and an edit introduces a new escape.

### 5. Line endings inside an edited value are written verbatim

`patch-lite` never normalises line endings. If the document uses CRLF and the new value contains
`\n`, the value span keeps `\n`; if the document uses LF and the value contains `\r\n`, the span
keeps `\r\n`. The result can therefore have mixed line endings, and the value round-trips exactly:

```js
// `parse` here is the main package's; patch-lite only exports `patch`.
parse(patch(existing, updated)).someKey === updated.someKey; // true
```

The full `patch()` instead rewrites every newline in the output to `format.newLine`, which is
document-level normalisation applied to string values too. That means the full pipeline can change
your value: an `\n` written into a CRLF document comes back as `\r\n`. Choose accordingly.

### 6. Multiline basic strings are not rebuilt with line continuations

When a `"""` string in the source uses line-ending backslash continuations, the full `patch()`
rebuilds that layout so the rewritten value keeps the same shape (see
`src/line-ending-backslash.ts`). `patch-lite` writes the value's literal shape instead, so the
continuation layout is not preserved even though the value itself is correct.

### 7. No output encoding validation

`patch-lite` performs no encoding validation on its output: a string containing unpaired UTF-16
surrogates is emitted as-is, producing text that is not valid TOML/UTF-8. The full `patch()` rejects
it. Use the full API if you need that check.

## Size and performance

Measured with `pnpm run bench:bundle-size` and `pnpm run bench:patch-lite`
(see `benchmark/bundle-size.md` and `benchmark/patch-lite-bundle-size.md`):

| Metric | full `patch()` | `patch-lite` | Difference |
| --- | --- | --- | --- |
| Minified | ~162.1 kB | ~43.3 kB | -118.8 kB (26.7% of full) |
| Min + gzipped | ~50.0 kB | ~13.2 kB | -36.8 kB (26.4% of full) |
| Runtime dependencies | 0 | 0 | — |

`patch-lite` is held to a hard budget of 48 kB minified and 14 kB gzipped, recorded in
`benchmark/thresholds.toml` alongside the performance budgets and enforced on every pull request by
the `bundle-size` job in the benchmarks workflow.

Throughput on the in-place edit benchmark (`pnpm run bench:patch`) is roughly 1.9x the full
pipeline — about 3,300 ops/sec against 1,700 ops/sec in this repository's run, with wide variance
between runs.

## Guarantees and how they are tested

- **Byte-for-byte preservation outside edited spans.** Comments, whitespace, blank lines, line
  endings, a leading BOM and untouched values — including untouched multiline strings — come back
  unchanged. Replacement is applied only to the recorded value ranges.
- **All-or-nothing.** Validation completes before any output is produced, so a rejected update
  throws instead of returning a partially modified document.
- **Identity on no-op.** When nothing changes, the original string is returned.

Coverage lives in `src/__tests__/patch-lite.test.ts` (focused behavior, including
`describe('rejections')` and `describe('escape sequence case')`), in the shared
`src/__tests__/patch.common.test.ts` (every case there runs against both implementations), in
`src/__tests__/patch-lite.fuzz.test.ts` with the harness in `src/__tests__/fuzz-patch-lite.ts`, and
in `src/__tests__/roundtrip.parse-patch-lite.test.ts`. See
[Fuzz testing](Fuzz-Testing.md#patch-lite) for how to widen the sweeps.

## Switching from the full API

The call shape matches, so the change is usually just the import:

```diff
-import { patch } from '@decimalturn/toml-patch';
+import { patch } from '@decimalturn/toml-patch/patch-lite';
```

Before you switch, check for:

1. **Structural edits.** Any add, remove, rename, reorder or type change now throws where it used to
   succeed.
2. **A third `format` argument.** It is ignored, not rejected, so formatting expectations can fail
   silently at runtime. Remove it or keep the full API.
3. **Multiline literal fallback.** When an edited `'''…'''` value can no longer be written
   literally, `patch-lite` emits a single-line basic string where the full `patch()` emits a
   multiline basic string.
4. **Document normalisation.** If you relied on `newLine` or `trailingNewline` to normalise output,
   `patch-lite` will not do it.
5. **Temporal objects and unpaired surrogates.** Both are accepted by the full API in ways the lite
   distribution is not.
