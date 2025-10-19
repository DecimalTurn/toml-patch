# Stringify Benchmark Results

**Date:** October 19, 2025  
**Branch:** perf

## Performance Overview

| Implementation | Average ops/sec | Relative Performance |
|---|---|---|
| @iarna/toml | 14,348 | **1.0x (baseline)** ⭐ |
| toml-patch (published v0.3.7) | 2,503 | 0.17x (5.7x slower) |
| toml-patch (current/dev) | 2,330 | 0.16x (6.2x slower) |

## Key Findings

### ⚠️ Performance Comparison: Current vs Published

The current development version appears slightly slower than the published version:
- Published (v0.3.7): 2,503 ops/sec
- Current (dev): 2,330 ops/sec
- **Difference: -173 ops/sec (-6.9%)**

**Note:** Given the high variability in individual benchmarks (some showing ±11-15% margin of error), this difference may not be statistically significant. The two versions could be performing similarly within the margin of error. Multiple benchmark runs would be needed to confirm whether this is a true regression or just normal variance.

### ❌ Errors in toml-patch

Both toml-patch versions fail on 4 test files with the error: `"Line 0 is uninitialized when writing..."`

**Failing tests:**
1. `0C-scaling-table-inline-nested-1000`
2. `0C-scaling-table-inline-1000`
3. `0B-types-array`
4. `0A-spec-02-example-hard-unicode`

### Performance Gap Analysis

Comparing toml-patch (current) vs @iarna/toml:

| Test Category | toml-patch (current) | @iarna/toml | Slowdown Factor |
|---|---|---|---|
| Small documents | 25,203 ops/sec | 236,568 ops/sec | **9.4x** |
| Tables | 56.61 ops/sec | 1,709 ops/sec | **30.2x** |
| Inline arrays (1000) | 182 ops/sec | 1,726 ops/sec | **9.5x** |
| Large strings (40KB) | 5,312 ops/sec | 8,505 ops/sec | **1.6x** |
| Nested inline arrays (1000) | 4.43 ops/sec | 1,629 ops/sec | **368x** |

## Detailed Results

### toml-patch (current/dev)

```
General Stringify Benchmark:
0C-scaling-table-inline-nested-1000: Error - Line 0 is uninitialized when writing "[" at 0:0 to 0:1
0C-scaling-table-inline-1000: Error - Line 0 is uninitialized when writing "[" at 0:0 to 0:1
0B-types-array: Error - Line 0 is uninitialized when writing "[[" at 0:0 to 0:2
0A-spec-02-example-hard-unicode: Error - Line 0 is uninitialized when writing "[" at 0:0 to 0:1
0C-scaling-string-40kb x 4,911 ops/sec ±11.25% (76 runs sampled)
0C-scaling-scalar-string-multiline-40kb x 5,285 ops/sec ±3.99% (83 runs sampled)
0C-scaling-scalar-literal-multiline-40kb x 5,304 ops/sec ±2.71% (88 runs sampled)
0C-scaling-literal-40kb x 5,312 ops/sec ±3.72% (84 runs sampled)
0C-scaling-array-inline-nested-1000 x 4.43 ops/sec ±3.86% (15 runs sampled)
0C-scaling-array-inline-1000 x 182 ops/sec ±4.16% (77 runs sampled)
0B-types-table x 56.61 ops/sec ±4.63% (59 runs sampled)
0B-types-table-inline-empty x 58.05 ops/sec ±3.90% (60 runs sampled)
0B-types-scalar-string-multiline-1079-chars x 354 ops/sec ±4.14% (78 runs sampled)
0B-types-scalar-string-92-char x 124 ops/sec ±11.58% (63 runs sampled)
0B-types-scalar-string-7-char x 114 ops/sec ±14.69% (61 runs sampled)
0B-types-scalar-literal-multiline-1079-chars x 283 ops/sec ±11.39% (69 runs sampled)
0B-types-scalar-literal-92-char x 117 ops/sec ±8.08% (64 runs sampled)
0B-types-scalar-literal-7-char x 125 ops/sec ±7.72% (59 runs sampled)
0B-types-scalar-ints x 133 ops/sec ±10.13% (64 runs sampled)
0B-types-scalar-floats x 132 ops/sec ±14.96% (61 runs sampled)
0B-types-scalar-datetimes x 132 ops/sec ±7.44% (67 runs sampled)
0B-types-scalar-bools x 158 ops/sec ±6.65% (73 runs sampled)
0B-types-array-inline-empty x 136 ops/sec ±4.98% (78 runs sampled)
0A-spec-01-example-v0.4.0 x 805 ops/sec ±11.80% (75 runs sampled)
01-small-doc-mixed-type-inline-array x 25,203 ops/sec ±6.68% (82 runs sampled)

Average: 2,330 ops/sec
Fastest: 01-small-doc-mixed-type-inline-array (25,203 ops/sec)
Slowest: 0C-scaling-array-inline-nested-1000 (4.43 ops/sec)
```

### toml-patch (published v0.3.7)

