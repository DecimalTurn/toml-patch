## Patch throws "Node not found" when modifying values inside table arrays or deeply nested paths

### Summary

`patch()` throws `"Node not found at <path>"` when modifying values inside table array elements (`[[...]]`) or at deeply nested paths with special characters in keys.

### Observed error patterns

| Path pattern | Context |
|---|---|
| `table.key.0.nested.value` | Modifying a value inside a table array element (index `0`) |
| `parent.0.child` | Same — array index in path |
| `key.with.special{chars` | Keys containing `{}`, `[]`, etc. |

### Example errors from fuzzer

```
Node not found at 3M^8Q1-]kg.W)XM|.0.a3m7.cevcs
Node not found at vjahzseo.usz7ss.owxnuqpq
Node not found at u.w
Node not found at ly.0.x.r$W#(Fwj.txoo
Node not found in parent for removal
```

### Reproduction (simplified)

```typescript
import { parse, patch } from '@decimalturn/toml-patch';

const toml = `
[[products]]
name = "Hammer"
sku = 123

[[products]]
name = "Nail"
sku = 456
`;

const obj = parse(toml);
obj.products[0].sku = 999; // change a value inside first table array element

// This may throw "Node not found at products.0.sku"
const result = patch(toml, obj);
```

### Root Cause

The CST stores table arrays as sequential `TableArray` nodes, each containing `KeyValue` items. When `patch()` needs to locate a specific element within a table array (e.g., index 0), the CST path resolution may fail if:

1. The path includes array indices (`.0`, `.1`) — the CST doesn't store arrays as indexed collections
2. Keys contain characters that conflict with path parsing (`{`, `}`, `[`, `]`)
3. The path resolution in `findByPath()` doesn't correctly traverse table array boundaries

### Severity

High — prevents valid modifications to table array contents, a core use case for `patch()`.
