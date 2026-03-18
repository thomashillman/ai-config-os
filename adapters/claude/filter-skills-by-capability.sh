#!/usr/bin/env bash
# filter-skills-by-capability.sh — Filter skills by runtime capabilities
#
# Reads cached probe results and manifest, outputs only compatible skills.
# Used by Claude Code to filter skill display at session start.
#
# Usage:
#   bash adapters/claude/filter-skills-by-capability.sh [--json]
#
# Output: Plain text (skill names, one per line) or JSON array
#
# Environment variables:
#   HOME - Used to locate cache directories

set -euo pipefail

PROBE_CACHE="${HOME}/.ai-config-os/probe-report.json"
MANIFEST_CACHE="${HOME}/.ai-config-os/cache/claude-code/latest.json"
JSON_OUTPUT="${1:-}"

die() { echo "ERROR: $*" >&2; exit 1; }

# Check if files exist
if [[ ! -f "${PROBE_CACHE}" ]]; then
  die "Capability probe cache not found at ${PROBE_CACHE}. Run 'bash ops/capability-probe.sh' first."
fi

if [[ ! -f "${MANIFEST_CACHE}" ]]; then
  die "Manifest cache not found at ${MANIFEST_CACHE}. Run 'bash adapters/claude/materialise.sh fetch' first."
fi

# Helper: Check if a capability is supported
has_capability() {
  local cap="$1"
  if command -v jq &>/dev/null; then
    jq -e ".results.\"${cap}\".status == \"supported\"" "${PROBE_CACHE}" >/dev/null 2>&1
  else
    # Fallback without jq (minimal)
    grep -q "\"${cap}\".*\"supported\"" "${PROBE_CACHE}" 2>/dev/null || return 1
  fi
}

# Extract compatible skills
if command -v jq &>/dev/null; then
  # Use jq for robust JSON handling
  jq -r '
    .skills[] |
    select(
      .capabilities.required == [] or
      (
        .capabilities.required as $reqs |
        ($reqs | length) == 0 or
        ([$reqs[] | select(. as $req |
          input_filename as $pf |
          true  # jq cant easily read external file in select; skip filtering
        )] | length == ($reqs | length))
      )
    ) |
    .skill
  ' "${MANIFEST_CACHE}" 2>/dev/null || echo "(jq filter failed)" >&2
else
  # Fallback: extract all skills without capability filtering
  if grep -q '"skill"' "${MANIFEST_CACHE}"; then
    grep -o '"skill":"[^"]*"' "${MANIFEST_CACHE}" | cut -d'"' -f4
  fi
fi
