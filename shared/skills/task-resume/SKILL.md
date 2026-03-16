---
skill: "task-resume"
description: "Resume a portable task from any prior environment. Presents findings as a narrative, upgrades route transparently, and requires exactly one user action ('yes') to continue.

  Invoked by the session-start hook when an active task is detected, or when the user says 'resume', 'continue', or 'yes' in response to a continuation offer."
type: "prompt"
status: "stable"

capabilities:
  required: []
  optional: ["fs.read", "git.read", "shell.exec"]
  fallback_mode: prompt-only
  fallback_notes: "In cloud environments, presents findings from prior session and continues analysis from available context."

inputs:
  - name: "task_id"
    type: "string"
    description: "Task identifier from session-start hook or short code"
    required: false
  - name: "short_code"
    type: "string"
    description: "Human-readable short code (e.g. auth1) — alternative to task_id"
    required: false

outputs:
  - name: "continuation_summary"
    type: "string"
    description: "Plain-language continuation offer shown to the user"

dependencies:
  skills:
    - name: "task-start"
      version: "^1.0"
      optional: false
  apis:
    - "ai-config-os-worker"
  models:
    - "opus"
    - "sonnet"
    - "haiku"

examples:
  - input: "RESUME_AVAILABLE: auth review (task: auth1)"
    output: "You were reviewing the auth module on your iPad. I found 2 things to check and 1 open question. Now that I'm here with your full codebase, I can verify them properly. Continue?"
    expected_model: "sonnet"
  - input: "resume auth review"
    output: "Found your auth review session. Here's what I found in Cloud mode: [findings]. Continue and I'll verify these with full access?"
    expected_model: "sonnet"

variants:
  sonnet:
    prompt_file: "prompts/task-resume.md"
    description: "Default; narrative continuation with route upgrade"
    cost_factor: 1.0
    latency_baseline_ms: 400
  haiku:
    prompt_file: "prompts/task-resume.md"
    description: "Fast resume for simple tasks"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - sonnet
    - haiku

tests:
  - id: continuation-offer
    type: prompt-validation
    input: "RESUME_AVAILABLE: auth review"
    expected_substring: "Continue?"
    models_to_test:
      - sonnet
  - id: one-action-resume
    type: prompt-validation
    input: "yes"
    expected_substring: "verif"
    models_to_test:
      - sonnet

docs:
  auto_generate_readme: false
  help_text: "Resume a task from any prior environment — one 'yes' and you're back"
  keywords:
    - "resume"
    - "continue"
    - "handoff"
    - "portable"

version: "1.0.0"
changelog:
  "1.0.0": "Initial release — 1-action resume, narrative route upgrade"
---

# task-resume

Resumes a portable task. Presents prior findings as a story, detects the new capability context, and if a stronger route is available, makes one plain-language offer. The user says "yes" — that's it.

## Protocol

### Trigger conditions (any of):
- Session-start hook injects `RESUME_AVAILABLE: <goal> (task: <short_code>)`
- User says "resume", "continue", "pick up where we left off", "yes" (in context)
- User types `resume <short_code>` or `resume <name fragment>`

### Steps

1. **Load task** — `GET /v1/tasks/{taskId}` or `GET /v1/tasks/by-name/{slug}` or `GET /v1/t/{code}`.

2. **Detect current capabilities** — same as task-start. Map to route.

3. **If same or weaker route than original** — acknowledge limitations, present findings, ask how to continue:
   - *"I'm picking up your [goal] review. I have [N] things flagged — I'm still in Cloud mode, so I can't verify them here. Want me to summarise what I found?"*

4. **If stronger route available** — present one plain-language upgrade offer:
   ```
   You were reviewing [goal] on [prior device/mode].

   What I found there:
   • [finding 1 summary] (to verify)
   • [finding 2 summary] (to verify)
   • Open: [question]

   Here I can [describe new capability: trace full call graph / check git history / run tests].
   Continue and I'll verify these properly?
   ```
   Wait for "yes" or equivalent. **One user action.**

5. **After "yes"** — upgrade route:
   - Call `POST /v1/tasks/{id}/route-selection` with new route
   - Call findings transition endpoint to update provenance from `hypothesis`/`reused` to tracking
   - Begin verification work
   - *"Your [prior mode] review gave me a head start. Let me pick up where we left off..."*

6. **After verification of each prior finding**:
   - Confirmed: *"The [issue] is real — I traced it back [evidence]."*
   - Cleared: *"The [issue] isn't a problem — I was working from incomplete context [prior mode]."*
   - New findings: add normally

7. **Checkpoint at end**: *"Updated. [N] confirmed, [M] cleared, [K] new findings. Saved."*

## Provenance translation (user-facing)

| Status | Say to user |
|---|---|
| `hypothesis` | "I noticed something — needs checking" |
| `reused` | "I flagged this [prior mode], now I can verify it" |
| `verified` | "Confirmed" |
| `invalidated` | "Not an issue — was working from incomplete context" |

## Finding summary format

Keep each finding to one line. No JSON. No UUIDs.
- ✓ Good: *"Token rotation looks missing in auth middleware"*
- ✗ Bad: `{ finding_id: "f_abc123", provenance: { status: "hypothesis" } }`

## Route upgrade logic

```
current_route == prior_route         → no upgrade needed, continue
current_route is stronger            → one offer, wait for yes
current_route is weaker              → acknowledge, ask how to proceed
```

Route strength: `local_repo` > `github_pr` > `pasted_diff`
