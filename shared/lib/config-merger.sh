#!/usr/bin/env bash
# Merge three-tier config: global < machine < project
# Outputs merged YAML to stdout
# Usage: bash shared/lib/config-merger.sh [--debug]
set -euo pipefail

exec node "$(dirname "$(realpath "$0")")/config-merger.mjs" "$@"
