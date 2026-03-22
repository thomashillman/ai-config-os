#!/bin/bash
set -euo pipefail

# Thin wrapper: task-resume detection stays in shell, bootstrap runs in the shared core.
_detect_resume_task() {
  local task_goal=""
  local task_code=""

  if [ -n "${AI_CONFIG_WORKER:-}" ] && [ -n "${AI_CONFIG_TOKEN:-}" ]; then
    local response
    response=$(curl -sf \
      -H "Authorization: Bearer ${AI_CONFIG_TOKEN}" \
      --connect-timeout 1 --max-time 2 \
      "${AI_CONFIG_WORKER}/v1/tasks?status=active&limit=1&updated_within=86400" 2>/dev/null) || true

    if [ -n "$response" ]; then
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

  if [ -z "$task_goal" ]; then
    local clipboard=""
    local _tmp
    _tmp=$(mktemp -d 2>/dev/null) || _tmp="/tmp/ss-clip-$$"

    # Skip X11/Wayland tools on headless environments (no DISPLAY or WAYLAND_DISPLAY)
    local _has_display=false
    { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; } && _has_display=true

    # Run available clipboard tools in parallel; each writes to its own temp file
    { pbpaste > "${_tmp}/a" 2>/dev/null; } &
    if [ "$_has_display" = true ]; then
      { xclip -selection clipboard -o > "${_tmp}/b" 2>/dev/null; } &
      { xsel --clipboard --output > "${_tmp}/c" 2>/dev/null; } &
    fi
    { powershell.exe -command "Get-Clipboard" > "${_tmp}/d" 2>/dev/null; } &
    wait

    # Pick first non-empty result (pbpaste > xclip > xsel > powershell, priority preserved)
    for _f in "${_tmp}/a" "${_tmp}/b" "${_tmp}/c" "${_tmp}/d"; do
      [ -s "$_f" ] && { clipboard=$(cat "$_f"); break; }
    done
    rm -rf "${_tmp}"

    if echo "$clipboard" | grep -qiE '^resume [a-z]'; then
      task_goal=$(echo "$clipboard" | sed -E 's/^resume //i')
    fi
  fi

  if [ -n "$task_goal" ]; then
    if [ -n "$task_code" ]; then
      echo "RESUME_AVAILABLE: ${task_goal} (task: ${task_code})"
    else
      echo "RESUME_AVAILABLE: ${task_goal}"
    fi
  fi
}

_detect_resume_task

HOOK_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="$(cd -- "${HOOK_DIR}/../.." && pwd)"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

cd "${PROJECT_DIR}"
exec node "${INSTALL_ROOT}/adapters/bootstrap/run-bootstrap.mjs"
