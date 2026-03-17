---
skill: "task-save"
description: "Explicitly checkpoint the current task state and emit a short URL for recovery. Used when auto-save hasn't fired or user wants to ensure state is persisted before closing a session.

  Companion to task-start (which auto-saves at natural pauses). Use task-save when the user explicitly asks to save, checkpoint, or pause — or when about to end a long session."
type: "prompt"
status: "stable"

capabilities:
  required: []
  optional: []
  fallback_mode: prompt-only
  fallback_notes: "Can output a recovery phrase for clipboard even if Worker is unreachable."

inputs:
  - name: "note"
    type: "string"
    description: "Optional note to attach to this checkpoint (e.g. 'pausing for the night')"
    required: false

outputs:
  - name: "short_url"
    type: "string"
    description: "Short URL to resume this task (e.g. ai-config-os.workers.dev/hub/latest)"
  - name: "summary"
    type: "string"
    description: "One-line human summary of what was saved"

dependencies:
  skills:
    - name: "task-start"
      version: "^1.0"
      optional: false
  apis:
    - "ai-config-os-worker"
  models:
    - "haiku"
    - "sonnet"

examples:
  - input: "Save checkpoint"
    output: "Saved. 3 findings, 1 open question. Continue at: ai-config-os.workers.dev/hub/latest"
    expected_model: "haiku"
  - input: "Save — pausing for the night"
    output: "Saved with note 'pausing for the night'. auth1 · 2 findings. ai-config-os.workers.dev/hub/latest"
    expected_model: "haiku"

variants:
  haiku:
    prompt_file: "prompts/task-save.md"
    description: "Default; fast checkpoint with minimal output"
    cost_factor: 0.3
    latency_baseline_ms: 150
  sonnet:
    prompt_file: "prompts/task-save.md"
    description: "More detailed checkpoint summary"
    cost_factor: 1.0
    latency_baseline_ms: 300
  fallback_chain:
    - haiku
    - sonnet

tests:
  - id: save-output-url
    type: prompt-validation
    input: "save checkpoint"
    expected_substring: "workers.dev"
    models_to_test:
      - haiku
  - id: save-with-note
    type: prompt-validation
    input: "save — pausing for tonight"
    expected_substring: "Saved"
    models_to_test:
      - haiku

docs:
  auto_generate_readme: false
  help_text: "Explicitly checkpoint current task — emits short URL for cross-device recovery"
  keywords:
    - "save"
    - "checkpoint"
    - "pause"
    - "handoff"

version: "1.0.0"
changelog:
  "1.0.0": "Initial release — explicit checkpoint with short URL output"
---

# task-save

Explicitly saves the current task state. Outputs a short URL — no JSON, no UUIDs, no visible task IDs.

## When to invoke

- User says: "save", "checkpoint", "pause", "save this", "I'm stopping here"
- About to end a long session (auto-save may not have caught latest state)
- User asks where to continue from another device
- Recovery needed (e.g., connection lost mid-session)

## Protocol

1. **Flush pending state** — ensure any unflushed findings are written via `PATCH /v1/tasks/{id}/state` or findings endpoint.

2. **Append checkpoint log entry** — include timestamp, note (if given), current finding count.

3. **Output** (two lines max):
   ```
   Saved. [N] findings[, note if given].
   Continue: ai-config-os.workers.dev/hub/latest
   ```
   If short code is available: *"auth1 · 3 findings saved."*

4. **No JSON blocks** — never emit raw API responses, task IDs, or internal state in the conversation.

## Fallback (Worker unreachable)

If `POST /v1/tasks` fails, output a recovery phrase for clipboard:

```
[Could not reach the task server — here's your recovery phrase to paste on your next session:]

resume auth review
```

The phrase uses the task name/goal, not a UUID. When pasted into any session with task-resume loaded, it will re-fetch and present the task.
