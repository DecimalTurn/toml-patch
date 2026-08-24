# Plan: expose patch verification as a documented option

> **Line references** are against `dev-fuzz-bug-fixes`@caefc6d.

> **Relationship to [`PLAN-CST-Positions.md`](./PLAN-CST-Positions.md):** that plan removes the *need* for
> verification. This one improves how verification is *exposed* while it is still load-bearing. They are
> independent, and this one is much smaller. If the positions work lands first, most of this plan becomes
> moot and only the opt-out survives as a performance escape hatch.

---

## Overview

`patch()` and `TomlDocument.patch()` verify their own output today: the result is re-parsed and compared
against the object that was requested, and if it does not round-trip the patch is retried with the
transactional writer. That mechanism is what fixes 24 seed regressions on `dev-fuzz-bug-fixes`, and it is
currently **entirely internal** — no option, no error, no way to observe it.

That was deliberate. It kept the branch a patch release: the generated `.d.ts` is byte-identical to
`origin/latest`. The cost is that three genuinely useful behaviours were dropped on the floor:

1. **An opt-out.** Verification costs ~1.38x on documents that contain a multiline string inside a
   multiline inline container. Every other shape is gated out at ~1.00x (see
   `hasMultilineStringDelimiter` / `hasTransactionCandidate`), so this only bites the documents that need
   it — but a caller patching those in a hot loop has no way to decline.
2. **Fail-fast.** When neither attempt round-trips, `patch()` currently returns the fine-grained result,
   which is known-wrong output. It does that so nothing fails where earlier versions succeeded. A caller
   who would rather hear about it cannot ask.
3. **Transactional `TomlDocument.patch()`.** `patchCst()` mutates the nodes it is handed, so a failed
   patch leaves `_cst` spent. The branch had a rollback that re-derived the tree from the pre-patch
   source; it was removed with the throw. Today a failed patch commits the fine-grained result instead,
   which is at least self-consistent, but "the document is unchanged on failure" is the stronger contract.

This is a **minor release**: it adds public API.

---

## Deliverable

```ts
export interface PatchOptions {
  /** Verify the output round-trips to `updated`. Default: true. */
  validate?: boolean;
  /** Throw instead of returning unverified output. Default: false. */
  strict?: boolean;
}

function patch(existing: string, updated: any, format?: ..., options?: PatchOptions): string;
class TomlDocument { patch(updatedObject: any, format?: ..., options?: PatchOptions): void }
```

Three behaviours, chosen by the two flags:

| `validate` | `strict` | behaviour |
| :--- | :--- | :--- |
| `true` (default) | `false` (default) | verify, retry, fall back to the fine-grained result. **Today's behaviour.** |
| `true` | `true` | verify, retry, `throw` if neither round-trips |
| `false` | — | skip verification, return the first attempt |

Splitting `strict` out of `validate` is the part worth arguing about. The previous iteration of this work
conflated them: verification implied the throw, which made the perf gate observable and cost 5 seed
regressions when the gate skipped a document whose output was wrong anyway. Keeping them separate means
the gate stays *unobservable* in the default configuration, which is what makes it safe (see
`hasTransactionCandidate`'s doc comment).

---

## Work

### 1. Restore the option plumbing

Most of this is a revert of `9d0061e`, which has the complete prior implementation:

- re-add `src/patch-options.ts` with `PatchOptions` (now two fields)
- re-export the type from `src/index.ts`
- thread `options` through `patch()` and `TomlDocument.patch()`
- `git show 9d0061e` is the diff to invert

### 2. Gate interaction

`validate: false` must short-circuit **before** `hasMultilineStringDelimiter` / `hasTransactionCandidate`
run, so opting out also skips the CST walk. `strict: true` must force verification even when the gate
would skip it — otherwise `strict` silently does nothing on gated documents, which is worse than not
offering it.

> That second point is the subtle one. With `strict: true` the gate is no longer sound: skipping
> verification changes an observable outcome (throw vs no throw). Either `strict` implies "always verify",
> or `strict` documents that it only fires for documents that qualify. **Prefer the former** — a flag whose
> effect depends on an internal heuristic is a support problem.

### 3. TomlDocument rollback

`c3cafac` has the implementation. The mechanism:

```ts
const sourceBefore = this._currentTomlString;   // captured before patchCst() mutates anything
// ... both attempts fail ...
this._cst = Array.from(parseTOML(sourceBefore));
this._currentTomlString = sourceBefore;
throw new Error(...);
```

The re-parse is not optional. `patchCst()` mutates CST nodes in place, so by the time the second attempt
is known to have failed, `_cst` describes neither the old nor the new string. Restoring `_currentTomlString`
alone would leave the tree and the string disagreeing.

### 4. Tests

`9d0061e` and `c3cafac` removed nine tests that belong here. `git show` both commits for the originals:

- `validate: false` matches the default on a patch needing no repair
- `validate: false` returns the unrepaired result (asserts the exact malformed TOML, so the cost of opting
  out is written down rather than implied)
- `validate: false` suppresses the throw
- verification stays on unless `validate` is explicitly `false`
- `TomlDocument` rolls back and stays patchable after a failure

New tests needed for `strict`:

- `strict: true` throws on an unsatisfiable patch
- `strict: true` still throws for a document the perf gate would otherwise skip (the interaction in §2)
- `strict` defaults to `false`, so the default configuration never throws

### 5. Error type

`throw new Error('Patch retry failed round-trip validation')` was the previous message. Two improvements
worth making while the code is open:

- a dedicated error class (`PatchVerificationError`) carrying the offending output, so a caller can log or
  diff it instead of guessing
- the `toml-patch: ` prefix the project uses for `console.warn` but not, currently, for any thrown error
  (see `dev-error-prefix`)

---

## Out of scope

- The perf gate itself. It is already in place and correct for the default configuration.
- The single-line literal string parse bug recorded as `test.fails` in `src/__tests__/parse.test.ts`
  (`a = '"'` throws; odd numbers of double quotes fail, even numbers pass). Unrelated to verification,
  predates this work, reproduces on the published 3.0.3.

---

## Note on ordering

If [`PLAN-CST-Positions.md`](./PLAN-CST-Positions.md) succeeds, verification stops being a correctness
mechanism and becomes a debug assertion. In that world:

- `strict` and the rollback lose their purpose — there is nothing left to fail
- `validate` survives only as `TOML_PATCH_VERIFY=1`-style dev tooling, not public API
- this entire plan collapses to "delete `patch-validate.ts`"

So **do the positions work first if there is any appetite for it.** Shipping `PatchOptions` and then
removing it in the next major is worse than waiting.
