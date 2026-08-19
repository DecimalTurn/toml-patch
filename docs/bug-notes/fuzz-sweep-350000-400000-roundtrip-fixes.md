# Fuzz-hardening fixes: round-trip corruption seeds (350000–400000)

**Status: fixed.** Continuation of
[`fuzz-sweep-250000-300000-roundtrip-fixes.md`](./fuzz-sweep-250000-300000-roundtrip-fixes.md) — two
seeds surfaced by the 350000..400000 window of the deterministic `patch()` fuzz sweep
(`scripts/fuzz-run.ts`, 3 random mutations per seed). Both were the same crash, distilled to a single
minimal failing case, pinned with a `test.fails` regression in `src/__tests__/patch.fuzz.test.ts`, then
fixed. Branch `dev-fuzz-fixes2`.

(Note: the 300000..350000 window came back clean — 0 failures — and produced no notes of its own.)

---

## 1. Deleting the first table + collapsing a later table to a scalar crashed the writer

**358055 / 362151** (fix commit `91af950`): deleting the FIRST table and, in the same patch, changing a
**later** table into a scalar. Minimal:

```toml
[v8]
x = 1

[other]
x = 1

[s]
y = 1
```

with `obj.s = 282` and `delete obj.v8`.

The crash was `patch() threw: Cannot read properties of undefined (reading 'length')` at
`to-toml.ts`'s `writeSingle` — a KeyValue emitted at a **negative** line (`loc.start.line === -2`).

Root cause: `obj.s = 282` turns the `[s]` section into a root-level `s = 282` key-value, which the
`isTable(existing)` branch re-renders and then runs through `hoistRootKeyValueAboveTables` to move the
fresh KV above the first remaining section header. That helper does `remove(doc, doc, kv)` followed by
`insert(doc, doc, kv, firstTableIndex)`. The `remove` registers a pending offset on the document, and
— critically — if a **preceding** change in the same patch had already removed the first table
(`delete obj.v8`), the document also still carries *that* unresolved enter offset. `insert` then
positions the re-inserted KV against the `firstTableIndex` sibling's `loc`, which those offsets have
not yet shifted, so the KV lands on a phantom (negative) line.

Fix: call `applyWrites(doc)` between the `remove` and the `insert` in `hoistRootKeyValueAboveTables`,
matching the discipline already applied at every other "insert after a removal" site (seeds 92, 11557,
1172, 1028, 11605, 7379).
