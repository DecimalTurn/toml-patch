# Fuzz Testing for Patching

## The idea

The `patch` function has a hard guarantee to uphold: apply an edit to a TOML
document while preserving its comments, whitespace and formatting. But while those are nice to keep, the crucial part remains to make sure that we don't mangle the data as this is what actually matters in the end.

So, there's clearly a need to harden the patch function and a good way to discover bugs remain fuzzing: we *generate* TOML documents and
mutations at random, apply `patch`, and check that the result round-trips
correctly (see `src/__tests__/fuzz-patch.ts` and its `randomizer.ts`).

## The method

1. **Generate** a random TOML document and a random set of mutations (add key,
   delete key, change value, change type, add/remove array item, etc.).
2. **Apply** `patch(src, mutatedObj)` and verify the output re-parses to the
   expected object and preserves the source's comments and formatting.
3. When a seed fails, **distil** the failure into the smallest readable TOML +
   mutation that still reproduces the bug (see the distillation process below),
   and add it as a test marked `.fails`.
4. **Confirm** the distilled test fails in the same way as the original seed.
5. **Fix** the bug associated with that test.
6. **Run** the test to make sure it now passes, *and* re-run the specific seed
   to confirm the seed passes too.

## Fixing the bugs discovered by the fuzzing suite

When a seed fails, the first step is to create a reproduction of the TOML input
and the mutations that triggered it. We then run that test to confirm that it
fails, so we are sure it replicates the bug the seed flagged.


### Generating the seed's test scaffold automatically

Rather than copying a seed's TOML and mutations by hand, a helper script
generates a test from a seed and appends it to `src/__tests__/patch.fuzz.test.ts`:

```powershell
npx -y tsx scripts/generate-seed-test.ts --seed <N> [--mutations <N>] [--dry-run]
```

What it does:

- recomputes the seed's deterministic TOML document and mutations using the
  same RNG offsets as `fuzzOne` (`seed + mutationCount * 1000000`);
- emits a `test('regression for fuzz seed <N>', …)` that holds the TOML in a
  `dedent` template, and replays each mutation as a plain-JS statement
  (`obj.x = …`, `delete obj.x`, `obj.arr.splice(…)`) — no fuzz internals are
  needed in the test file;
- asserts `expect(parse(result)).toEqual(obj)`;
- when the patch round-trips cleanly, it also emits an exact
  `expect(result).toEqual(dedent…)` expectation; when it does not (a failing
  seed), it leaves a `// TODO` placeholder instead, reminding the next agent to
  fill in the exact-output expectation after the bug is fixed.

Use `--dry-run` to print the generated body to stdout instead of writing to the
file.

Be aware that the script only produces the *scaffold*: the seed's full TOML is
rarely the minimal repro, so the distillation step below must be applied.

### Distillation of seed tests

Because the TOML input might be too big to be a minimal example of the bug, we
must start removing elements of the TOML input, simplifying some keys to
make it more readable to a human (unless the keys special characters or arrangement are needed to trigger the bug) and remove mutations that don't contribute to the bug. After every change to the originally created test, we make
sure that the test still fails in the same way as the original. When we reach
the simplest version of the test we can think of, that is when the test is
considered distilled.
Once the test is distilled, commit it (in its failing, `.fails`-marked state) as
a self-contained regression: the distilled TOML + mutations together with the
`src/__tests__/patch.fuzz.test.ts` entry. This keeps a clean history where every bug
lands as one "failing test" commit followed by one "fix" commit, and lets the
distillation be reviewed independently of the eventual code change.
Note that if we then fix the code to make the test pass and the seed still
doesn't pass, this would indicate that the seed was illustrating more than one
problem, so we would need to restart the process of distillation for this issue
as well, starting from the full TOML input.


### Fixing the bug

Once the test is distilled and confirmed to fail, the associated bug in
`patch.ts` (or elsewhere in the source) is fixed. After the fix:

- the distilled test must pass, and
- the original seed must also pass.

If the test passes but the seed still does not, the seed was exhibiting more
than one distinct bug, so the distillation loop above starts again from the
full TOML input.

## Why the diff algorithm struggles with simultaneous edits

A core design choice makes the public API almost trivially easy to use: `patch`
accepts a plain JavaScript object and applies all of its differences to the
TOML document in one go. For the consumer that is very convenient, the object
encodes an arbitrary amount of changes at once.

But it comes at the price of predictability. The alternative, the approach
taken by the `toml-edit` package (a single modification at a time), makes it
far easier to anticipate how offsets shift as the document is rewritten. When
many changes are applied simultaneously, deletions, renames and moves can
collapse onto and overlap each other, producing a much larger and subtler space
of edge cases.

In short, the diff algorithm was never really designed to accommodate too many
changes at the same time and that mismatch is where a lot of the patching
bugs come from.

## The downside

Fuzzing converges on a fix fast, but the fixes tend to be narrow. AI agents, in
particular, will often add a few lines of guarded code to handle the exact case
the seed exposed, rather than rethinking the underlying logic. Over many seeds
this leads to:

- **Code bloat** — many small conditional branches accumulate in `patch.ts`,
  inflating the shipped bundle even though each individual fix is tiny. This
  shows up as a larger `dist/toml-patch.js`. To measure the impact of a branch
  of fixes against the `latest` branch, run:

  ```powershell
  pnpm compare-branch-size latest
  ```

  (see `scripts/compare-branch-size.mjs`, which builds both branches and prints
  a minified and gzipped size comparison table).

- **Performance cost** — each added check runs on *every* patch, even though
  most only matter for rare edge cases. The common path pays a small toll for
  correctness in the long tail.

This tendency to patch the symptom rather than the architecture is the reason
the edge cases keep multiplying. Agents, left unattended, naturally avoid
restructuring the diff paradigm and instead go straight into `patch.ts` to add
conditional logic for whichever case just surfaced. At a small scale this is
fine, but the sheer volume of changes needed to make `patch` robust means the
edge cases (caused by deletions, renames, moves, collapsing and overlapping
rows) never really end.

> **Important:** if there is a paradigm-level way to rethink
> how edits are applied that would eliminate a whole class of bugs, prefer that
> over endlessly adding new lines to `patch.ts`. Narrow guards accumulate into
> bloat and slow down the common path, and they do not fix the underlying
> mismatch explained above.

## The upside

In exchange, bugs are fixed fast, and the patch feature stays trustworthy. A
single mangled TOML document can be catastrophic for a user who depends on
format preservation (config files, generated content, round-trip edits). Fuzz
testing keeps the core promise intact, one distilled regression test at a time.
