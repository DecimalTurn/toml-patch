# Fuzz3-hardening fixes: generated containers take the column of their key (17339 to 100000)

**Status: fixed.** Second window of the format-aware `fuzz3` harness (`fuzzOne3` in
`src/__tests__/fuzz-patch3.ts`, 3 random mutations per seed, randomized indentation and multiline
options). The sweep resumed right after 17339 and ran clean to 100000. Branch `dev-multiline`.

```powershell
npx -y tsx scripts/fuzz-run3.ts --seed 60001 --to 100000 --mutations 3 --fast-fail
```

---

## 1. A generated compact array kept a stale end column (18515)

**18515** (full and distilled reproduction `82dc8a8`, fix `010f895` in `src/writer.ts`). A compact
inline array whose element table is multiline wrote its item comma at the container's origin column:

```toml
b.c = 1
```

```js
obj.b = [1, { d: { e: { f: 1 } } }];
patch(src, obj, { inlineTableStart: 1, trailingComma: true, multilineTable: 2, multilineArray: 1 });
```

The array stays compact (`multilineArray: 1` keeps depth 1 compact) while the table inside it is
multiline, so the parent span covers several lines even though the parent itself has no structural
rows. `shiftNode` only rigid-shifted the end column of a generated container when its layout flag was
exactly `true` (multiline), so that compact array kept the end column it had when `parseJS` built it.
The following item was then written past the array's own `]` and the re-parse failed with
`Consecutive commas in inline table`.

The same failure reproduces through `stringify` alone, so it was never patch-specific.

Fix: the generic move in `shiftNode` now treats every container with a registered layout
(`getInlineContainerLayout(...) !== undefined`) as origin-relative. The three `=== true` tests became
`!== undefined`, because a generated container carries a generated end column even when its span is
multi-line (a compact parent holding a multiline descendant).

---

## 2. Generated multiline containers align with the key that owns them (fe59f4a)

The library now guarantees that a generated multiline container breaks its rows and closes its bracket
in the column of the key it belongs to. Before this change the nested rows were laid out from the
enclosing container's indent and root key-values were never normalized at all, so a generated
`b = [ ... ]` could end its rows in an arbitrary column.

`normalizeInlineContainerRows(container, anchorColumn, indentWidth, bracketSpacing)` in
`src/formatter.ts` is the single layout rule:

- multiline rows sit at `anchorColumn + indentWidth` and the closing delimiter at `anchorColumn`;
- a nested container is anchored on the key column of its own row;
- a keyless array element uses `max(indentWidth, 2)`;
- a compact container whose items merely span lines keeps its own end, so only genuinely multiline
  containers snap to the anchor column.

It is called from `parse-js.ts` (the final pass also covers generated root key-values, which bypass
`formatTopLevel` at `inlineTableStart: 0`) and from `patch.ts` for replaced inline containers, after
`applyWrites` and `deleteSubtreeRanges`. That deletion matters: a regenerated subtree carries its
`range` into the standalone snippet, so `toTOML` copied the stale snippet text and ignored the
corrected `loc`.

### 2.1 Siblings that share a grown end row are re-anchored (2151)

Test `distilled regression for fuzz3 seed 2151`. `s.f` becomes
`[[true,], [false, { flag = true }], "three",]` with `multilineTable: true`. The multiline element
table grows the row it shares with `[true,]`, so the later siblings were left at their pre-growth
columns and the separators collided (`,,`). They are re-anchored with `getCommaSpace(container) ?? 2`.

### 2.2 A compact container must not snap its bracket to the key column (14739)

Test `16f50da`. `b = [1, { d: [2, { e: { f: 1 } }] }]` with `multilineTable: 0`: the element table is
multiline, but `d = [ 2, {...}, ]` stays compact. Snapping that `]` to the key column places it before
the element's `}`, and the element's comma then collides with it.

```toml
b = [ 1, {
           d = [ 2, {
                      e = {
                        f = 1,
                      },
                    }, ], 
         }, ]
```

Compact containers therefore keep their own end column; only containers that
`isMultilineInlineContainer` accepts are normalized to the anchor column.

---

## 3. Seed 18868 was resolved by the layout work

The sweep had stopped at **18868** before the indentation work (`patch-fail`,
`Error parsing TOML (9, 10)`: an AOT entry replaced by an array under a compact array holding a
multiline inline table). With `fe59f4a` in place the seed reports 0 failures:

```powershell
npx -y tsx scripts/fuzz-run3.ts --seed 18868 --to 18868 --mutations 3 --fast-fail
```

The generated rows are now repositioned instead of relying on a frozen end column, so no separate fix
commit was needed. The seed is registered in `historicalFuzzSeeds3` (`980ab95`) to keep the check.

---

## Verification

- `npx -y tsx scripts/fuzz-run3.ts --seed 0 --to 60000 --mutations 3 --fast-fail` → 0 failures.
- `npx -y tsx scripts/fuzz-run3.ts --seed 60001 --to 100000 --mutations 3 --fast-fail` → 0 failures (40000 seeds).
- `pnpm run test` (2533 passed, 1 skipped), `pnpm run typecheck`, `pnpm run lint` → clean.
- `historicalFuzzSeeds3` gained 14739 and 18868; the 7490 and 14725 expectations were re-anchored to
  their keys (`31c8821`).

The continued sweep starts at **100001**.
