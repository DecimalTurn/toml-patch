# Regression: comment ownership for nested inline arrays

**Status: fixed.** Commit `ed99db0` ("feat: implement comment ownership for inline table/array
elements") fixed non-trailing element removal/reorder for **root-level** inline arrays, but regressed
— and in some cases actively corrupted — the same operations when the array is nested inside a
`[table]` or `[[array-of-tables]]` entry, plus caused data loss when removing 2+ non-trailing elements
in one patch (even at root level). The full test suite was green when `ed99db0` landed because
`src/__tests__/comment-ownership-inline.test.ts` only exercised root-level fixtures (`xs = [...]`
directly at the top level); nothing in the suite covered `[sec]\nxs = [...]`.

Found by probing scenarios the test suite didn't cover, then diffing behavior against the
pre-`ed99db0` commit (`9ed836e`) to separate genuine regressions from pre-existing gaps. Failing specs
pinning the desired behavior were added first (see `comment-ownership-inline.test.ts`'s "nested inside
a [table] or [[array-of-tables]] (regression)" describe block), then fixed — see "Root cause and fix"
below for what actually shipped, and "Investigation notes" further down for how the diagnosis was done.

## Root cause and fix

Both bugs traced to `writer.ts`'s `remove()`/`insert()` legacy "orphaned comment" compensation block,
which pre-`ed99db0` only ever ran against `root.items` (literally `Document.items`):

1. **Wrong array.** When an inline container is nested inside a `[table]`, the comments hoisted out of
   it physically live in that Table's own `.items`, not `Document.items` — a completely different
   array. Scanning `root.items` found nothing to compensate, so the hoisted comments inherited whatever
   traversal-order offset happened to be active when next visited, corrupting their line (in the worst
   case, destroying the array's own opening bracket).
2. **Stale reads across sequential calls.** The compensation block mutates a surviving comment's
   `.loc.start.line` immediately, as a pre-compensation for an offset that only resolves once
   `applyWrites` runs. `moveInlineElement` already flushed `applyWrites` right after itself for exactly
   this reason (see its docstring), but `removeMember` didn't. When two `removeMember` calls landed
   back-to-back in one patch (removing 2+ non-trailing array elements), the second call's
   `resolveInlineElementSlots` read the first call's *unresolved* pre-compensated positions as if they
   were final, misattributing comment ownership and eventually colliding two comments onto the same
   line — which the stringifier can't represent, dropping content.

Fix, in two parts:

- `remove()`/`insert()` in `src/writer.ts` gained an optional `hostItems` parameter, used instead of
  `root.items` when provided. `comment-ownership.ts`'s `removeMember()`/`moveInlineElement()` now pass
  `hostContainer.items` explicitly (from `findHostContainer`), so the compensation always scans the
  array the hoisted comments actually live in. This made the `withUnrelatedRootCommentsProtected()`
  detach/restore workaround unnecessary — it was only ever needed because the wrong array was being
  scanned — so it was retired rather than kept alongside the real fix.
- The scan is additionally bounded to comments within the inline container's own line span
  (`parent.loc.start.line`..`parent.loc.end.line`). This was necessary because `hostItems` (root or a
  nested Table's items) can hold many comments with no relation to the container being modified at all
  — explanatory prose between sibling keys, another key's own trailing comment. Scanning the whole
  array and applying the line-based heuristic indiscriminately corrupted those unrelated comments the
  moment a real document had more than just the hoisted ones in it (caught by
  `patch.spec-example.test.ts`'s `key6` case, which sits in a `[array]` table alongside several
  unrelated comments).
- `removeMember()`'s inline-container branch now calls `applyWrites(root)` immediately after its own
  `remove()`, mirroring `moveInlineElement`'s existing discipline, so a second `removeMember`/
  `moveInlineElement` call on the same container always starts from fully-resolved state.

## Investigation notes

The rest of this document is the original investigation that found the regressions, kept as a record
of what was probed and why — it predates the fix above.

## Root cause

The implementation is only correct when `hostContainer === root` (the array is a direct root key). When
the array lives inside a `[table]`, the hoisted comments physically live in `Table.items`, not
`Document.items` — but `writer.remove()`'s legacy per-container comment cleanup unconditionally scans
`root.items`. `withUnrelatedRootCommentsProtected()` (added in `ed99db0`) stops that legacy code from
corrupting *unrelated* root-level comments as a side effect, but does nothing to correctly compensate the
comments that legitimately live in the nested host container — and the group-span `loc` extension trick
used for the moved element then compounds the miscomputation instead of merely leaving it alone.

## Genuinely fixed by `ed99db0` (root-level arrays)

| Case | Before (`9ed836e`) | After (`ed99db0`) |
|---|---|---|
| Leading own-line comments + non-trailing removal | comments scattered as garbage | correct |
| Nested value arrays (`xs = [[1],[2],[3]]`), remove middle | `# one` dropped, `# two` stranded | correct |
| Pure reorder, no removal | `# three` lost entirely | correct |
| Array of inline tables, remove first element | `# one` stranded on the `]` line | correct |

## Regressions introduced by `ed99db0` (arrays nested in a table)

### Non-trailing removal in a nested array now emits invalid TOML (was already broken, now worse)

Input:
```toml
[sec]
xs = [
  1, # one
  2, # two
  3,
]
y = 9
```
`v.sec.xs.splice(1, 1)` (remove the middle element):

- **Before (`9ed836e`):** invalid-looking but structurally intact —
  ```toml
  [sec]
  xs = [
    1, # one
    3, # two

  ]
  y = 9
  ```
- **After (`ed99db0`):** the opening bracket is destroyed —
  ```toml
  [sec]
  xs = # one
    1,
    3,
  ]
  y = 9
  ```
  This does not re-parse as valid TOML.

Same failure mode for an array inside `[[aot]]`.

### Removing 2+ non-trailing elements from a nested-context array loses data

Input: `xs = [1,#one 2,#two 3,#three 4,]` (root-level, for isolation). `v.xs.splice(0,1); v.xs.splice(0,1)`
(remove first, then remove the new first — net effect: drop `1` and `2`, keep `3` and `4`):

- **Before:** comments misplaced but no data lost —
  ```toml
  xs = [
       3,
       4,    # one
  ]          # two
  ```
- **After:** element `4` is gone entirely, and two comments have been concatenated into one token —
  ```toml
  xs = [
       3,
       # onethree
  ]
  ```

### Array nested inside a multiline inline table isn't reached at all

`findHostContainer()` walks `KeyValue.value` / `InlineTable.items` / `InlineArray.items` /
`InlineItem.item`, but does not currently resolve through an `InlineTable`'s own `KeyValue` entries in the
way needed for `t = { xs = [...] }` (a multiline inline table whose own value is a multiline inline array).
For this shape, `findHostContainer` returns `undefined`, and the code silently falls through to the old,
comment-oblivious `remove()`+`insert()` path — same (pre-existing, buggy) output before and after `ed99db0`.

## Confirmed pre-existing (not caused by `ed99db0`)

- Trailing-element removal from a *nested* array already produced comment misplacement before `ed99db0`
  (see the "before" column in the two nested-array cases above) — not a regression, just not improved.
- The array-inside-multiline-inline-table case, as noted above.

## What needed to change (done, see "Root cause and fix" above)

1. ~~`withUnrelatedRootCommentsProtected` needs a nested-host-aware counterpart~~ — done differently:
   retired in favor of `remove()`/`insert()` scanning the correct `hostContainer.items` array directly
   (via the new `hostItems` parameter), bounded to the inline container's own line span.
2. Multi-element non-trailing removal in one patch: fixed by flushing `applyWrites` immediately after
   `removeMember`'s inline-container branch, matching `moveInlineElement`'s existing discipline.
3. `comment-ownership-inline.test.ts` gained a "nested inside a [table] or [[array-of-tables]]
   (regression)" describe block covering all of the above, plus a "shapes that are NOT regressed"
   block confirming inline-table key removal and array-of-inline-tables removal were unaffected.

## Follow-up (fixed later, in #264)

`findHostContainer` did not resolve through `InlineTable.items[].item` when that item is itself a
`KeyValue` (the `t = { xs = [...] }` shape — a multiline inline table whose own value is a multiline
inline array). For this shape it returned `undefined` and both `removeMember` and `moveInlineElement`
fell through to the old, comment-oblivious `remove()`+`insert()` path, stranding the removed element's
comment near the closing bracket.

Left out of this document's fix as a distinct root cause, pinned as a skipped spec, and fixed
afterwards by adding the missing unwrap:

```ts
if (isKeyValue(value)) return searchValue(value.value, container);
```

An inline table stores its entries as `InlineItem`s wrapping a `KeyValue`, so reaching anything under
one of its keys means stepping through that `KeyValue`'s value — which the walk already did at the top
level but not when recursing. Its spec is now live in `comment-ownership-inline.test.ts` ("nested inside
a multiline inline table"), alongside a second case covering the stray blank line the same path left
behind when no comments were involved.
