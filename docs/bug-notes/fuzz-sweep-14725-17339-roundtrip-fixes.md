# Fuzz3-hardening fixes: the newline before the next table header (14725–17339)

**Status: fixed.** First window of the format-aware `fuzz3` harness
(`scripts/fuzz-run3.ts`, `fuzzOne3` in `src/__tests__/fuzz-patch3.ts`, 3 random mutations per
seed, randomized indentation and multiline options). The sweep started at **14725**, the highest
historical `fuzz3` regression seed, and stopped at **17339**. Branch `dev-multiline`.

```powershell
npx -y tsx scripts/fuzz-run3.ts --seed 14725 --to 100000 --mutations 3 --fast-fail
```

---

## 0. The distiller refused the seed (tooling)

`scripts/distill-seed.ts` classified a patch whose output does not re-parse as `patch-fail`, because
the parse throws inside the shared `try` block. The harness (`fuzz-patch.ts` step 6) calls the same
situation `roundtrip-mismatch`, so `isFailure()` never matched the harness status and the script threw
`Seed 17339 is not a roundtrip-mismatch failure under target ...`. Fix commit `3deed62`: parse the
patched output in its own `try` and report `roundtrip-mismatch` on failure, mirroring the harness.
No library change.

---

## 1. A multiline value in a re-populated table swallowed the next table header

**17339** (full reproduction `72d437e`, distilled test `7e0380c`, fix `52ad73f` in `src/writer.ts`).
Mutation `change-type at .e_h` replaces a table body with an object whose first member renders as a
multiline inline table. The following `[")"."?bc`;?9?".xfogq3ww6u]` header landed on the closing `}`
row of that inline table:

```toml
[a]
x = 1

[b]
```

```js
obj.a = { c: { d: '2' } };
patch(src, obj, { multilineTable: true });
```

```
[a]                 [a]
c = {               c = {
  d = "2"             d = "2"
}              →    }  [b]

[b]
```

Root cause: `insertOnNewLine` (writer.ts) computed the child's exit offset as
`child_span.lines - child_span.lines = 0` for a container emptied by a single removal, so following
rows never advanced past the child's extra lines. Cancelling the whole span is only correct for a
single-line child. Fix: the child reuses the row the removal vacated, so the exit offset is
`child_span.lines + (leading_lines - 2)` — one line less than the normal insert, not zero.

Only `multilineTable` mattered: `multilineArray`, `indentWidth`, `minimumDecimals` and `bracketSpacing`
change nothing, a multiline array does not trigger it, and the empty-key first table and blank line are
not required (the blank line before the next header is, and the source table must be non-empty).

---

## 2. The same swallow on the compensated multi-removal path

**17339** (second distilled test `650397a`, fix `f148f43` in `src/writer.ts`). The seed still failed
after fix 1, so it carried a second instance of the same symptom on a different branch: when the
container is emptied by **more than one** removal, the insert takes the `needsCompensation` path,
which still cancelled the whole span:

```toml
[a]
x = 1
y = 2

[b]
```

```js
obj.a = { c: { d: '2' } };
```

produced `[a]\nc = {\n  d = "2"\n}  [b]` for the same reason. The accumulated removal offset is
already cancelled through `shift`, so this branch needs the same `leading_lines - 2` exit offset. A
comment line inside the table (`[a]` + `# c` + `x = 1`) takes the same path.

Both fixes land in one expression, but as two commits, because the second failure only surfaced once
the first was fixed — the seed was illustrating two distinct paths.

---

## Verification

- `npx -y tsx scripts/fuzz-run3.ts --seed 17339 --to 17339 --mutations 3` → 0 failures.
- `npx -y tsx scripts/fuzz-run3.ts --seed 0 --to 17339 --mutations 3 --fast-fail` → 0 failures.
- `pnpm run test` (2527 passed), `pnpm run typecheck`, `pnpm run lint` → clean.
- Seed 17339 added to `historicalFuzzSeeds3`.

The continued sweep stops at the next seed, **18515** (`patch-fail`, `patch() threw: Error parsing
TOML (7, 49)`), which is a separate failure and not covered here.
