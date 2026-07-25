# `@decimalturn/toml-patch` 2.1.0 — findings

Tested against `2.1.0` (tarball from registry), Node `v22.22.2`, ESM import of
`dist/toml-patch.js`. Every repro below was executed; the "actual" blocks are
verbatim output, shown as JSON-escaped strings so whitespace is unambiguous.

All issues are in the **`patch`** path. `stringify`/`parse` came out clean across
4000 randomized round-trips (see [What passed](#what-passed)).

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | New key added to doc with commented multiline array loses closing `]` | Invalid output | ✅ Fixed |
| 2 | Emptying a commented multiline array mangles the value | Invalid output | ✅ Fixed |
| 3 | Table→scalar relocates the key into the preceding section | Wrong semantics | ✅ Fixed |
| 4 | `patch` throws on any document containing a >2^53 integer | Blocking throw | ✅ Fixed |
| 5 | `inlineTableStart >= 2` silently drops new nested tables | Data loss | |
| 6 | Array element comments mis-associated when length changes | Comment loss | |
| 7 | Emptying an array-of-tables drops the key entirely | Data loss | |
| 8 | `Node not found` on several structural replacements | Throw | |
| 9 | Internal `TypeError`s instead of meaningful errors | Throw | |
| 10 | Blank lines accumulate when deleting tables | Cosmetic | |
| 11 | Comment outlives the section it described | Design question | |
| 12 | `stringify` emits `\uD800` for lone surrogates | Invalid output (niche) | |
| 13 | Identity round-trip normalizations | Fidelity | |

---

## 1. New top-level key loses the closing `]` of a commented multiline array

Adding an unrelated key to a document that contains a multiline array with
interior comments destroys the array's closing bracket. **The array does not
need to be modified.**

```js
import { patch, parse } from '@decimalturn/toml-patch';

const src = 'arr = [\n  1, # one\n  2, # two\n]\n';
patch(src, { arr: [1, 2], z: 1 });
```

Actual:

```
"arr = [\n  1, # one\n  2, # two\nz = 1\n"
```

Re-parsing that output: `Error parsing TOML (4, 1)`.

Expected: `"arr = [\n  1, # one\n  2, # two\n]\nz = 1\n"`

**Scope.** Requires the array to be multiline *and* contain comments. Both
controls are fine:

```js
patch('arr = [\n  1,\n  2,\n]\n', { arr: [1, 2], z: 1 });  // "arr = [\n  1,\n  2,\n]\nz = 1\n"  ok
patch('arr = [1, 2]\n',           { arr: [1, 2], z: 1 });  // "arr = [1, 2]\nz = 1\n"            ok
```

Looks like the insertion point for the new `KeyValue` is landing on the `]` line
and overwriting it, with the interior comment nodes throwing off the position
calculation.

---

## 2. Emptying a commented multiline array mangles the value

Separate from #1 — no additional key needed.

```js
patch('arr = [\n  1, # one\n  2, # two\n]\n', { arr: [] });
```

Actual:

```
"arr =# one\n]\n"
```

Invalid TOML: the `=` has no value, a comment is glued to it, and an orphan `]`
remains.

Expected: `"arr = [\n]\n"` (or `"arr = []\n"`).

**Scope.** Needs 2+ elements *and* comments. With one element it is correct, and
without comments it is correct:

```js
patch('arr = [\n  1, # one\n]\n',      { arr: [] });  // "arr = [\n]\n"    ok
patch('arr = [\n  1,\n  2,\n]\n',      { arr: [] });  // "arr = [\n]\n"    ok
patch('arr = [1, 2]\n',                { arr: [] });  // "arr = [ ]\n"     ok
```

With 3 commented elements the surviving comment is the second one
(`"arr =# b\n]\n"`), which suggests the same off-by-one as #6.

---

## 3. Replacing a table with a scalar relocates the key into the preceding section

Valid TOML, different meaning, no warning.

```js
const src = '[s]\nk = "v"\n\n[u]\nm = 3\n';
patch(src, { s: { k: 'v' }, u: false });
```

Actual:

```
"[s]\nk = \"v\"\n\nu = false\n"
```

Re-parses as `{"s":{"k":"v","u":false}}` — `u` is now nested under `s`.

Expected: `u = false` hoisted above the first table header, e.g.
`"u = false\n\n[s]\nk = \"v\"\n"`, re-parsing as `{"u":false,"s":{"k":"v"}}`.

**Scope.** The emitted key-value is written at the old table's position, which
falls inside the previous section's scope. When the converted table is *first* in
the document there is no preceding section and the result is correct, which is
probably why this hasn't surfaced:

```js
patch('[u]\nm = 3\n\n[s]\nk = "v"\n', { u: false, s: { k: 'v' } });
// "u = false\n\n[s]\nk = \"v\"\n"   ok
```

Applies to any non-table replacement — `false`, `"x"`, and `[1]` all reproduce.

---

## 4. `patch` throws on any document containing an integer outside the JS safe range

Default options. The offending integer does not have to be touched.

```js
const src = 'id = 9223372036854775807\n';
patch(src, parse(src));
```

Actual: `TypeError: Do not know how to serialize a BigInt`

```js
// unrelated edit, same failure
const src2 = 'id = 9223372036854775807\nname = "x"\n';
const o = parse(src2); o.name = 'y';
patch(src2, o);                                        // throws

// integersAsBigInt: false does not help — the BigInt is not from the object
patch(src, parse(src, { integersAsBigInt: false }));   // throws

// stringify is fine
stringify({ id: 9223372036854775807n });               // "id = 9223372036854775807\n"  ok
```

**Root cause.** `patch` re-parses `existing` internally under default
`integersAsBigInt: 'asNeeded'`, then feeds values to the canonical-comparison
helper (minified as `Fe`), whose fallback branch is `JSON.stringify`:

```js
function Fe(e){
  if(_e(e)) return `{${Object.keys(e).sort().map(t=>`${JSON.stringify(t)}:${Fe(e[t])}`).join(",")}}`
  return Array.isArray(e) ? `[${e.map(Fe).join(",")}]`
       : Ee(e) ? JSON.stringify(e.toString())
       : Ie(e) ? JSON.stringify(e.toISOString())
       : JSON.stringify(e)          // <-- bigint reaches here and throws
}
```

Dates get dedicated branches; `bigint` doesn't. A
`typeof e === 'bigint' ? e.toString() + 'n' : ...` branch should be sufficient.

Worth prioritising: 64-bit integers are legal TOML and common in real files
(snowflake IDs, nanosecond timestamps, checksums), and `'asNeeded'` is the
default, so this makes such documents unpatchable out of the box.

---

## 5. `inlineTableStart >= 2` silently drops newly created nested tables

`patch` and `stringify` disagree on the same object and the same format.

```js
import { TomlDocument, stringify } from '@decimalturn/toml-patch';

const doc = new TomlDocument('[project]\nname = "my-app"\n');
const obj = doc.toJsObject;
obj.tool = { ruff: { line_length: 88 } };
doc.patch(obj, { inlineTableStart: 2 });
doc.toTomlString;
```

Actual:

```
"[project]\nname = \"my-app\"\n\n[tool]\n"
```

`ruff` is gone. `stringify` handles it correctly, so its output doubles as the
expected value and as a regression fixture:

```js
stringify(obj, { inlineTableStart: 2 });
// "[project]\nname = \"my-app\"\n\n[tool]\n\n[tool.ruff]\nline_length = 88\n"
```

**Scope.** Affects 2 and 3; 0 and 1 are fine, which is why the default hides it.
Reproduces with a real `TomlFormat` instance as well as a partial literal, so it
is not an options-merging problem. Confined to *newly created* tables — existing
`[tool.ruff]` sections survive unrelated edits, in-place edits, and sibling-key
additions intact.

---

## 6. Array element comments are mis-associated when the array length changes

```js
const src = 'arr = [\n  1, # a\n  2, # b\n  3, # c\n]\n';
```

| target | actual | expected |
|---|---|---|
| `[1]` | `arr = [\n  1, # b\n]` | `# a` on element 1 |
| `[1,2]` | `arr = [\n  1, # a\n  2, # b\n]` | correct |
| `[2,3]` | `arr = [\n      2,\n      3,\n]    # a` | `# b`, `# c` on the two elements |
| `[1,2,3,4]` | `arr = [\n  1,\n  2, # a\n  3, # b\n  4,    # c\n]` | `# a`, `# b`, `# c`, none |
| `[0,1,2,3]` | `arr = [\n      0,\n  1, # a\n  2, # b\n  3, # c\n]` | correct |

The `[2,3]` case is the worst: two comments are lost outright and `# a` is moved
outside the closing bracket. Appending also shifts every comment down by one,
which is surprising — appending shouldn't disturb existing elements at all.
Prepending, which naively looks like the riskier operation, is correct.

Reads like comments are bound to array *slots* rather than to the elements they
trail, with the diff matching elements in a way that doesn't carry the
association along.

---

## 7. Emptying an array-of-tables drops the key

```js
patch('[[b]]\nn = 1\n', { b: [] });
```

Actual: `"\n"` — re-parses as `{}`, so `b` is gone.

Expected: degrade to `b = []`, re-parsing as `{"b":[]}`. There's no `[[b]]`
spelling for an empty array-of-tables, so the inline form is the only faithful
option.

---

## 8. `Node not found` on structural replacements

```js
patch('[a.b]\nx = 1\n',                { a: 42 });          // Node not found at a
patch('[[i]]\nn = 1\n',                { i: 42 });          // Node not found at i
patch('[[i]]\nn = 1\n\n[[i]]\nn = 2\n', { i: [9] });        // Node not found at i.1
patch('[t]\ny = [1, 2]\n',             { t: { y: [] } });   // Node not found at t.y.1
```

The last one is the useful clue — the identical edit at top level succeeds:

```js
patch('y = [1, 2]\n', { y: [] });   // "y = [ ]\n"   ok
```

So path resolution and empty-array handling disagree about nesting depth. The
first three are all "replace a table or array-of-tables with a non-table value",
which #3 shows is at least partly implemented, so these may share a cause.

---

## 9. Internal `TypeError`s instead of meaningful errors

```js
patch('arr = [\n  1, # one\n]\n', {});                        // reading 'substring' of undefined
patch('[[i]]\nn = 1\n\n[[i]]\nn = 2\n', { other: 1 });        // reading 'length' of undefined
```

Both are reachable from ordinary input — emptying a document, and deleting an
array-of-tables while adding a key. Even where the operation can't be supported,
these should surface as a library error with a path, like #8 does.

---

## 10. Blank lines accumulate when deleting tables

Each deletion leaves the separator blank line behind, so a tool that removes
entries one at a time creeps.

```js
let s = '[a]\nx = 1\n\n[b]\ny = 2\n\n[c]\nz = 3\n\n[d]\nw = 4\n';
for (const k of ['a', 'b', 'c']) {
  const o = parse(s); delete o[k]; s = patch(s, o);
}
```

Actual, per step:

```
"\n[b]\ny = 2\n\n[c]\nz = 3\n\n[d]\nw = 4\n"
"\n\n[c]\nz = 3\n\n[d]\nw = 4\n"
"\n\n\n[d]\nw = 4\n"
```

Expected: `"[d]\nw = 4\n"`.

---

## 11. A comment outlives the section it described

```js
const src = '[a]\nx = 1\n\n# section about b\n[b]\nz = 3\n';
const o = parse(src); delete o.b;
patch(src, o);
```

Actual:

```
"[a]\nx = 1\n\n# section about b\n"
```

Defensible either way — deleting user-written text is its own hazard — but
`tomlkit` and `toml_edit` both treat the comment block immediately preceding a
table header as belonging to that table and remove it with the table. Worth a
deliberate decision and a line in the README, since a dangling
`# section about b` with no `[b]` is actively misleading. Note that inline
comments *are* correctly removed with their key (`x = 1  # about x` → gone).

---

## 12. `stringify` emits `\uD800` for lone surrogates

```js
stringify({ s: '\ud800' });   // "s = \"\\ud800\"\n"
```

Its own `parse` rejects that (`Error parsing TOML (1, 5)`), correctly — surrogate
code points are not Unicode scalar values, so `\uD800` isn't a legal TOML escape.
The parser is right; the stringifier shouldn't emit it. Throwing at stringify
time with a clear message seems better than emitting U+FFFD silently.

Niche, but reachable — lone surrogates turn up from `String.prototype.slice` on
astral characters.

---

## 13. Identity round-trip normalizations

`patch(src, parse(src))` should ideally be byte-identical. These differ:

| input | output | note |
|---|---|---|
| `a = +nan\n` | `a = nan\n` | `+` dropped; `-inf`, `+0.0`, `-0.0` all preserved |
| `a\t=\t1\n` | `a = 1\n` | tabs around `=` become spaces |
| `a . b = 1\n` | `a.b =   1\n` | space around the dot dropped, then compensated with padding after `=` |
| `a = 1\n[t]\r\nx = 2\n` | `a = 1\n[t]\nx = 2\n` | mixed EOL unified |
| `  [t]  \n  x   =   1   \n` | `  [t]\n  x   =   1\n` | trailing whitespace stripped |

Most of these are reasonable normalizations and possibly intended; the `a . b`
one is the odd one, since dropping the whitespace and then re-adding it in a
different place is a net change either way. Trailing-whitespace stripping is
probably desirable. Listed mainly so the intended behavior is explicit.

---

## What passed

Context for the list above, which is otherwise all problems:

- **`stringify` → `parse` fidelity:** 4000 randomized nested objects (ints,
  floats, strings with quotes/backslashes/spaces, bools, arrays, nested tables,
  to depth 3), zero mismatches.
- **Identity `patch`:** byte-stable on all 4000 of those, plus a hand-written
  55-case corpus covering AOT, dotted keys, quoted/empty keys, all five date
  forms, hex/octal/binary/underscored integers, float exponents and specials,
  BOM, CRLF, empty tables, and comment placements.
- **No drift:** patching the same document repeatedly is stable, and
  add-then-delete cycles return to the byte-exact original.
- **String escapes:** every case round-tripped, including `\t`, `\n`, `\r\n`,
  `\x00`, `\x07`, DEL, embedded `"""`, strings that end in a quote, leading
  newlines, trailing spaces, and multiline literals with line-ending backslash
  continuations. Literal strings stay literal when their value changes.
- **Dates:** all five TOML forms preserved; injecting a JS `Date` into a
  date-only slot correctly keeps the date-only form.
- **Comment alignment:** works well, including re-aligning a whole trailing
  comment block when one value changes width in either direction.
- **Structural edits:** scalar↔array, scalar↔table, str→int, int→float,
  key rename, key deletion, whole-table deletion, array insert/remove/reorder,
  and AOT append/reorder/drop-first/drop-last all correct. Existing key order is
  correctly *not* reordered to match object key order.

## Suggested cheap guard

Independent of the individual fixes, two assertions in `patch` would have caught
#1, #2, #5 and #7 as test failures rather than as corrupted user files:

1. Re-parse the output and compare against the target object; throw on mismatch.
2. Check that every key present in the target appears in the output.

Both are pure additions and could sit behind a debug/strict flag if the
round-trip cost matters.