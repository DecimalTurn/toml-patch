#!/usr/bin/env bash
# Inspired by https://github.com/squirrelchat/smol-toml/blob/mistress/run-toml-test.bash
#
# Runs the toml-test suite against toml-patch.
# Requires the toml-test binary: https://github.com/toml-lang/toml-test
#
# Install (Go required):
#   go install github.com/toml-lang/toml-test/v2/cmd/toml-test@latest
#
# Or download a pre-built binary from:
#   https://github.com/toml-lang/toml-test/releases
#
# Usage:
#   ./run-toml-test.bash
#   TOML_VERSION=1.0 ./run-toml-test.bash   (default: 1.1)

TOML_VERSION="${TOML_VERSION:-1.1}"

toml-test test -toml="${TOML_VERSION}" \
  -decoder="node ./toml-test-decode.mjs" \
  -encoder="node ./toml-test-encode.mjs"
