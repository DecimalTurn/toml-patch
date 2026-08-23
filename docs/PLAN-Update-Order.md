# Plan: `updateOrder` — Reorder Entries to Match JS Object Key Order

> **Prerequisite:** [`PLAN-Comment-Ownership.md`](./PLAN-Comment-Ownership.md). Reordering entries means
> moving their comments with them, and the library has no model for that today. That document is Phase 1;
> everything here builds on its `resolveSlots()` API.

> **Line references** are against `dev-bug-fixes`@34e7fde. On `latest` (the intended implementation base),
> `src/patch.ts` anchors at line 180 and beyond shift by **+1**; no other source file differs.

---

## Overview

[Issue #174](https://github.com/DecimalTurn/toml-patch/issues/174) asks for `patch()` to honour the key
order of the JS object it is given, rather than always preserving the existing document's order:

> Re-order all elements in the TOML output based on the order in the JS object even if those haven't
> changed value between the original TOML and the JS Object.

This ships as **`updateOrder?: boolean` on `TomlFormat`, default `false`**. With the option off nothing
changes — every existing test stays byte-identical. With it on, root key-values, `[table]`/`[[array]]`
section blocks, and rows inside table bodies are reordered to match the JS object, carrying their comments
with them.

The desired behaviour is already written down as a skipped test at `src/__tests__/patch.test.ts:4379`, with
a TODO explaining that honouring key order "would require a more complex diffing algorithm that takes into
account the order of keys in the patched object."

---

## Background: why the diff can't see order today

**`compareObjects` has no notion of position.** It makes two sequential passes — over `before_keys`
emitting Rename/Remove, then over `after_keys` emitting Add (`src/diff.ts:92-143`). The `index` parameter
in both `forEach`s is used only to index into the parallel `before_stable`/`after_stable` arrays for the
rename heuristic; it never reaches a `Change`. **Two objects whose keys are a permutation of each other
produce zero changes**, and `patchCst` then hits its no-changes fast path (`src/patch.ts:140-145`) and
returns the input untouched.

**`Move` already exists, but is array-only.** `ChangeType.Move { path, from, to }` (`src/diff.ts:36-44`) is
emitted solely by `compareArrays` (`src/diff.ts:163-175`) via a simulate-and-splice walk, and applied at
`src/patch.ts:674-698` as a `remove()` + `insert()` pair. Extending it to object keys is the natural move,
but the existing handler does `parent.items[change.from]` — a **raw** index, correct only because inline
containers never contain `Comment` nodes. It breaks immediately for `Document`/`Table`.

**Adds always append.** Verified across all four Add paths:

| Child kind | Path | Lands at |
|---|---|---|
| root KV, document has sections | `resolvedIndex = rootTableEnd` (`src/patch.ts:429-437`) | end of the root-KV run |
| root KV, no sections | `rootTableEnd === -1` → index stays a *string* → `writer.ts:157` falls back to `items.length` | end of document |
| `Table`/`TableArray` at document level | same string-index fallback | end of document |
| table-body KV | `insert(original, parent, childToInsert)`, no index (`src/patch.ts:476`) | end of `Table.items` |

So today a new key's position is a function of the document's shape, never of where the caller put it in
the object.

---

## Scope

**In:** `Document.items` (root key-values, and the relative order of section blocks) and
`Table`/`TableArray` bodies.

**Out for v1.** Each is a *guard clause* that leaves order untouched — "did nothing" is a safe failure
mode; "reordered half of it" is not.

| Descoped | Why |
|---|---|
| Inline-table interiors `{ a = 1, b = 2 }` | Needs column relayout and trailing-comma fixups rather than line relayout. Separate follow-up. |
| Interiors of `[[aot]]` entries | Dotted-key members directly inside an entry can be reordered when `compareObjects` emits their moves. Inline-table interiors and AOT-entry sub-tables remain out of scope. `compareArrays` still short-circuits on stable-equal entries (`src/diff.ts:157-159`) and `stableStringify` **sorts keys** (`src/utils.ts:170`), so two entries differing only in key order are byte-identical and the diff never recurses. Reordering the AOT *blocks themselves* remains in scope. |
| Non-contiguous document groups | `[a]`, `[b]`, `[a.c]` is valid TOML. Grouping by first key segment makes `a`'s group non-contiguous, and any permutation would silently coalesce `[a.c]` next to `[a]` and relocate `[b]`. Detect and bail out of the document-level reorder. |

### TOML validity beats JS order

A root key-value cannot appear after a section header — it would bind to that section. So for
`{ section: {...}, new_root: 42 }` the literal JS order is unrepresentable.

**Rule: partition `Document.items` slots into key-value slots and section slots, and permute within each
partition only.** Sections can never be pulled ahead of root keys, and root keys can never be pushed behind
sections. This keeps `src/__tests__/patch.test.ts:4399` ("new key hoisted above the section even though it
came after in the object") green *even with the option on*, and makes the feature structurally incapable of
emitting invalid TOML.

It also renders the emission simulation's one known imprecision harmless — see §2.

Note this is usually a no-op anyway: `parseJS` → `formatTopLevel` (`src/formatter.ts:43-77`) hoists root
objects into `Table`/`TableArray` blocks by remove-then-**append**, so `updated_js` key order is already
scalars-first-then-sections. The partition matters for the one case where that doesn't hold —
`formatTopLevel` returns early when `inlineTableStart === 0` (`src/formatter.ts:39`), so
`inlineTableStart: 0` + `updateOrder: true` *can* ask for a scalar after a section.

---

## 1. The option (`src/toml-format.ts`)

`updateOrder?: boolean`, default `false`. Six wiring points, all positional-argument sensitive:

| # | Location | Change |
|---|---|---|
| 1 | line 5-13 | `export const DEFAULT_UPDATE_ORDER = false;` |
| 2 | `validateFormatObject` schema, line 253-265 | `updateOrder: isBool` |
| 3 | `resolveTomlFormat`, line 314-324 | `validatedFormat.updateOrder ?? fallbackFormat.updateOrder` as the **10th** positional argument |
| 4 | class field, after `minimumDecimals` (line 427) | field + JSDoc |
| 5 | constructor, line 433-454 | 10th parameter + `?? DEFAULT_UPDATE_ORDER` |
| 6 | `TomlFormat.default()` line 470, `autoDetectFormatWithCst` line 517 | pass the default; **not** auto-detectable |

**#2 is mandatory, not cosmetic.** `patchCst` builds its diffing format by spreading the instance
(`{...format}`, `src/patch.ts:131`), which drops `instanceof TomlFormat` and routes through
`validateFormatObject`. Any own property missing from the schema lands in `unsupported` and triggers a
`console.warn` (`src/toml-format.ts:287`) — so forgetting the entry means a warning on **every** `patch()`
call, not just ones using the option. §5.3 has the regression guard.

**#6:** key order in the existing document tells you nothing about the caller's intent, so this joins
`inlineTableStart` / `truncateZeroTimeInDates` / `minimumDecimals` in the "caller must set explicitly"
group that `autoDetectFormatWithCst` forces to defaults (`src/toml-format.ts:547-558`).

**README:** the "Format Options" section (line 210), the interface listing (425-429), and a per-option
section. Document which comments travel with a moved entry (ownership R1–R6 — in particular that
commented-out entries are left behind, and that a blank line severs ownership), and note that `TomlDocument.patch`
assigns `this._format = fmt` (`src/toml-document.ts:90`), so the option is **sticky** for subsequent
patches on the same document.

---

## 2. Emission (`src/diff.ts`)

Thread an options bag through `diff` / `compareObjects` / `compareArrays`:

```ts
export interface DiffOptions {
  updateOrder?: boolean;
}

export default function diff(
  before: any, after: any, path: Path = [], options: DiffOptions = {}
): Change[];
```

`Move` gains an optional discriminator. Arrays keep using the bare ordinal, so this is purely additive:

```ts
export interface Move {
  type: ChangeType.Move;
  path: Path;
  from: number;
  to: number;
  /** Present only for object-key moves; identifies the child to place. */
  key?: string;
}
```

`compareObjects` gains a final step, guarded on `options.updateOrder`, mirroring `compareArrays`'
simulate-and-splice walk:

```
# 1. Predict the key order the document will have after Add/Remove/Rename are applied.
sim = []
for key of before_keys:
    if after_keys.includes(key):   sim.push(key)
    elif renamed.has(key):         if !sim.includes(newName): sim.push(newName)
    # removed -> drop
for key of after_keys:
    if !sim.includes(key):         sim.push(key)        # adds append

# 2. Walk the target order; on each mismatch, emit a placement and splice.
for (targetIndex, key) of enumerate(after_keys):
    if sim[targetIndex] == key: continue
    emit Move { path, key, from: sim.indexOf(key), to: targetIndex }
    splice sim to match

# Emit nothing if the sequences already agree.
```

Three things this rests on:

- **Adds append** — the table in the Background section. The one exception is a root KV Add when sections
  exist: it lands at the end of the *root-KV run*, not the end of the key list, so `sim` predicts
  `[a, sect, x]` where reality is `[a, x, sect]`.
- **That imprecision is harmless.** The apply side resolves the source **by `change.key`, not by the
  ordinal**, and no-ops when the child is already at its target position, so a mis-predicted `from`
  self-heals. A mis-predicted `to` is contained by the validity partition (§Scope) — which is exactly the
  situation in which the prediction can be wrong.
- **Renames use the after-side name.** `applyChanges` replaces only the key node (`src/patch.ts:716`); the
  `KeyValue` never moves, so its slot is stable, and the apply-time lookup reads the *post-rename* key off
  the CST. Also guard the pre-existing spurious-rename case — `{a:1,b:1}` → `{b:1,x:1}` emits
  `Rename a→b` where `b` already exists — by not pushing a duplicate into `sim`.

**API-compat guarantee:** `diff()` called without options must emit **zero** Moves for a pure reorder. That
is the contract for the new optional field, and it gets its own test.

---

## 3. Application (`src/patch.ts` + new `src/update-order.ts`)

### 3.1 Where it runs

In `applyChanges`, the `isMove` branch checks `change.key !== undefined` **first** and only *collects* into
an `objectMoves: Move[]`.

Branch order matters: a document-level Move has `path === []`, and `tryFindByPath` resolves an empty path
to the node itself (`src/find-by-path.ts:6-13`) — so without the check, every document-level Move falls
straight into the legacy `remove()` + `insert()` body at `src/patch.ts:674-698`.

The collected moves are applied in a **second phase, immediately before `return original` at
`src/patch.ts:749`** — *not* right after `applyWrites` at line 720. Three things still mutate the CST in
between:

- the inline-table tighten pass + a second `applyWrites` (lines 726-737)
- `cleanupOrphanedComments`, which splices `Comment` nodes out of `items` (line 743)
- `replaceEmptiedTableArrays`, which calls `insert()` + `applyWrites` (line 747)

By that point `applyWrites` has flushed and cleared `dirty_roots` and both offset maps
(`src/writer.ts:909-911`), so **direct `loc` mutation is safe** — and required.

> **Corollary:** the reorder phase must never call `insert` / `remove` / `replace` /
> `applyBracketSpacing`. Those re-dirty the root and register offsets relative to already-final locations,
> and nothing downstream will flush them.

> **Also:** when the changeset is Moves-only, `applyWrites` at line 720 is a **no-op** — the root was never
> dirtied. So `Table.loc.end` is whatever the parser left there (`src/parse-toml.ts:530-532`, the last
> item's end). Recompute; never assume it has been normalised.

### 3.2 Why not `writer.remove()` + `insert()`

That is the existing Move path, and it is the wrong tool for a permutation:

| Problem | Location |
|---|---|
| `remove()` **deletes** a same-line trailing comment outright and never re-attaches it | `src/writer.ts:522-540` |
| `insertOnNewLine` hardcodes `leading_lines = 2` for `Table`/`TableArray` and `1` otherwise, destroying original spacing | `src/writer.ts:258-266` |
| `prepend_to_document` uses `offset_lines = child_span.lines + 1`, injecting a spurious blank line when a node moves to index 0 | `src/writer.ts:228`, 300 |
| Sticky module state `emptiedByRemove` / `hadNonLastRemoval` / `inlineTablesNeedingTighten`, calibrated for delete-then-add, misfires under a permutation | `src/writer.ts:53-66`, 285-299 |

Instead: permute `items` directly and reflow lines with `shiftNode` (`src/writer.ts:914`) — already a proven
hot path, called on every `parseJS` via `formatEmptyLines` (`src/formatter.ts:227`).

### 3.3 The module

**New file: `src/update-order.ts`**

```ts
export function applyKeyOrderMoves(
  document: Document,
  moves: Move[],
  prePatchNodes: WeakSet<TreeNode>
): void;
```

`prePatchNodes` is captured in `patchCst` before `applyChanges` runs — node identity is stable, since
`remove`/`insert` splice the same objects. It feeds `resolveSlots`' `isEligibleForLeading` predicate so a
key that was *just added* cannot adopt the preceding block's trailing comment. See the ownership doc.

**Step 1 — Normalise.** `normalizeSectionComments(document)` once up front (ownership R5), so a comment
introducing `[b]` is no longer physically parked inside `Table a`.

**Step 2 — Resolve the container.** `path.length === 0` → the Document; otherwise `tryFindByPath`,
unwrapping `hasItem` / `KeyValue.value`. Then **skip unless the result is a `Document`, `Table`, or
`TableArray`**, and skip if no slot matches `change.key`. **Never throw.**

This guard is load-bearing, because `compareObjects` recurses into every nested object — including several
with no matching CST container:

- **Dotted-key implicit tables.** `[t]` with `hello.world = 1` produces a Move at path `['t','hello']`.
  `findByPath` compares `arraysEqual(key, path.slice(0, key.length))` with `key = ['hello','world']`
  (length 2) against a 1-element path — no match, and `findByPath` **throws** (`src/find-by-path.ts:97`).
- **Inline-table interiors** — a full-path match returns the `InlineItem` wrapper, not the `KeyValue`
  (`src/find-by-path.ts:68-73`). Out of scope.
- **AOT-entry sub-tables.** For `[[aot]]` + `[aot.sub]`, `sub` is a *Document sibling* reached via
  `findByPathInAotScope`, not an item of the entry.

**Step 3 — Slots.** `resolveSlots(container, node => prePatchNodes.has(node))`.

**Step 4 — Guards.** At document level, bail out entirely if any slot's items are non-contiguous. Partition
into key-value and section slots (§Scope). Preserve the relative order of `[[aot]]` entries within their
slot, or `toJS` array order silently changes.

**Step 5 — Permute.** For each move in order: find the member slot whose `key` matches `change.key`; no-op
if it is already at logical position `to` within its partition; otherwise splice it into place.

**Step 6 — Relayout.** **Gaps belong to the slot, not the group.** Precompute, *before* permuting:

```
gap[i] = slotStart[i] - slotEnd[i-1] - 1
gap[0] = slotStart[0] - containerFirstLine      # or table.key.loc.end.line for a body
```

After permuting, the slot now at position `i` gets `gap[i]`. Walk the new order accumulating a line cursor
and call `shiftNode(item, { lines: delta, columns: 0 })` on every item in every slot.

Slot-gaps rather than group-gaps buys three properties:

1. **Total height is permutation-invariant** — the multiset of slot heights and the multiset of gaps are
   both unchanged, so `toTOML`'s line array can't grow or shrink and no trailing blank line can leak.
2. **No blank line can appear at the top of the file** — `gap[0]` stays whatever it was.
3. **The codebase's own conventions fall out for free** — 0 within the root-KV run, 1 between sections,
   matching `insertOnNewLine`'s `leading_lines` of 1 and 2. A slot that originally had 2+ blank lines keeps
   them at that *position*, which is the minimal-diff outcome.

Both models satisfy the property that matters most: **an identity permutation produces byte-identical
output.** That gets an explicit test.

> **`columns` must always be `0`.** `shiftNode`'s generic path does `end.column += columns`
> unconditionally (`src/writer.ts:985-991`), which would corrupt multiline strings and hoisted in-brace
> comments. With `columns: 0` every column path is a no-op — the same idiom `formatEmptyLines` uses.
> `shiftNode` also early-returns on a zero delta (`src/writer.ts:922`), so unmoved slots cost nothing, and
> its traverse covers every node type including `TableKey`, `KeyValue.equals`, and nested
> `InlineTable`/`InlineArray` (`src/writer.ts:984-1012`).

**Step 7 — Splice and recompute bounds.** Write the new order back into `parent.items`, then
`recalcContainerEnd` on the container (`Table`/`TableArray`: `max(key.loc.end, max over items)`), and
propagate to `Document.loc.end`. Section blocks at document level need nothing extra — `shiftNode`'s
traverse already moves `Table.key`.

> `Document.loc.end` must be set correctly *here*. `normalizeInlineCommentAlignmentInString` calls
> `recomputeContainerEnds` at the end (`src/comment-alignment.ts:517`), but that helper is **grow-only** —
> if this phase shrinks the document, nothing downstream will fix it.

### 3.4 Invariants

- **`parent.items` array order must equal ascending line order** (for members). `TomlDocument` stores
  `document.items` as its CST (`src/toml-document.ts:89`) and `toJS` walks array order
  (`src/to-js.ts:133-155`), so a divergence makes `toTomlString` and `toJsObject` disagree about the same
  document. Members only — hoisted in-brace comments are legitimately out of line order.
- **No two sibling items may share a line range.** `to-toml.ts` composes each line as
  `before + raw + after` (`src/to-toml.ts:206-217`) and merges colliding writes **silently**; the only
  canary is the multi-line `write` path, which throws on `raw_lines.length !== expected_lines`. This has to
  be guaranteed structurally, but a debug assertion that slot line ranges are disjoint and strictly
  ascending after relayout is cheap insurance.

---

## 4. Files to Modify

| # | File | Change |
|---|---|---|
| 1 | `src/toml-format.ts` | `updateOrder` — 6 wiring points (§1) |
| 2 | `src/diff.ts` | `DiffOptions`, `Move.key`, order emission in `compareObjects` (§2) |
| 3 | `src/patch.ts` | Pass `{ updateOrder }` into `diff`; capture `prePatchNodes`; collect object Moves in the `isMove` branch; call `applyKeyOrderMoves` before `return original` |
| 4 | `src/update-order.ts` | **New.** `applyKeyOrderMoves` (§3.3) |
| 5 | `src/comment-ownership.ts` | **New** — see [`PLAN-Comment-Ownership.md`](./PLAN-Comment-Ownership.md) |
| 6 | `src/writer.ts` | Export the lifted `recalcContainerEnd` (shared with Phase 1) |
| 7 | `src/__tests__/update-order.test.ts` | **New.** Behaviour matrix |
| 8 | `src/__tests__/patch.test.ts` | Split the skipped test at line 4379 |
| 9 | `src/__tests__/diff.test.ts` | Move emission + no-options guarantee |
| 10 | `src/__tests__/toml-format.test.ts` | Option wiring + `console.warn` guard |
| 11 | `src/__tests__/validate-cst.test.ts` | Thread a `format` param; two new invariants |
| 12 | `README.md`, `CHANGELOG.md` | Document the option |

---

## 5. Tests

### 5.1 The skipped test

`src/__tests__/patch.test.ts:4379` calls `patch(existing, obj)` with **no format argument**, so unskipping
it as-is would still fail. Split it in two.

The input is `mytable = {\n   key = "value"\n}\n` patched with `{ new_root: 42, mytable: {...} }`. `mytable`
is a `KeyValue` with an `InlineTable` value — **not** a `Table` — so `rootTableEnd` is `-1`, the index stays
a string, `insert()` falls back to `items.length`, and `new_root` lands last:

```toml
mytable = {
   key = "value"
}
new_root = 42
```

- **default-off test:** the block above, no format argument. *Confirm empirically before writing the
  assertion.*
- **`{ updateOrder: true }` test:** the existing expectation, unskipped.

This is also the canonical **Add-plus-reorder** case, and the reason newly-inserted nodes are made
R2-ineligible for leading comments rather than suppressing Moves in any container that also has an Add.

### 5.2 Behaviour matrix — `src/__tests__/update-order.test.ts`

Root KV reorder · section-block reorder · table-body row reorder · comments travelling (leading run +
trailing) · add + reorder · remove + reorder · dotted-key coalescing (`hello.world` / `b` / `hello.moon`) ·
AOT blocks moving as a unit with entry order preserved · `[a]` + `[a.sub]` as one unit · multiline
inline-table value shifting intact · hoisted in-brace comment staying inside its braces · pinned banner vs
travelling doc comment · `[a] # hdr` staying on its header · comment above a section travelling with it
(the ownership-R5 payoff) · scalar staying before a section under `inlineTableStart: 0` · **identity
permutation ⇒ byte-identical output**.

> **Use a single space before `#`** in tests where a comment should travel verbatim.
> `normalizeInlineCommentAlignmentInString` (`src/patch.ts:148`) only touches comments with **≥2** leading
> spaces (`src/comment-alignment.ts:418`) and regroups them by *consecutive line numbers*, realigning each
> group to a modal baseline column. A reorder can therefore make two previously-unrelated commented rows
> adjacent and force them to a common column — expected output is not always a naive line permutation. Add
> one dedicated padded-alignment test to lock that behaviour in.

### 5.3 Regression and invariants

- **Default-off:** for every case in 5.2, `patch(input, reorderedObj)` with no format returns the input
  byte-for-byte. These exercise the `changes.length === 0` fast path.
- **Existing pins stay green, untouched:** `patch.test.ts:161` ("switching the order of the properties …
  will still produce the same output"), `:1237` ("dotted key-values should keep the order"), `:4399`, and
  all 13 tests in `swap-table-keys.test.ts`. That last file is the best canary that the diff path hasn't
  shifted — it is entirely Add+Remove pairs in shared containers.
- **`diff.test.ts`:** assert the emitted `Move` shape (`{type:'Move', path:[], key:'c', from:2, to:0}`), and
  that a no-options `diff()` emits zero Moves for a pure reorder.
- **`toml-format.test.ts`:** default is `false`; `autoDetectFormatWithCst` always yields `false`;
  `validateFormatObject({updateOrder:'yes'})` throws `TypeError`;
  `resolveTomlFormat({updateOrder:true}, default).updateOrder === true` (guards the positional wiring); and
  a `console.warn` spy around a plain `patch(x, y)` stays clean (guards §1 #2).
- **`validate-cst.test.ts`:** `getOverlaps` / `getInverted` hardcode `new TomlFormat()` (lines 180, 193) —
  thread an optional `format` through them and `expectConsistent`. Run every 5.2 row through it, and add
  two feature-specific checks: member slots in ascending line order, and no two sibling items sharing a
  line range (§3.4).
- **`roundtrip.patch-parse.test.ts`:** reorder, re-`parse()` the output, assert the resulting JS key order
  equals the requested order — the end-to-end proof that the feature did what was asked.

---

## 6. Verification

```
pnpm test                        # full suite; default-off regressions must be untouched
pnpm test comment-ownership      # Phase 1
pnpm test update-order           # Phase 2
pnpm test validate-cst           # loc invariants
pnpm build && pnpm typecheck     # the TomlFormat positional wiring is easy to get wrong
```

Manual check against `src/__fixtures__`: parse a fixture, shuffle the object's keys, patch with
`{ updateOrder: true }` — the output should be a pure permutation with an identical total line count. Then
the same with the option off — output byte-identical to the input.

---

## 7. Ranked risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Hoisted in-brace comments orphaned** and written onto a line another node owns — silent corruption, since `to-toml.ts` merges rather than throws | Ownership R1 uses `start.line <= member.loc.end.line`, which absorbs them. Test 5.2 "hoisted in-brace comment". |
| 2 | **Phase placed after line 720 instead of 749** — `cleanupOrphanedComments` and `replaceEmptiedTableArrays` still mutate `items` afterwards | §3.1. Zero cost to get right. |
| 3 | **Invalid TOML from a scalar landing after a section** (reachable via `inlineTableStart: 0`) | The validity partition, §Scope. ~10 lines, and it also neutralises the emission imprecision. |
| 4 | **An Add steals an existing comment group** — a newly-appended key sits right below a trailing comment run and R2 hands it over | `prePatchNodes` → `isEligibleForLeading`. §3.3. |
| 5 | **`console.warn` on every `patch()` call** if the schema entry is missed | §1 #2 + the spy test. |
| 6 | **Container-path Moves resolving to nothing or the wrong node type** — `findByPath` throws | `tryFindByPath` + type guard + skip. §3.3 Step 2. |
| 7 | **`isMove` branch order** — document-level Moves have `path === []` and fall into the legacy handler | Check `change.key !== undefined` first. §3.1. |
| 8 | **Non-contiguous document groups coalesce**, relocating an untouched block | Detect and bail. §Scope. |
| 9 | **Comment realignment changes expected output** for newly-adjacent commented rows | Single space before `#` in most tests; one dedicated padded test. §5.2. |
| 10 | **`updateOrder` sticks on `TomlDocument`** via `this._format = fmt` | README note. §1. |

---

## 8. Open questions / follow-ups

- **Inline-table interiors** — `{ b = 2, a = 1 }` → `{ a = 1, b = 2 }`. `InlineTable.items` never contains
  comments so grouping is trivial, but positions are column-based on a single line, and the trailing-comma
  flag lives on the last `InlineItem`.
- **AOT-entry interiors** — requires recursing past the `compareArrays` short-circuit under the flag:
  `if (updateOrder && isObject(before[index]) && isObject(after[index])) merge(changes, diff(...))`. Cheap
  in code, but it touches a hot path, so it wants its own benchmark run.
- **Non-contiguous document groups** — gather-and-coalesce rather than bail, once there's a corpus showing
  it's wanted.
- **`writer.remove()` dropping same-line comments** — fixable with the ownership model, but it changes
  behaviour pinned by `swap-table-keys.test.ts`. See the ownership doc's follow-ups.
