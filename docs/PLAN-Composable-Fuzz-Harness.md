# Plan: Composable Patch Fuzz Harness

## Overview

The patch fuzz suites currently share behavior through `fuzzOne()` but expose that behavior through positional arguments and several variant-specific wrappers. Variant 5 has a separate execution loop because it needs a structure-first AOT generator and an entry-removal mutation strategy.

This plan separates the reusable fuzz lifecycle from the policies that make each variant different:

- document generation
- source transformation
- mutation generation and application
- format generation
- round-trip comparison
- failure reporting and seed replay

The result should let a future variant combine the general corpus with AOT topology, date precision and format randomization without duplicating the harness or changing existing seed behavior accidentally.

## Goals

- Preserve the current deterministic behavior of variants 1 through 4.
- Reuse the general round-trip, format-aware comparison and failure-reporting logic.
- Make document generation replaceable so variant 5 can supply AOT-heavy TOML.
- Make mutation generation replaceable so a variant can require an operation such as removing an AOT entry.
- Keep source transforms such as spaced dotted keys and shortened date fractions composable.
- Keep the existing distillation workflow able to reproduce a failing seed and its exact variant.
- Make the variant configuration readable without positional boolean arguments.

## Non-goals

- Change the patch algorithm or TOML semantics.
- Make every variant use the same document generator.
- Merge patch-lite into the full patch harness. Its valid-operation and rejection contracts are different.
- Change existing seed RNG streams during the initial migration.
- Require every combination of every strategy to run on every pull request.

## Current boundaries

The shared harness in `src/__tests__/fuzz-patch.ts` currently owns:

- `randomToml()` document generation
- `collectPaths()` and `generateMutation()`
- mutation application
- `randomTomlFormat()`
- date and newline normalization
- `deepEqualWithFormat()`
- `fuzzOne()` result construction and failure details

Variants add behavior through positional parameters or wrappers:

| Variant | Current specialization |
| --- | --- |
| 1 | General randomizer and mutations |
| 2 | Spaced dotted-key source transform |
| 3 | Random indentation and multiline format options |
| 4 | Shortened date fractions, sub-second replacements and full format options |
| 5 | Separate AOT topology generator and AOT-focused mutations |

The first refactor should preserve this table's behavior before adding new combinations.

## Proposed architecture

### 1. Define explicit strategy types

Add types near the shared harness, or in a new `src/__tests__/fuzz-harness.ts` module:

```ts
interface FuzzContext {
  seed: number;
  mutationCount: number;
}

type GeneratedSource = {
  source: string;
  description?: string;
};

type DocumentGenerator = (context: FuzzContext) => GeneratedSource;
type SourceTransform = (source: string, context: FuzzContext) => string;
type FormatGenerator = (context: FuzzContext) => Partial<TomlFormat> | undefined;

type MutationStrategy = (input: {
  original: unknown;
  updated: unknown;
  context: FuzzContext;
}) => MutationRun;

interface MutationRun {
  updated: unknown;
  descriptions: string[];
}
```

The real types should use the existing `JsonValue`, `RandomMutation` and `PatchFuzzResult` shapes where possible. Do not expose internal CST types in the public strategy contract unless the strategy needs them.

### 2. Replace positional options with a named configuration

Introduce a `FuzzConfig` object for new callers:

```ts
interface FuzzConfig {
  generateSource?: DocumentGenerator;
  sourceTransforms?: SourceTransform[];
  generateFormat?: FormatGenerator;
  mutate?: MutationStrategy;
  compare?: FuzzComparator;
  mutationCount?: number;
}
```

`runFuzz(seed, config)` should resolve missing strategies to the current Variant 1 behavior. Keep `fuzzOne()` as a compatibility wrapper during migration, but make it call the new runner with the equivalent default config.

The named configuration prevents calls such as:

```ts
fuzzOne(seed, count, transform, true, true, options)
```

from becoming harder to understand as more variants are added.

### 3. Separate generation from parsing and mutation

