# Fuzz-hardening fixes: round-trip corruption seeds (400000–450000)

**Status: fixed.** Continuation of
[`fuzz-sweep-350000-400000-roundtrip-fixes.md`](./fuzz-sweep-350000-400000-roundtrip-fixes.md) — two
seeds surfaced by the 400000..450000 window of the deterministic `patch()` fuzz sweep
(`scripts/fuzz-run.ts`, 3 random mutations per seed). Branch `dev-fuzz-fixes2`.

---

## 1. Fuzz harness missed a scalar-into-AOT mutation (false positive)

**421089** (fix commit `7085561`, in `src/__tests__/fuzz-patch.ts`): `add-array-item` inserting a
string `"jPQACg"` into an array-of-tables nested under another AOT entry
(`""[0].azn_."I/(T"`). The mutation is unrepresentable in TOML (a scalar can't be an AOT entry), so the
fuzz harness must skip it — but its AOT guard (`collectAotKeys` + the scalar-skip check) compared the
mutation's **JS-object path** (which interleaves the numeric entry index, e.g.
`['', 0, 'azn_', 'I/(T']`) against AOT keys stored in **CST coordinates** (no index,
`['', 'azn_', 'I/(T']`), so the guard never fired and the invalid mutation was applied, re-rendering the
string as an inline table with integer keys (`0 = "j"`, `1 = "P"`, …).

Fix: project `parentPath` to its string segments (`filter(seg => typeof seg === 'string')`) before the
`.join('.')` / set lookup, so an AOT nested inside another AOT entry is matched.

No `patch.ts` change and no regression test — this is a harness-only fix (the seed round-trips once the
invalid mutation is skipped).

---

## 2. Moving a multiline string to the front of a shared-line array corrupted the tail

**421965** (fix commit `9c5fdd0`, in `src/comment-ownership.ts`): changing index 2 to `false` duplicates
the leading `false`, so `compareArrays` emits `Move [1→0]` (the multiline string) + `Remove [2]` (the
trailing `"z"`) — a correct, minimal diff. But `moveInlineElement` skipped its tail-realignment step and
the renderer dropped the multiline string's closing `"""` delimiter, merging `false` into the content.
Minimal:

```toml
q7_8 = [false, """
AAA
""", "z"]
```

with `obj.q7_8[2] = false; obj.q7_8.splice(0, 1);`.

Root cause: the tail realignment is gated on `sharedLineContainerBeforeMove`, which requires a run of
**three** adjacent items *starting* on the same line. Here only `false` and the multiline string's opening
`"""` share line 1 (a run of two), so the container was classified as per-line and the item that shared the
string's first line (`false`) was left at a stale column (line 3, column −2), overwriting the closing
delimiter.

Fix: capture a narrow `movedMultilineToFront` flag (`toIndex === 0`, node multiline, and its pre-move
previous sibling shared its start line), and OR it into the realignment gate so the tail is re-anchored for
this shape too.
