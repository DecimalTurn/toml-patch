# Regression: comment ownership for nested inline arrays

**Status: confirmed, unfixed.** Commit `ed99db0` ("feat: implement comment ownership for inline
table/array elements") fixes non-trailing element removal/reorder for **root-level** inline arrays, but
regresses — and in some cases actively corrupts — the same operations when the array is nested inside a
`[table]` or `[[array-of-tables]]` entry. The full test suite was green when `ed99db0` landed because
`src/__tests__/comment-ownership-inline.test.ts` only exercises root-level fixtures (`xs = [...]` directly
at the top level); nothing in the suite covers `[sec]\nxs = [...]`.

Found by probing scenarios the test suite doesn't cover, then diffing behavior against the
pre-`ed99db0` commit (`9ed836e`) to separate genuine regressions from pre-existing gaps.

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

## What needs to change

1. `withUnrelatedRootCommentsProtected` needs a nested-host-aware counterpart: when
   `hostContainer !== root`, the legacy per-container cleanup should be prevented from touching
   `hostContainer`'s own comments too (not just protected from root's), and the group-span `loc` extension
   used for the moved/removed element needs to account for offsets registered against `hostContainer`, not
   `root`.
2. `findHostContainer` needs to resolve through `InlineTable.items[].item` when that item is itself a
   `KeyValue` (the `t = { xs = [...] }` shape), matching how it already resolves through `InlineArray.items`.
3. Multi-element non-trailing removal in one patch needs a repro added to
   `comment-ownership-inline.test.ts` and verified for data loss specifically, independent of comment
   placement.
4. `comment-ownership-inline.test.ts` needs nested-in-`[table]` and nested-in-`[[array]]` variants of every
   existing root-level case before this is considered fixed — their absence is why `ed99db0` shipped with
   this gap unnoticed.

## Recommendation

Until (1)–(2) are addressed, `moveInlineElement`'s wiring into `patch.ts`'s `isMove` branch should be
considered unsafe for any inline array that is not a direct root-level key. The safest immediate mitigation
is to gate `moveInlineElement`'s ownership-aware path on `hostContainer === root` and fall back to the
pre-`ed99db0` plain `remove()`+`insert()` otherwise, until the nested case is fixed and covered by tests.
