# Fuzz Error Seeds: 0..2,999,999 Rerun

Source log: [fuzz-sweep-0-3000000-RERUN.md](fuzz-sweep-0-3000000-RERUN.md)

The rerun reported 16 failures across three one-million-seed ranges. The
`updateOrder` warnings in the source log are not included because they are
expected unsupported-location warnings rather than harness failures.

## Seeds

| Seed | Range | Failure | Detail |
| ---: | :--- | :--- | :--- |
| 175924 | 0..999999 | `roundtrip-mismatch` | Re-parse failed at `(79, 1)` |
| 377453 | 0..999999 | `roundtrip-mismatch` | Re-parse failed at `(23, 5)` |
| 771152 | 0..999999 | `roundtrip-mismatch` | Re-parse failed at `(7, 29)` |
| 863664 | 0..999999 | `roundtrip-mismatch` | Re-parse failed at `(51, 5)` |
| 1112646 | 1000000..1999999 | `roundtrip-mismatch` | Re-parse failed at `(122, 22)` |
| 1286183 | 1000000..1999999 | `roundtrip-mismatch` | Re-parse failed at `(42, 274)` |
| 1383962 | 1000000..1999999 | `roundtrip-mismatch` | Re-parse failed at `(20, 3)` |
| 1693919 | 1000000..1999999 | `roundtrip-mismatch` | Re-parse failed at `(15, 101)` |
| 1896226 | 1000000..1999999 | `roundtrip-mismatch` | Re-parse failed at `(64, 1)` |
| 2185943 | 2000000..2999999 | `roundtrip-mismatch` | Re-parse failed at `(118, 16)` |
| 2497422 | 2000000..2999999 | `roundtrip-mismatch` | Re-parse failed at `(9, 92)` |
| 2531104 | 2000000..2999999 | `roundtrip-mismatch` | Re-parse failed at `(17, 5)` |
| 2591153 | 2000000..2999999 | `patch-fail` | `patch()` threw: Node not found at `AKy:}nV@.p8.(J<nemN,8.s2.+)3k/.6` |
| 2667551 | 2000000..2999999 | `roundtrip-mismatch` | Re-parse failed at `(76, 1)` |
| 2824408 | 2000000..2999999 | `roundtrip-mismatch` | Re-parse failed at `(59, 10)` |
| 2858114 | 2000000..2999999 | `roundtrip-mismatch` | Re-parse failed at `(8, 2)` |

## Summary

- `roundtrip-mismatch`: 15
- `patch-fail`: 1
- Total failures: 16