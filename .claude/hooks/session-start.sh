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
      --max-time 3 \
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
    if command -v pbpaste &>/dev/null; then
      clipboard=$(pbpaste 2>/dev/null) || true
    elif command -v xclip &>/dev/null; then
      clipboard=$(xclip -selection clipboard -o 2>/dev/null) || true
    elif command -v xsel &>/dev/null; then
      clipboard=$(xsel --clipboard --output 2>/dev/null) || true
    elif command -v powershell.exe &>/dev/null; then
      clipboard=$(powershell.exe -command "Get-Clipboard" 2>/dev/null) || true
    fi

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

_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "${_PROJECT_DIR}"
exec node "${_PROJECT_DIR}/adapters/bootstrap/run-bootstrap.mjs"
