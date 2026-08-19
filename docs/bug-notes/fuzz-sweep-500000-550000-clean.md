# Fuzz sweep 500000–550000 — clean

## Range

Seeds `500000` through `550000` (inclusive), 50001 seeds, `mutationCount` = 3.

## Result

**0 failures.** No round-trip corruptions found in this range; no fixes required.

The `updateOrder could not honor the requested position` messages observed during
the run are expected — they are pre-existing, benign warnings for reordering
requests against unsupported locations (dotted-key implicit tables / interior of
inline tables or array-of-tables entries), not corruption.
