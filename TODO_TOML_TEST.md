# Running the toml-test suite

The `toml-test-decode.mjs` / `run-toml-test.bash` scripts added in this branch
wire up the official [toml-test](https://github.com/toml-lang/toml-test) Go
binary as a second test layer on top of the Jest suites.

**This requires Go and the `toml-test` binary.
The local Windows machine does not have Go — run this in a GitHub Codespace or
any Linux/macOS environment that has Go 1.19+ installed.**

## Setup

```bash
# Option A — build from source (requires Go 1.19+)
go install github.com/toml-lang/toml-test/v2/cmd/toml-test@latest

# Option B — download a pre-built binary
# https://github.com/toml-lang/toml-test/releases
# Extract the binary and place it somewhere on $PATH
```

## Running

```bash
pnpm run build
pnpm run toml-test
```

## What gets skipped

`run-toml-test.bash` passes `-skip` flags for the small set of tests that are
known JS ecosystem limitations:

| Skipped test | Reason |
|---|---|
| `invalid/local-date/feb-29` | JS `Date` normalises impossible dates instead of rejecting them |
| `invalid/local-datetime/feb-29` | same |
| `invalid/datetime/feb-29` | same |
| `invalid/local-date/feb-30` | same |
| `invalid/local-datetime/feb-30` | same |
| `invalid/datetime/feb-30` | same |
| `invalid/datetime/offset-overflow-hour` | same |

The encoding / UTF-8 tests are **not** skipped. The decoder reads stdin as raw
bytes and uses `TextDecoder('utf-8', { fatal: true })`, so invalid byte sequences
are rejected before parsing begins.
