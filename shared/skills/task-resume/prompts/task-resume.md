# task-resume prompt

You are resuming a portable task from a prior session. Follow this protocol exactly.

## Step 1 — Locate the task

**Source of task identity (in priority order):**
1. Session context contains `RESUME_AVAILABLE: <goal> (task: <short_code>)` → use `<short_code>`
2. User said "resume <name>" or "continue <name>" → treat `<name>` as a name lookup
3. User pasted a task short code (e.g. `auth1`, `pay3`)

**Load the task** — if shell/Worker is available:
```bash
WORKER="${AI_CONFIG_WORKER:-}"
TOKEN="${AI_CONFIG_TOKEN:-}"

if [ -n "$WORKER" ] && [ -n "$TOKEN" ]; then
  # By short code
  curl -sf \
    -H "Authorization: Bearer $TOKEN" \
    "$WORKER/v1/t/<SHORT_CODE>" 2>/dev/null

  # Or by name
  curl -sf \
    -H "Authorization: Bearer $TOKEN" \
    "$WORKER/v1/tasks/by-name/<SLUG>" 2>/dev/null

  # Or latest active task
  curl -sf \
    -H "Authorization: Bearer $TOKEN" \
    "$WORKER/v1/hub/latest" 2>/dev/null
fi
```
Parse the response to get: `task_id`, `goal`, `current_route`, `findings[]`, `version`, `progress`.

**If no Worker available:** ask the user to visit `ai-config-os.workers.dev/hub/latest` and paste the task details.

## Step 2 — Detect current capabilities

Same as task-start: check for `fs.read`, `git.read`, `shell.exec`.

**Route strength:** `local_repo` > `github_pr` > `pasted_diff`

## Step 3 — Present findings as a narrative (not JSON)

If the `momentum_narrate` MCP tool is available, call it with `narration_point: "onResume"` and the task ID. Use the returned fields to construct your narrative:
- `headline` → your opening sentence
- `findings[].narrative` → each finding line (already includes confidence prefix: "Possible", "Previously identified", "Confirmed")
- `upgrade.before` / `upgrade.now` / `upgrade.unlocks` → upgrade explanation
- `next_action` → prompt for user

After showing the narration, call `momentum_record_response` with `response_type: "engaged"` (if user replies) or `"accepted_upgrade"` / `"declined_upgrade"` as appropriate.

If the MCP tool is **not** available, use these defaults:

**If stronger route is now available:**
```
You were reviewing [goal] [prior context — "on Cloud mode" / "on your iPad"].

What I found there:
• [finding 1 summary] (to verify)
• [finding 2 summary] (to verify)
• Open: [any open questions]

Here I can [new capability: trace full call graph / check git history / run tests].
Continue and I'll verify these properly?
```
Wait for "yes". **That is the only required user action.**

**If same or weaker route:**
```
I'm picking up your [goal] review. I have [N] things flagged — I'm still in [mode],
so I can't fully verify them here. Want me to summarise what I found?
```

## Step 4 — After "yes": upgrade route and verify

**Upgrade the route:**
```bash
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || node -e "process.stdout.write(new Date().toISOString())")
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"expected_version\":<VERSION>,\"route_id\":\"local_repo\",\"selected_at\":\"$NOW\"}" \
  "$WORKER/v1/tasks/$TASK_ID/route-selection" > /dev/null 2>&1 || true
```

**Transition findings provenance:**
```bash
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"expected_version\":<NEW_VERSION>,\"to_route_id\":\"local_repo\",\"upgraded_at\":\"$NOW\",\"to_equivalence_level\":\"partial\"}" \
  "$WORKER/v1/tasks/$TASK_ID/findings/transition" > /dev/null 2>&1 || true
```

**Lead with the narrative:**
> Your [prior mode] review gave me a head start. Let me pick up where we left off...

Then begin verifying each prior finding using your local tools.

## Step 5 — After verifying each prior finding

Update provenance via `POST /v1/tasks/{id}/findings` (new finding with verified/invalidated status, `expected_version` tracking).

Narrate results:
- Confirmed: *"The [issue] is real — I traced it back [evidence]."*
- Cleared: *"The [issue] isn't a problem — I was working from incomplete context in Cloud mode."*

## Step 5b — Record finding evolution narration (if MCP available)

After verifying each finding, if `momentum_narrate` is available, call it with `narration_point: "onFindingEvolved"`, the finding ID, and `previous_confidence` / `new_confidence`. Use the returned `headline` to narrate the confidence change to the user.

## Provenance states (internal → user-facing)
| Status | Say to user |
|---|---|
| `hypothesis` | "to verify" |
| `reused` | "flagged previously, now I can check properly" |
| `verified` | "Confirmed" |
| `invalidated` | "Not an issue — was working from limited context" |

If the `momentum_narrate` tool is available, prefer its `findings[].narrative` output over the table above — the narrator already includes the correct prefix.

## Never
- Never show provenance codes, task IDs, or JSON in conversation
- Never require more than one user action ("yes") for the happy path
- Never call more than one API endpoint without interleaving with the work narrative
