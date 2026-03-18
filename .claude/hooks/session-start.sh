#!/bin/bash
set -euo pipefail

# --- Task resumption detection (runs in ALL environments) ---
# Primary: query Worker KV for active tasks (near-zero cost, 1 read per session)
# Fallback: clipboard detection for environments without Worker config
_detect_resume_task() {
  local task_goal=""
  local task_code=""

  # Primary: Worker KV query
  if [ -n "${AI_CONFIG_WORKER:-}" ] && [ -n "${AI_CONFIG_TOKEN:-}" ]; then
    local response
    response=$(curl -sf \
      -H "Authorization: Bearer ${AI_CONFIG_TOKEN}" \
      --max-time 3 \
      "${AI_CONFIG_WORKER}/v1/tasks?status=active&limit=1&updated_within=86400" 2>/dev/null) || true

    if [ -n "$response" ]; then
      # Extract first task goal and short_code using jq (avoids Node.js spawn overhead)
      if command -v jq &>/dev/null; then
        local _jq_filter='(if type=="array" then . elif .tasks then .tasks else [] end)[0] | (.goal // .name // .task_type // ""), (.short_code // "")'
        task_goal=$(echo "$response" | jq -r "$_jq_filter" 2>/dev/null | head -n1) || true
        task_code=$(echo "$response" | jq -r "$_jq_filter" 2>/dev/null | tail -n+2 | head -n1) || true
      elif command -v node &>/dev/null; then
        _task_info=$(echo "$response" | node -e "
          let d='';
          process.stdin.resume();
          process.stdin.on('data',c=>d+=c);
          process.stdin.on('end',()=>{
            try {
              const body = JSON.parse(d);
              const tasks = body.tasks || body;
              const t = Array.isArray(tasks) ? tasks[0] : null;
              if (t) {
                console.log(t.goal || t.name || t.task_type || '');
                console.log(t.short_code || '');
              }
            } catch(e) {}
          });
        " 2>/dev/null) || true
        task_goal=$(printf '%s\n' "$_task_info" | head -n1)
        task_code=$(printf '%s\n' "$_task_info" | tail -n+2 | head -n1)
      fi
    fi
  fi

  # Fallback: clipboard detection (macOS / Linux / Windows)
  if [ -z "$task_goal" ]; then
    local clipboard=""
    if command -v pbpaste &>/dev/null; then
      clipboard=$(pbpaste 2>/dev/null) || true
    elif command -v xclip &>/dev/null; then
      clipboard=$(xclip -selection clipboard -o 2>/dev/null) || true
    elif command -v xsel &>/dev/null; then
      clipboard=$(xsel --clipboard --output 2>/dev/null) || true
    elif command -v powershell.exe &>/dev/null; then
      clipboard=$(powershell.exe -command "Get-Clipboard" 2>/dev/null) || true
    fi
    # Detect "resume <name>" pattern in clipboard
    if echo "$clipboard" | grep -qiE '^resume [a-z]'; then
      task_goal=$(echo "$clipboard" | sed -E 's/^resume //i')
    fi
  fi

  # Emit RESUME_AVAILABLE if a task was found
  if [ -n "$task_goal" ]; then
    if [ -n "$task_code" ]; then
      echo "RESUME_AVAILABLE: ${task_goal} (task: ${task_code})"
    else
      echo "RESUME_AVAILABLE: ${task_goal}"
    fi
  fi
}

_detect_resume_task

# --- Capability probe (unconditional; re-probes on device change) ---
_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
CURRENT_HOSTNAME="$(hostname 2>/dev/null || echo 'unknown')"
PROBE_CACHE="$HOME/.ai-config-os/probe-report.json"
CACHED_HOSTNAME="$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${PROBE_CACHE}','utf8')).hostname||'')}catch(e){}" 2>/dev/null || echo '')"

if [ "$CURRENT_HOSTNAME" != "$CACHED_HOSTNAME" ] || [ ! -f "$PROBE_CACHE" ]; then
  echo "Probing runtime capabilities..."
  if bash "${_PROJECT_DIR}/ops/capability-probe.sh" --quiet 2>/dev/null; then
    echo "Capability probe complete."
  else
    echo "WARNING: Capability probe produced warnings. Continuing anyway." >&2
  fi
else
  echo "[probe] Same device ($CURRENT_HOSTNAME) — using cached probe"
fi

