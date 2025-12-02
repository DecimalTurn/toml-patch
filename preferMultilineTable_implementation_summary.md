# Summary: preferMultilineTable Implementation Attempts

## Context: Test Case "should add nested objects to existing table sections"

The test case attempts to add a nested object structure to an existing TOML table section and expects different behavior based on the `preferMultilineTable` setting:

**Input:**
```toml
[project]
name = "Simple"
version = "1.0.0"
```

**JavaScript object to merge:**
```javascript
{
  project: {
    name: "Simple",
    version: "1.0.0",
    target: {
      type: "xlsm",
      path: "targets/xlsm"
    }
  }
}
```

**Expected behavior:**
- When `preferMultilineTable = true`: Convert the nested `target` object to a separate `[project.target]` table section
- When `preferMultilineTable = false`: Keep the nested `target` object as an inline table within the existing `[project]` section

**Expected output with `preferMultilineTable = true`:**
```toml
[project]
name = "Simple"
version = "1.0.0"

[project.target]
type = "xlsm"
path = "targets/xlsm"
```

## Implementation Approaches Tried

### 1. Patch-Time Conversion in `patch.ts`
**Attempt:** Added logic in the `applyChanges` function to detect when a `KeyValue` with an `InlineTable` value is being added to an existing `Table` parent, and convert it to a separate table section.

**Implementation:**
```typescript
else if (isKeyValue(child) && isInlineTable(child.value) && isTable(parent) && format.preferMultilineTable) {
  // Convert inline table to separate table section when adding to Table parent
  const parentTablePath = parent.key.item.value;
  const childKey = child.key.value;
  const nestedTablePath = [...parentTablePath, ...childKey];
  const nestedTable = generateTable(nestedTablePath);
  
  // Extract items from the inline table and add them to the new table
  const inlineTable = child.value as any; // InlineTable
  for (const inlineItem of inlineTable.items) {
    insert(nestedTable, nestedTable, inlineItem.item);
  }
  
  applyWrites(nestedTable);
  insert(original, original, nestedTable);
}
```

**Why it didn't work:**
- This approach was **too aggressive** and converted inline tables in scenarios where they should remain inline
- It caused regressions in other tests that expected inline tables to be preserved
- The logic was applied at the wrong granularity - it converted ALL inline tables when `preferMultilineTable = true`, rather than only converting them in the specific context of adding to existing table sections

### 2. Format-Time Conversion in `formatTopLevel` Extension
**Attempt:** Extended the existing `formatTopLevel` function (which handles conversion of top-level inline tables) to also recursively process inline tables within existing table sections.

**Implementation:**
```typescript
function formatNestedInlineTables(document: Document): void {
  const tables = document.items.filter(item => isTable(item)) as Table[];
  
  for (const table of tables) {
    const inlineTableKeyValues = table.items.filter(item => {
      return isKeyValue(item) && isInlineTable(item.value);
    }) as KeyValue[];
    
    for (const keyValue of inlineTableKeyValues) {
      remove(document, table, keyValue);
      const parentPath = table.key.item.value;
      const childKey = keyValue.key.value;
      const nestedPath = [...parentPath, ...childKey];
      const nestedTable = formatTableWithPath(keyValue, nestedPath);
      insert(document, document, nestedTable);
    }
  }
}
```

**Why it didn't work:**
- This approach ran during the **parsing phase** (`parseJS`) rather than during the **patching phase**
- It converted inline tables at the wrong time - during document generation rather than during patch application
- It caused the same aggressive conversion problem as approach #1, breaking tests that expected inline tables to be preserved
- The timing was wrong - `formatTopLevel` processes the entire `updated` document, not just the parts being added during patching

## Root Cause Analysis

### The Core Problem: Timing and Context
The fundamental issue is understanding **when** and **in what context** the `preferMultilineTable` setting should take effect:

1. **Existing behavior:** The `formatTopLevel` function converts inline tables to separate tables during parsing (`parseJS`) when creating a document from JavaScript objects
2. **Desired behavior:** The `preferMultilineTable` setting should only affect inline tables that are being **newly added** during a patch operation, not existing inline tables in the document

### Algorithm Insight from Original Author
The original implementation follows a specific algorithm:
1. **Parse/Generate Phase:** All nested objects are initially created as inline tables
2. **Format Phase:** Inline tables are selectively converted to separate table sections based on formatting rules
3. **Write Phase:** The final TOML string is generated

### Misaligned Approach
Both attempts tried to modify this algorithm in ways that were too broad:
- **Approach #1** tried to convert during patching but applied the logic too globally
- **Approach #2** tried to extend the format-time conversion but ran at the wrong phase

## The Correct Direction

The solution needs to be more **surgical and context-aware**:

1. **Detect the specific context** where a nested object is being added to an existing table section during patching
2. **Only convert inline tables** that are part of the newly added content, not existing inline tables
3. **Preserve existing formatting** in the document while selectively applying `preferMultilineTable` to new additions
4. **Understand the difference** between creating new top-level table sections vs. adding content to existing sections

The key insight is that `preferMultilineTable` should be a **patch-time decision** that affects how newly added nested objects are formatted, rather than a global document formatting rule.