The shared runner should perform this sequence:

1. Generate source using `generateSource`.
2. Apply all `sourceTransforms` in order.
3. Parse the source, skipping unparseable generated documents using the current policy.
4. Clone the parsed object when the mutation strategy needs a clone.
5. Generate the format using the deterministic format strategy.
6. Run the mutation strategy.
7. Apply `patch(source, updated, format)`.
8. Re-parse the result.
9. Compare using the configured comparator.
10. Return the existing `PatchFuzzResult` shape with strategy descriptions attached.

Each step should retain the current error classification: `patch-fail`, `roundtrip-mismatch` and `error`.

### 4. Preserve RNG streams explicitly

The initial migration must keep the current offsets:

- document generation: existing `randomToml({ seed })` stream
- mutation generation: `seed + mutationCount * 1_000_000`
- format generation: `seed + 500_000`
- shortened fractions: `seed + 700_000`

Represent these offsets in named helpers or a `FuzzSeeds` object. Do not consume extra random values in the default Variant 1 path. New generators, including AOT generation, may define their own documented offsets.

Add a determinism test that runs the same configured seed twice and compares mutation descriptions, format description and result status.

## Variant migration

### Variant 1

- Use the default source generator, default mutation strategy, default format generator and default comparator.
- Make `fuzzOne1()` call the composable runner directly.
- Keep `fuzz-patch.ts` as the shared implementation module, not as an unnumbered user-facing suite.
- Keep `scripts/fuzz-run1.ts` and `pnpm run fuzz1` as the canonical entry point.

### Variant 2

- Configure the default generator and mutation strategy.
- Add `spaceDottedKeySeparators` to `sourceTransforms`.
- Preserve the existing indentation and multiline settings currently used by `fuzzOne2()`.

### Variant 3

- Configure the default generator and mutation strategy.
- Use the format strategy with randomized indentation and multiline options.
- Do not move those options into the source generator. They affect formatting, not document shape.

### Variant 4

- Configure the default generator and mutation strategy.
- Add `shortenFractionalSeconds` to `sourceTransforms`.
- Use the sub-second replacement mutation options and full format strategy.
- Use the existing format-aware/date-aware comparator.

### Variant 5

- Use the structure-first AOT generator from `fuzz-patch5.ts` as `generateSource`.
- Replace the local mutation loop with a `MutationStrategy`.
- Make the first mutation a guaranteed AOT-entry removal when the generated document contains a removable entry.
- Add optional mutation modes for AOT insertion and entry edits.
- Reuse the shared format strategy and comparator. Add format variation only after the structure-only migration is stable.
- Preserve its one-mutation default so a failure identifies the AOT ownership operation.

### Combined exploratory profiles

After the migration, add profiles rather than new numbered harnesses:

- `aot`: Variant 5 generator plus one forced AOT removal.
- `aot-format`: Variant 5 generator plus Variant 4 format and date strategies.
- `aot-general`: Variant 5 generator plus general random mutations.
- `general-format`: Variant 1 generator plus Variant 4 date and format strategies.

Only the stable profiles need bounded tests. Wider combinations can remain CLI-only sweeps.

## AOT generator contract

The AOT generator should return valid TOML and metadata sufficient to describe the generated topology. It should vary independently:

- number of AOT families
- parent key depth
- number of parent entries
- number of nested AOT entries per parent
- presence of entry-owned `[table.subtable]` sections
- presence of nested `[[table.child]]` sections
- unrelated tables between an entry and its owned sub-tables
- empty and non-empty entry bodies
- comments and blank-line placement once comment generation is supported

The generator should not build TOML by concatenating partially escaped key strings. Prefer a small intermediate model or existing CST generation helpers, then serialize it. Each generated source must be parsed before mutation and unparseable documents should be reported with enough context to diagnose the generator.

## Mutation strategy contract

Mutation strategies should return both the updated object and human-readable descriptions. A strategy must declare whether it guarantees at least one mutation.

