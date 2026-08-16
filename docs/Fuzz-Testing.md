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

## Debugging strategies

A distilled `.fails` test narrows the *what*, but not the *why*; the remaining
work is finding the faulty line in the writer/diff and the exact offset that is
wrong. These techniques have repeatedly shortened that loop:

### 1. Use the right tool for the right job: `fuzz-run.ts` to detect, `fuzz-investigate.ts` to diagnose

The two scripts answer different questions and must not be confused:

- **`fuzz-run.ts`** (`fuzzOne`) is the *detection* tool and the authority on
  "is this seed actually broken?". It compares with `deepEqualWithFormat`,
  which normalises `\r\n`↔`\n` and truncates zero-time dates per
  `truncateZeroTimeInDates` — the same tolerance the suite enforces. It also
  replicates `fuzzOne`'s AOT-entry mutation guard. Use it to sweep ranges and
  to confirm a fix ("0 failures").
- **`fuzz-investigate.ts`** is the *diagnosis* tool for a seed you *already know*
  is bad. It uses a stricter raw `diffPaths` comparison, dumps the expected vs
  re-parsed objects, and prints the **full original and full patched TOML
  line-numbered** — the fastest way to see exactly *where* (line/column) the
  output went wrong before you start dumping the CST. Its raw comparison is a
  *feature*, not a bug: it surfaces discrepancies `fuzzOne` intentionally
  ignores (e.g. `\n` vs `\r\n`), which is sometimes precisely what you need while
  tracing. It also re-derives mutations deterministically, so it never applies a
  mutation that `fuzzOne` would have skipped — which is why a "DIFFS: N" here can
  be a false positive relative to the sweep.

So: **prefer `fuzz-run.ts` for "is it broken?"** (if they disagree, `fuzz-run.ts`
wins), and **prefer `fuzz-investigate.ts` for "what changed, line by line?"** once
you're drilling into a confirmed failure.

### 2. Reproduce the seed faithfully, don't transcribe it

Hand-transcribing a seed's TOML (or its array literals) flips the diff — a
`null` vs `-inf`, or a re-ordered literal, changes `compareArrays`' behaviour
and makes the bug vanish (or appear different). Recompute the exact input and
mutations from the RNG instead, mirroring `fuzzOne`:

```ts
const generated = randomToml({ seed });
const obj = deepClone(parse(generated.toml));
const mutationRng = new SeededRandom(seed + mutationCount * 1000000);
// apply generateMutation/applyMutation in a loop, exactly like fuzzOne
// pass randomTomlFormat(new SeededRandom(seed + 500000)) — the FORMAT matters:
//   truncateZeroTimeInDates / minimumDecimals / newLine all change the output.
```

The **format** is a first-class input: many "DIFF" results only reproduce with
the seed's `randomTomlFormat`, not the default (e.g. seed 299772's `0NaN-NaN-NaN`
LocalTime corruption only appeared with `truncateZeroTimeInDates: true`).

### 3. `dedent`-based fixtures strip the trailing newline

Tests written with `dedent` (most of the suite) produce input with **no**
trailing newline, and `patch` round-trips that faithfully. When asserting an
exact `toEqual(dedent…)`, compute the expected string from the *actual* output
(not a guessed `\n`-suffixed string) — a stray trailing `\n` or a `2` vs `2.0`
(`minimumDecimals`) is the classic way a freshly-written exact-output assertion
fails.

### 4. Dump the CST to see the *positions*, not just the rendered text

The rendered string is the symptom; the bug is almost always a stale
`loc` (start/end line/column) on some node. `parseDocument(src).cst` exposes the
tree, and it is quick to write a small recursive dumper that prints each node's
`type`, `key`, and `loc`. Comparing the CST **before** vs **after** `patch`
(and against the node you expect to move) pinpoints exactly which node kept a
stale end line/column — the root cause behind the inline-table-absorption bug
(seed 272851) and most writer-offset bugs.

### 5. Trace the offsets through the writer

`writer.remove()`/`writer.insert()` register *enter/exit* offsets that
`applyWrites` then applies in a single depth-first pass with running
`offsetLines`/`offsetColumns` accumulators. When a collapse "doesn't propagate"
up to an enclosing container's sibling, the offset is being zeroed or placed on
the wrong target (an enter offset on the inner container vs. an exit offset that
reaches the sibling). Knowing the target selection rules in `remove()`
(`previous` → exit offset; first item of a Table/TableArray → the table's key;
otherwise the parent itself) is the fastest way to see *why* a shift is missing
or double-counted.

### 6. Simplify nesting level-by-level, keeping each failure

Reach a minimal repro by deleting structure while re-running after each change;
only continue when the distilled test still fails in the same way. If a
reduction *stops* failing, you removed something load-bearing (e.g. the nested
inline table, the trailing sibling, or the multiline-string value) — put it back
and cut elsewhere. A seed often encodes **more than one** independent bug (seed
299772 had both an AOT-entry-collapse bug and a `LocalTime` truncation bug); fix
one, and re-run the full seed to see whether a second remains — then distill and
repeat.

### 7. Guarded fixes: keep them as narrow as possible, and prefer `instanceof`

Narrow guards are the norm (see "The downside"), but scope them to the exact
shape that reproduces the seed (e.g. skip truncation only for `value
instanceof LocalTime`, not "any value with year < 1"). A broad fix that looks
more general almost always regresses other seeds — the `addedBefore` diff change
regressed ~38 seeds and was reverted; the surviving fix touched only the one
refused-move Add branch.

### 8. Commit discipline keeps the history reviewable

One distilled `.fails` test commit, then one fix commit (test flipped to
`test`), then the sweep-notes doc. If the seed still fails after the fix, it has
more than one bug — start a new `.fails` from the *full* seed, not the
just-distilled fragment.

