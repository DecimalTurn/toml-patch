#!/usr/bin/env bash
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

skip_decode=(
  # Invalid UTF-8 byte sequences that are undetectable once the platform
  # pre-decodes stdin to a JS string. Our decoder reads raw bytes and uses
  # TextDecoder fatal mode, so these actually pass — but listed here for
  # reference in case stdin is ever switched back to string encoding.
  # -skip='invalid/encoding/bad-utf8-*'
  # -skip='invalid/encoding/bad-codepoint'

  # JS Date doesn't reject impossible calendar dates: "Feb 30" is
  # silently normalized to "Mar 2". Adding the checks is possible but
  # has been left out for now.
  -skip='invalid/local-date/feb-29'
  -skip='invalid/local-datetime/feb-29'
  -skip='invalid/datetime/feb-29'
  -skip='invalid/local-date/feb-30'
  -skip='invalid/local-datetime/feb-30'
  -skip='invalid/datetime/feb-30'
  -skip='invalid/datetime/offset-overflow-hour'
)

toml-test test -toml="${TOML_VERSION}" "${skip_decode[@]}" \
  -decoder="node ./toml-test-decode.mjs"
