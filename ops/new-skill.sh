#!/usr/bin/env bash
# Thin wrapper around the portable Node.js scaffold command.
# See scripts/build/new-skill.mjs for the authoritative implementation.
set -euo pipefail
exec node "$(dirname "$0")/../scripts/build/new-skill.mjs" "$@"
