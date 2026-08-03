## Patch throws "Incompatible child type InlineItem" on certain mutations

### Summary

`patch()` throws `"Incompatible child type 'InlineItem'"` when applying certain mutations, indicating that the writer encountered an `InlineItem` node where it expected a different node type.

### Reproduction (from fuzzer seed 403)

```typescript
import { parse, patch } from '@decimalturn/toml-patch';

const toml = `
[d4v9qdab6p.")t--7".poln3sbu]
xjcn = -inf
qknixakrm.j = false
"".swr.l1- = "R"
hc."%1mya" = "CT]AJj]$HH"
`;

const obj = parse(toml);
// Modify a value inside the table
obj['d4v9qdab6p'][')t--7']['poln3sbu']['']['swr'] = 'changed';

const result = patch(toml, obj);
// May throw: Incompatible child type "InlineItem"
```

### Observed behavior

The error occurs when the writer's `insert()` or `replace()` function encounters an `InlineItem` in a context where it expects a `KeyValue`, `Table`, `TableArray`, or `Comment`.

This typically happens when:
- A dotted-key table header like `[a.b.c]` is internally represented as nested inline tables
- The patch tries to modify a child of that nested structure
- The diff generates operations that target an `InlineItem` boundary instead of the correct structural level

### Root Cause

The CST transformation pipeline in the writer assumes certain node type invariants. When a diff operation targets a path that crosses `InlineItem` boundaries (which are wrappers around inline table/array elements), the writer's type assertions fail.

### Severity

Medium — affects specific structural patterns (dotted-key tables with nested modifications) but prevents valid patch operations.