The AOT strategy should include:

- remove one parent AOT entry while preserving sibling entries
- remove one nested AOT entry while a later parent entry has a sub-table
- append an entry after owned sub-tables
- insert an entry before or between existing entries
- edit a scalar inside an entry
- add or remove an entry-owned sub-table
- optionally reorder entries when comment ownership is part of the profile

Mutation paths must remain in JS-object coordinates. Any conversion to CST coordinates belongs in the patch implementation or a strategy-specific helper, not in the shared comparator.

## Failure reporting and distillation

Extend `PatchFuzzResult` with optional strategy metadata:

```ts
variant?: string;
profile?: string;
generatorDescription?: string;
mutationDescs?: string[];
formatDesc?: string;
```

Update inspection and distillation tools to accept a profile or variant. A failure reproduction must be able to reconstruct:

- the source generator and seed
- all source transforms
- the format seed and resolved options
- the mutation strategy and mutation descriptions

For Variant 5, add a distillation mode that writes the generated AOT source and replays the strategy's concrete mutation rather than trying to reproduce it through the general path picker.

## Test plan

### Phase 1: characterization

- Add tests proving the current Variant 1 through Variant 4 profiles produce the same status and mutation descriptions for a fixed seed.
- Add a determinism test for the new runner.
- Keep the existing historical seed tests unchanged.

### Phase 2: extract the runner

- Move only execution, comparison and result construction into the shared runner.
- Keep the old `fuzzOne1()` through `fuzzOne4()` wrappers and compare their results with the pre-refactor behavior over a bounded seed list.

### Phase 3: migrate Variant 5

- Replace the local fuzz5 execution loop with the shared runner.
- Keep its current 100-seed bounded test and 200-seed CLI sweep.
- Add direct tests for each AOT mutation strategy operation.

### Phase 4: add combined profiles

- Add an AOT plus format profile.
- Add AOT comments and multiline values.
- Run a bounded sweep and record any failures as distilled tests before fixing library behavior.

### Phase 5: remove transitional wrappers

- Keep the named `fuzzOneN()` wrappers and numbered scripts as the stable CLI API.
- Remove only internal compatibility code that no caller or distillation tool uses.
- Update `docs/Fuzz-Testing.md`, instructions, prompts and CI commands together.

## Acceptance criteria

- Existing Variant 1 through Variant 4 historical seeds pass without seed drift.
- Variant 5 continues to find and reproduce AOT entry ownership cases.
- A new profile can combine the AOT generator with Variant 4's date and format strategies without copying the runner.
- A failing profile reports enough metadata to reproduce the exact source, format and mutation sequence.
- `pnpm run typecheck`, `pnpm run lint` and `pnpm run test` pass.
- The numbered CLI commands remain clear: `fuzz1`, `fuzz2`, `fuzz3`, `fuzz4` and `fuzz5`.
- The documentation explains which dimensions each profile covers and which it intentionally omits.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Existing seeds change because RNG calls move | Preserve default offsets and add characterization tests before extraction |
| A strategy generates invalid TOML | Parse generated sources before mutation and test the generator independently |
| AOT strategy hides failures behind multiple mutations | Force one first mutation and keep one-mutation as the default profile |
| Format-aware comparison masks a real data change | Reuse the existing comparator only for its documented normalization rules and add strict comparison profiles |
| The shared runner becomes another large abstraction | Keep strategies small, keep the runner linear and avoid strategy-specific branches in the runner |
| Distillation cannot replay custom mutations | Store concrete mutation descriptions or a serializable mutation plan in the result |

## Open decisions

- Should the strategy interfaces live in `fuzz-patch.ts` or a new `fuzz-harness.ts` module?
- Should generated AOT documents be built from a JS model, a CST model or a hybrid model?
- Should comments and format variation be part of the first AOT plus format profile or a follow-up?
- Should strict and format-aware comparators be selectable per profile or run together for every failure?
- Should profile definitions live in TypeScript only or also be exposed as named package scripts?