# --- Skill availability summary + command generation (parallel, non-blocking) ---
if command -v node &>/dev/null; then
  node "${_PROJECT_DIR}/adapters/claude/filter-skills-cli.mjs" --summary 2>/dev/null &
  node "${_PROJECT_DIR}/adapters/claude/generate-commands.mjs" \
    --project-dir "${_PROJECT_DIR}" 2>/dev/null &
  wait
fi
echo ""

# Only run validation/sync in remote Claude Code environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --- FAST PATH: Bootstrap skills from Worker (skips npm/build/validate) ---
_BOOTSTRAP_OK=false
if [ -n "${AI_CONFIG_WORKER:-}" ] && [ -n "${AI_CONFIG_TOKEN:-}" ]; then
  echo "Attempting fast-path: bootstrap skills from Worker..."
  if bash ./adapters/claude/materialise.sh bootstrap 2>/dev/null; then
    _BOOTSTRAP_OK=true
    echo "Skills bootstrapped from Worker in <10s."
  fi
fi

# --- SLOW PATH: Local build (fallback when bootstrap unavailable) ---
if [ "$_BOOTSTRAP_OK" != "true" ]; then
  echo "[fallback] Worker unavailable; using local skills cache" >&2

  # --- Install dependencies (batched into a single package-manager invocation) ---
  _missing_deps=()
  for dep in jq yq; do
    command -v "$dep" &>/dev/null || _missing_deps+=("$dep")
  done
  if [[ ${#_missing_deps[@]} -gt 0 ]]; then
    echo "Installing ${_missing_deps[*]}..."
    if command -v apt-get &>/dev/null; then
      sudo apt-get update -qq && sudo apt-get install -y -qq "${_missing_deps[@]}" 2>/dev/null || \
        echo "WARNING: Could not install ${_missing_deps[*]} via apt-get" >&2
    elif command -v apk &>/dev/null; then
      apk add --no-cache "${_missing_deps[@]}" 2>/dev/null || \
        echo "WARNING: Could not install ${_missing_deps[*]} via apk" >&2
    elif command -v brew &>/dev/null; then
      brew install "${_missing_deps[@]}" 2>/dev/null || \
        echo "WARNING: Could not install ${_missing_deps[*]} via brew" >&2
    else
      echo "WARNING: Cannot install ${_missing_deps[*]} — no supported package manager found" >&2
    fi
  fi

  # --- Install Node dependencies (needed by validation scripts) ---
  if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install --silent 2>/dev/null || echo "WARNING: npm install failed" >&2
  fi

  # --- Build skill distribution (skipped when source is unchanged) ---
  # Cache key: git HEAD commit hash stored in .ai-config-os/build.hash
  _BUILD_HASH_FILE=".ai-config-os/build.hash"
  _CURRENT_GIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "")
  _CACHED_BUILD_HASH=$(cat "$_BUILD_HASH_FILE" 2>/dev/null || echo "")
  if [ ! -d "dist/clients/claude-code" ] || [ -z "$_CACHED_BUILD_HASH" ] || [ "$_CURRENT_GIT_HASH" != "$_CACHED_BUILD_HASH" ]; then
    echo "Building skill distribution..."
    if node scripts/build/compile.mjs 2>/dev/null; then
      mkdir -p "$(dirname "$_BUILD_HASH_FILE")"
      echo "$_CURRENT_GIT_HASH" > "$_BUILD_HASH_FILE"
    else
      echo "WARNING: skill build failed, materialise may be incomplete" >&2
    fi
  fi

  # --- Validate skill structure (non-fatal in remote) ---
  echo "Running skill validation suite..."
  if ./ops/validate-all.sh 2>/dev/null; then
    echo "Validation complete."
  else
    echo "WARNING: Validation produced warnings. Continuing anyway." >&2
  fi

  # --- Materialise from local dist/ ---
  if bash ./adapters/claude/materialise.sh extract 2>/dev/null; then
    if bash ./adapters/claude/materialise.sh install 2>/dev/null; then
      echo "Skills materialised from local dist/."
    else
      echo "WARNING: Skill installation failed. Skill tool may not work." >&2
    fi
  else
    echo "WARNING: Skill materialise failed. Skills may be unavailable." >&2
  fi
fi

echo ""

# --- Runtime sync (always runs, independent of skills) ---
echo "Running runtime sync..."
if bash ./runtime/sync.sh --dry-run 2>/dev/null; then
  echo "Runtime config valid."
else
  echo "WARNING: Runtime sync dry-run produced warnings. Continuing anyway." >&2
fi
echo ""

# --- Manifest status ---
bash ./runtime/manifest.sh status 2>/dev/null || true
echo ""
