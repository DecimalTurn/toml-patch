## Patch produces "Cannot extend inline table" when modifying nested dotted-key values

### Summary

When `patch()` modifies a value at a deeply nested dotted-key path under an existing table, it emits an inline table representation of the modified path alongside the original table header. The inline table and the table header conflict, producing: "Cannot extend inline table at `<path>`".

### Reproduction

```typescript
import { parse, patch } from '@decimalturn/toml-patch';

const toml = `
["<~9".dd]
13i.x1wdfu5_.o67ar6 = 11449
zbr5.p-6c.aex4j = [1, 2, 3]
`;

const obj = parse(toml);
obj['<~9'].dd['13i'].x1wdfu5_ = -4277; // change the value

const result = patch(toml, obj);
// Produces invalid TOML with conflicting inline table + table header
```

### Observed output

```toml
["<~9"]
dd = {13i = {x1wdfu5_ = -4277}}   # ← inline table for modified path

["<~9".dd]                          # ← original table header
zbr5.p-6c.aex4j = [1, 2, 3]       # ← ERROR: cannot extend inline table '<~9.dd'
```

### Root Cause

The `patch()` diff engine decomposes the modification into two parts:
1. The modified key (`13i.x1wdfu5_`) is emitted as an inline table under `["<~9"]`
2. The unmodified sibling keys remain under the original `["<~9".dd]` header

These two representations collide because `["<~9".dd]` tries to extend the inline table `dd = {...}` that was already emitted under `["<~9"]`.

### Relationship to other issues

- **ISSUE-patch-duplicate-table-headers.md**: Same root cause (dotted-key decomposition), different manifestation (duplicate header vs inline table conflict)
- Both stem from the diff engine emitting changes at the wrong structural level when dotted keys are involved

### Severity

High — produces invalid TOML output, same class of bug as duplicate table headers.
