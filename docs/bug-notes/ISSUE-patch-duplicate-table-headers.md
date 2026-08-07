## Patch produces duplicate table headers when modifying values inside dotted-key tables

### Summary

When `patch()` modifies a key-value pair inside a table that was originally defined with a dotted key in the TOML header (e.g. `[parent.child]`), it sometimes emits a second `[parent]` header, causing "Table already defined" parse errors in the output.

### Reproduction

```typescript
import { parse, patch } from '@decimalturn/toml-patch';

const toml = `
[ef8fai0n]
p8ou7aufb.at4 = "original value"
`;

const obj = parse(toml);
obj.ef8fai0n.q3ytjt3s = "new value"; // add a new key under ef8fai0n

const result = patch(toml, obj);
// Result contains TWO [ef8fai0n] headers — invalid TOML
```

### Observed output

```toml
[ef8fai0n]
q3ytjt3s = "new value"      # ← first header (new key)

[ef8fai0n]                   # ← DUPLICATE header
p8ou7aufb.at4 = "original value"
```

### Variant: "Cannot extend inline table"

When a table is defined with a dotted key like `[a.b]` and a value inside `b` is modified, the patch creates `a = { b = { ... } }` as an inline table next to the original `[a.b]`, then fails because `[a.b]` tries to extend the inline table.

```toml
# Original:
["<~9".dd]
13i.x1wdfu5_.o67ar6 = 11449

# Patched (INVALID):
["<~9"]
dd = { 13i = { x1wdfu5_ = -4277 } }   # ← inline table

["<~9".dd]                              # ← tries to extend inline table → ERROR
zbr5.p-6c.aex4j = [...]
```

### Root Cause

`patch()` uses a diff-based approach: it diffs the original CST against the updated JS object. When a modification occurs inside a table that maps to a dotted-key header, the diff may generate changes at the wrong structural level, causing the writer to emit duplicate or conflicting table headers.

### Affected operations

- Adding a new key to a table defined with `[parent.child]` syntax
- Changing a value inside such a table
- Particularly common when the modified key is at the same level as existing dotted keys

### Severity

High — produces invalid TOML that cannot be re-parsed, breaking the fundamental `patch()` contract.

### Test

The exact reproduction from this issue (adding a flat key) was fixed on `latest`. The variant (modifying a nested value, causing inline table conflict) is covered by `test.fails('BUG: modifying nested dotted-key value produces inline table conflict')` in `src/__tests__/patch.test.ts` (line ~7065).
