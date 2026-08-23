# Fuzz sweep 0..3,000,000 round-trip fixes

The rerun reported 16 failures: 15 malformed round-trips and one patch exception.
The original seeds were rechecked with `scripts/fuzz-run.ts` after the fixes and
all report `FAILURES: 0`. The distilled regressions live in
`src/__tests__/patch.fuzz.test.ts`.

## Fixes

- **175924**: deleting a multiline string member inside a nested array left the
  enclosing array's closing bracket and comma offsets stale. Fixed by the
  multiline-container transaction in `aa60a53`.
- **377453, 771152, 863664, 1112646, 1286183, 1383962, 1693919, 1896226,
  2185943, 2497422, 2531104, 2667551, 2824408, 2858114**: edits or removals
  involving multiline inline arrays/tables applied overlapping item-level
  offsets. The planner now coalesces affected multiline container changes and
  keeps physical multiline values out of unsafe move chains. Fixed in
  `aa60a53`.
- **2591153**: array removals emitted in original-array coordinates were moved
  past same-array additions, so a later removal addressed a nonexistent index.
  `Remove` changes now carry internal non-enumerable source-coordinate metadata
  and `reorder()` places them before same-array additions. Fixed in `aa60a53`.

## Distillation

Each failure was reduced against the pre-fix control commit `3a593d0`, with the
same deterministic mutations and formatting options as the authoritative fuzz
harness. Fifteen seeds reduced to one contributing mutation. Seed `2591153`
required all three mutations, and was manually reduced to the affected nested
array plus the deletion that shifts the surrounding document.

The reducer is tracked at `scripts/distill-seed.ts`; it rejects invalid source
candidates, preserves the AOT mutation guard and emits the seed's format so a
reduction cannot silently change the bug.

## Validation

- All 16 original seeds: clean individual reruns.
- All 16 distilled regressions: passing.
- `pnpm run typecheck`: passing.
- `pnpm run lint`: passing with three pre-existing warnings in
  `src/__tests__/patch.test.ts`.
- `pnpm run build`: passing.

The complete Vitest suite still contains unrelated legacy exact-format failures
in the pre-existing multiline fuzz regressions. They are outside this sweep's
reported seeds and are not changed by the final validated fuzz scope.
