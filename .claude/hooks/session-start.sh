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

    if [ -n "$response" ] && [ "$response" != "[]" ] && [ "$response" != '{"tasks":[]}' ]; then
      # Extract first task goal and short_code using node (available in Claude Code envs)
      if command -v node &>/dev/null; then
        task_goal=$(echo "$response" | node -e "
          let d='';
          process.stdin.resume();
          process.stdin.on('data',c=>d+=c);
          process.stdin.on('end',()=>{
            try {
              const body = JSON.parse(d);
              const tasks = body.tasks || body;
              const t = Array.isArray(tasks) ? tasks[0] : null;
              if (t) process.stdout.write(t.goal || t.name || t.task_type || '');
            } catch(e) {}
          });
        " 2>/dev/null) || true
        task_code=$(echo "$response" | node -e "
          let d='';
          process.stdin.resume();
          process.stdin.on('data',c=>d+=c);
          process.stdin.on('end',()=>{
            try {
              const body = JSON.parse(d);
              const tasks = body.tasks || body;
              const t = Array.isArray(tasks) ? tasks[0] : null;
              if (t) process.stdout.write(t.short_code || '');
            } catch(e) {}
          });
        " 2>/dev/null) || true
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

# Only run validation/sync in remote Claude Code environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --- Install dependencies ---
for dep in jq yq; do
  if ! command -v $dep &>/dev/null; then
    echo "Installing $dep..."
    if command -v apt-get &>/dev/null; then
      sudo apt-get update -qq && sudo apt-get install -y -qq $dep 2>/dev/null || \
        echo "WARNING: Could not install $dep via apt-get" >&2
    elif command -v apk &>/dev/null; then
      apk add --no-cache $dep 2>/dev/null || echo "WARNING: Could not install $dep via apk" >&2
    elif command -v brew &>/dev/null; then
      brew install $dep 2>/dev/null || echo "WARNING: Could not install $dep via brew" >&2
    else
      echo "WARNING: Cannot install $dep — no supported package manager found" >&2
    fi
  fi
done

# --- Validate skill structure ---
echo "Running skill validation suite..."
./ops/validate-all.sh
echo "Validation complete."
echo ""

# --- Runtime sync ---
echo "Running runtime sync..."
if bash ./runtime/sync.sh --dry-run 2>/dev/null; then
  echo "Runtime config valid."
else
  echo "WARNING: Runtime sync dry-run produced warnings. Run 'bash runtime/sync.sh' to inspect." >&2
fi
echo ""

# --- Manifest status ---
bash ./runtime/manifest.sh status 2>/dev/null || true
