---
skill: "task-start"
description: "Silently create and persist a portable task when the user asks for a review, audit, or analysis. Works in any environment — cloud or local.

  Auto-invoked when the user begins substantive review/analysis work. Claude detects capability profile, selects route deterministically, creates a PortableTaskObject in the runtime, and works normally. Users see mode acknowledgement ('Cloud mode' or 'Full mode') and a short save confirmation — never JSON or task IDs."
type: "prompt"
status: "stable"

capabilities:
  required: []
  optional: ["fs.read", "git.read", "shell.exec"]
  fallback_mode: prompt-only
  fallback_notes: "In cloud environments, operates from pasted diffs, PR URLs, or described code. Saves findings for later verification on a stronger device."

inputs:
  - name: "goal"
    type: "string"
    description: "What the user wants reviewed or analysed"
    required: true
  - name: "content"
    type: "string"
    description: "Code, diff, PR URL, or description to analyse"
    required: false

outputs:
  - name: "task_id"
    type: "string"
    description: "Internal task identifier (never shown to users)"
  - name: "short_code"
    type: "string"
    description: "Human-readable task code (e.g. auth1) for recovery"

dependencies:
  skills: []
  apis:
    - "ai-config-os-worker"
  models:
    - "opus"
    - "sonnet"
    - "haiku"

examples:
  - input: "Review this auth diff for security issues"
    output: "I'm reviewing this in Cloud mode — I can see structural patterns here. Once you switch to a machine with your full codebase, I'll verify these findings properly. Saved 2 findings. Continue on any device."
    expected_model: "sonnet"
  - input: "Audit the payment module for vulnerabilities"
    output: "Full mode — using your local codebase. I can trace call graphs and check git history. Saved checkpoint."
    expected_model: "sonnet"

variants:
  sonnet:
    prompt_file: "prompts/task-start.md"
    description: "Default; balanced analysis with automatic checkpointing"
    cost_factor: 1.0
    latency_baseline_ms: 400
  haiku:
    prompt_file: "prompts/task-start.md"
    description: "Fast analysis for quick scans"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - sonnet
    - haiku

tests:
  - id: cloud-mode-ack
    type: prompt-validation
    input: "Review this diff: +const token = req.headers['x-auth']"
    expected_substring: "Cloud mode"
    models_to_test:
      - sonnet
  - id: save-confirmation
    type: prompt-validation
    input: "Review this file for security issues"
    expected_substring: "Saved"
    models_to_test:
      - sonnet

docs:
  auto_generate_readme: false
  help_text: "Start a portable review task — works in any environment, continues on any device"
  keywords:
    - "task"
    - "review"
    - "start"
    - "checkpoint"
    - "portable"

version: "1.0.0"
changelog:
  "1.0.0": "Initial release — auto-start, auto-save, cross-environment"
---

# task-start

Silently begins a portable review task and checkpoints findings automatically. Works in any environment.

## Protocol

When the user asks for a review, audit, analysis, or security check:

1. **Detect capability profile** — determine what's available: `fs.read`, `git.read`, `shell.exec`. Map to route:
   - `local_repo` if full filesystem + git access available
   - `github_pr` if a PR URL is given and HTTP available
   - `pasted_diff` otherwise (cloud/iPad/web)
   - Never ask the user to choose a route.

2. **Acknowledge mode honestly** (first message, one sentence):
   - Cloud mode: *"I'm reviewing this in Cloud mode — I can see structure and patterns here. Once you switch to a machine with your full codebase, I'll be able to verify these findings properly."*
   - Full mode: *"Full mode — using your local codebase. I can trace the full call graph and check git history."*

3. **Create PortableTaskObject** — call `POST /v1/tasks` with:
   ```json
   {
     "task_id": "<uuid>",
     "task_type": "review_repository",
     "goal": "<user's goal>",
     "state": "active",
     "next_action": "review",
     "current_route": "<detected_route>",
     "route_history": [{ "route_id": "<detected_route>", "selected_at": "<now>" }],
     "findings": [],
     "progress": { "completed_steps": 0, "total_steps": 0 },
     "version": 1,
     "created_at": "<now>",
     "updated_at": "<now>"
   }
   ```
   Do this silently — no "creating task" message.

4. **Do the work** — review, analyse, think, find issues.

5. **Record findings** — at natural pauses, call `PATCH /v1/tasks/{id}/state` or the findings endpoint with each finding. Use provenance:
   - `hypothesis` — something noticed, needs verification with full codebase
   - `verified` — confirmed with local tools

6. **Auto-checkpoint** at natural stopping points (every 3–5 findings or when switching focus):
   - *"Saved 3 findings. Continue on any device with full code access."*
   - Show the short code only if asked, or if this is the final checkpoint.
   - Never show UUIDs, JSON, or API call details.

7. **Final message** when pausing or if session may end:
   - *"Saved. [N] findings, [M] open questions. Continue on any device: say 'resume [short-code]' or open ai-config-os.workers.dev/hub/latest"*

## Mode detection (priority order)

```
shell.exec + fs.read + git.read  →  local_repo   (Full mode)
PR URL in message                →  github_pr    (Cloud mode — PR)
diff pasted in message           →  pasted_diff  (Cloud mode)
description only                 →  pasted_diff  (Cloud mode)
```

## User-facing language

| Internal | Say to user |
|---|---|
| `local_repo` | "Full mode — using your local codebase" |
| `pasted_diff` / `github_pr` | "Cloud mode" |
| `hypothesis` finding | "I noticed something — needs checking when I have full access" |
| `verified` finding | "Confirmed" |
| task created | (silent) |
| finding saved | (silent, or brief summary at checkpoints) |
