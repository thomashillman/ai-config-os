# task-save prompt

Explicitly save current task state. Fast, no ceremony.

## If Worker is available (shell access)

```bash
WORKER="${AI_CONFIG_WORKER:-}"
TOKEN="${AI_CONFIG_TOKEN:-}"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || node -e "process.stdout.write(new Date().toISOString())")

# Transition state to checkpoint current progress
curl -sf -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"expected_version\":<CURRENT_VERSION>,\"next_state\":\"active\",\"next_action\":\"resume\",\"updated_at\":\"$NOW\",\"progress\":{\"completed_steps\":<COMPLETED>,\"total_steps\":<TOTAL>}}" \
  "$WORKER/v1/tasks/$TASK_ID/state" > /dev/null 2>&1 || true
```

Then output (2 lines max):
```
Saved. [N] findings[, note if given].
Continue: ai-config-os.workers.dev/hub/latest
```

If short_code is known: `[short_code] · [N] findings saved.`

## If no Worker (cloud/iPad — no env vars accessible)

Output a recovery phrase prominently:

```
[Couldn't reach the task server from this environment.]

To continue on any device, paste this into Claude Code or Codex:

resume [short description of the goal]

Or visit: ai-config-os.workers.dev/hub/latest
```

## Never
- Never ask "are you sure?" before saving
- Never emit more than 3 lines of output
- Never show raw JSON, task IDs, or API responses