```
General Stringify Benchmark:
0C-scaling-table-inline-nested-1000: Error - Cannot read properties of undefined (reading 'substr')
0C-scaling-table-inline-1000: Error - Cannot read properties of undefined (reading 'substr')
0B-types-array: Error - Cannot read properties of undefined (reading 'substr')
0A-spec-02-example-hard-unicode: Error - Cannot read properties of undefined (reading 'substr')
0C-scaling-string-40kb x 5,588 ops/sec ±2.73% (89 runs sampled)
0C-scaling-scalar-string-multiline-40kb x 5,649 ops/sec ±3.37% (82 runs sampled)
0C-scaling-scalar-literal-multiline-40kb x 5,389 ops/sec ±2.80% (82 runs sampled)
0C-scaling-literal-40kb x 5,386 ops/sec ±3.64% (86 runs sampled)
0C-scaling-array-inline-nested-1000 x 5.50 ops/sec ±5.98% (18 runs sampled)
0C-scaling-array-inline-1000 x 199 ops/sec ±3.80% (77 runs sampled)
0B-types-table x 78.53 ops/sec ±5.18% (67 runs sampled)
0B-types-table-inline-empty x 80.45 ops/sec ±3.34% (69 runs sampled)
0B-types-scalar-string-multiline-1079-chars x 379 ops/sec ±4.31% (83 runs sampled)
0B-types-scalar-string-92-char x 152 ops/sec ±5.41% (77 runs sampled)
0B-types-scalar-string-7-char x 162 ops/sec ±4.35% (74 runs sampled)
0B-types-scalar-literal-multiline-1079-chars x 384 ops/sec ±4.28% (82 runs sampled)
0B-types-scalar-literal-92-char x 155 ops/sec ±4.40% (79 runs sampled)
0B-types-scalar-literal-7-char x 155 ops/sec ±5.11% (79 runs sampled)
0B-types-scalar-ints x 167 ops/sec ±4.24% (77 runs sampled)
0B-types-scalar-floats x 162 ops/sec ±4.70% (75 runs sampled)
0B-types-scalar-datetimes x 139 ops/sec ±5.25% (78 runs sampled)
0B-types-scalar-bools x 166 ops/sec ±3.98% (77 runs sampled)
0B-types-array-inline-empty x 138 ops/sec ±5.28% (78 runs sampled)
0A-spec-01-example-v0.4.0 x 963 ops/sec ±5.18% (83 runs sampled)
01-small-doc-mixed-type-inline-array x 27,069 ops/sec ±5.58% (81 runs sampled)

Average: 2,503 ops/sec
Fastest: 01-small-doc-mixed-type-inline-array (27,069 ops/sec)
Slowest: 0C-scaling-array-inline-nested-1000 (5.50 ops/sec)
```

### @iarna/toml

```
General Stringify Benchmark:
0C-scaling-table-inline-nested-1000 x 1,060 ops/sec ±3.85% (89 runs sampled)
0C-scaling-table-inline-1000 x 954 ops/sec ±4.71% (86 runs sampled)
0C-scaling-string-40kb x 8,388 ops/sec ±4.44% (91 runs sampled)
0C-scaling-scalar-string-multiline-40kb x 6,038 ops/sec ±4.19% (89 runs sampled)
0C-scaling-scalar-literal-multiline-40kb x 5,986 ops/sec ±4.74% (89 runs sampled)
0C-scaling-literal-40kb x 8,505 ops/sec ±3.46% (92 runs sampled)
0C-scaling-array-inline-nested-1000 x 1,629 ops/sec ±18.40% (88 runs sampled)
0C-scaling-array-inline-1000 x 1,726 ops/sec ±3.58% (91 runs sampled)
0B-types-table x 1,709 ops/sec ±5.26% (90 runs sampled)
0B-types-table-inline-empty x 1,731 ops/sec ±4.52% (89 runs sampled)
0B-types-scalar-string-multiline-1079-chars x 329 ops/sec ±2.95% (88 runs sampled)
0B-types-scalar-string-92-char x 831 ops/sec ±5.01% (88 runs sampled)
0B-types-scalar-string-7-char x 1,107 ops/sec ±3.16% (91 runs sampled)
0B-types-scalar-literal-multiline-1079-chars x 319 ops/sec ±4.24% (85 runs sampled)
0B-types-scalar-literal-92-char x 805 ops/sec ±3.65% (91 runs sampled)
0B-types-scalar-literal-7-char x 1,071 ops/sec ±4.40% (88 runs sampled)
0B-types-scalar-ints x 2,514 ops/sec ±4.85% (87 runs sampled)
0B-types-scalar-floats x 1,513 ops/sec ±4.00% (88 runs sampled)
0B-types-scalar-datetimes x 772 ops/sec ±4.25% (88 runs sampled)
0B-types-scalar-bools x 2,973 ops/sec ±3.77% (92 runs sampled)
0B-types-array x 4,817 ops/sec ±4.67% (81 runs sampled)
0B-types-array-inline-empty x 1,856 ops/sec ±3.41% (90 runs sampled)
0A-spec-02-example-hard-unicode x 56,749 ops/sec ±4.15% (87 runs sampled)
0A-spec-01-example-v0.4.0 x 8,757 ops/sec ±5.11% (87 runs sampled)
01-small-doc-mixed-type-inline-array x 236,568 ops/sec ±3.75% (89 runs sampled)

Average: 14,348 ops/sec
Fastest: 01-small-doc-mixed-type-inline-array (236,568 ops/sec)
Slowest: 0B-types-scalar-literal-multiline-1079-chars (319 ops/sec)
```

## Recommendations

1. **Critical**: Fix the "Line 0 is uninitialized" errors affecting 4 test cases
2. **Performance**: Investigate and resolve the 7% performance regression in the current dev version
3. **Optimization targets** (biggest gaps vs @iarna/toml):
   - Nested inline array handling (368x slower)
   - Table operations (30x slower)
   - Small document handling (9.4x slower)
   - Standard inline arrays (9.5x slower)

## Strengths

- Large string content handling is relatively efficient (only 1.6x slower than @iarna/toml)
- Performance is consistent across different string types (literal, multiline)
