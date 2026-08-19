# Fuzz sweep 750000–1000000 — round-trip fixes

## Range

Seeds `750000` through `1000000` (inclusive), 250001 seeds, `mutationCount` = 3.
This completes the sweep to 1M.

## Failures fixed in this sweep

### Seed 863085 — deleting a dotted key empties a nested inline table and absorbs its siblings

**Symptom:** `patch()` round-trip returned:

```
.gtgtp2f-z7.xh-.sln13dd1l.tn;u}x: missing in expected
.gtgtp2f-z7.xh-.sln13dd1l.=LQd*Or: missing in expected
.gtgtp2f-z7.tn;u}x: extra in got
.gtgtp2f-z7.=LQd*Or: extra in got
```

Two sibling keys (`tn;u}x`, `=LQd*Or`) of a large inline table `gtgtp2f-z7`
got incorrectly nested under its `xh-.sln13dd1l` sub-table.

**Root cause:** A nested inline table `xh-.sln13dd1l` held a single dotted key
`"hnSEQ$+".hhz."k-<>=#i:,"` whose value was a multiline string, so the nested
table spanned several lines. Deleting the innermost segment collapsed
`"hnSEQ$+".hhz` to `{}`. In `src/patch.ts`, the **Remove** handler's
dotted-key materialisation branch (`isInlineTable(container)`, ~line 2687)
re-materialised the emptied prefix as `prefix = {}`. The removal had zeroed the
container's line offset (and flagged `hasInlineContainerNeedingTighten`) but left
`container.loc.end.line` stale — still pointing at the multiline string's old end
line. `insert()` then computed `useNewLine = true` (container still "multiline")
and placed `k1.k2 = {}` on a phantom second line, so the enclosing table's
trailing siblings landed inside the phantom span.

This is the exact mirror of seed 272851, whose fix was applied only in the
**Add** handler — the Remove path was missing the same collapse.

**Fix:** In the Remove handler, before `insert()`, collapse a tight-inline
container's `loc.end.line` to its start line when it is still multiline
(mirroring the seed 272851 Add-handler collapse).

**Files changed:**
- `src/patch.ts` — added the multiline-end collapse before `insert()` in the
  Remove-handler dotted-key materialisation branch.
- `src/__tests__/patch.fuzz.test.ts` — added `regression for fuzz seed 863085`.

## Debugging notes

Minimal repro:

```toml
root = { nn = { "k1".k2.k3 = '''
AAA
BBB''' }, sib1 = "x", sib2 = "y" }
```

with `delete obj.root.nn.k1.k2.k3`. The emptied `k1.k2` becomes `{}`, and
`sib1`/`sib2` must remain siblings of `nn` inside `root`. This is a sibling bug
of seed 272851 (same trigger, opposite mutation path: Remove vs Add).
