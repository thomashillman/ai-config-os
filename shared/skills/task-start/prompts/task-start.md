# task-start prompt

You are beginning a portable review task. Follow this protocol exactly.

## Step 1 — Detect capability profile

Check what tools you have available:
- **Full mode** (`local_repo`): `fs.read` + `git.read` + `shell.exec` all available → you can read files, run git, execute commands
- **Cloud mode** (`pasted_diff` / `github_pr`): only pasted content or a PR URL → no local filesystem access

Acknowledge mode in your first sentence (one sentence only). If the `momentum_narrate` MCP tool is available, call it with `narration_point: "onStart"` after creating the task and use the returned `headline` and `upgrade` fields to construct your opening. Otherwise, use these defaults:
- Full mode: *"Full mode — using your local codebase. I can trace the full call graph and check git history."*
- Cloud mode: *"I'm reviewing this in Cloud mode — I can see structure and patterns here. Once you switch to a machine with your full codebase, I'll be able to verify these findings properly."*

## Step 1b — Resolve intent (if MCP available)

If the `momentum_resolve_intent` MCP tool is available, call it with the user's original phrase. If it resolves (`resolved: true`), use `taskType` and `routeHints` to pre-fill Step 2. If `routeHints.prefer_route` is set, use it as the initial route selection hint. This replaces manual intent classification.

## Step 2 — Create the task (silently)

**If shell access is available** (Full mode or cloud env with shell):
```bash
# Read Worker config from environment
WORKER="${AI_CONFIG_WORKER:-}"
TOKEN="${AI_CONFIG_TOKEN:-}"

if [ -n "$WORKER" ] && [ -n "$TOKEN" ]; then
  TASK_ID=$(node -e "process.stdout.write(crypto.randomUUID())" 2>/dev/null \
    || python3 -c "import uuid; print(str(uuid.uuid4()), end='')" 2>/dev/null \
    || echo "task-$(date +%s)")
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || node -e "process.stdout.write(new Date().toISOString())")

  curl -sf -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"task_id\":\"$TASK_ID\",\"task_type\":\"review_repository\",\"goal\":\"<USER_GOAL>\",\"state\":\"active\",\"next_action\":\"review\",\"current_route\":\"<ROUTE>\",\"route_history\":[{\"route_id\":\"<ROUTE>\",\"selected_at\":\"$NOW\"}],\"findings\":[],\"progress\":{\"completed_steps\":0,\"total_steps\":0},\"version\":1,\"created_at\":\"$NOW\",\"updated_at\":\"$NOW\"}" \
    "$WORKER/v1/tasks" > /dev/null 2>&1 || true

  echo "TASK_ACTIVE:$TASK_ID"
fi
```
Replace `<USER_GOAL>` with a short description of what the user asked for. Replace `<ROUTE>` with the detected route (`local_repo`, `github_pr`, or `pasted_diff`). Store the task ID in your working context.

**If no shell access** (cloud-only environment, no env vars accessible):
- Note that you cannot persist to the Worker from this environment
- Still do the review work
- At the end, output the full task JSON in a code block so the user can save it manually or paste it into the hub

## Step 3 — Do the work

Review, analyse, find issues. This is the main job. Don't let task management overhead interrupt the work.

## Step 4 — Record findings (at natural pauses)

**If shell/Worker is available** — after each significant finding, append it:
```bash
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || node -e "process.stdout.write(new Date().toISOString())")
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"expected_version\":<CURRENT_VERSION>,\"finding\":{\"finding_id\":\"f_$(date +%s)\",\"type\":\"finding\",\"summary\":\"<SUMMARY>\",\"description\":\"<DETAIL>\",\"location\":\"<FILE:LINE>\",\"provenance\":{\"status\":\"<STATUS>\",\"recorded_by_route\":\"<ROUTE>\",\"recorded_at\":\"$NOW\"}},\"updated_at\":\"$NOW\"}" \
  "$WORKER/v1/tasks/$TASK_ID/findings" > /dev/null 2>&1 || true
```
- `<STATUS>`: use `verified` if you can confirm with local tools, `hypothesis` if you can't fully verify yet
- `<TYPE>`: use `finding` (default) for observations/issues; use `question` for things you need the user to answer
- `<CURRENT_VERSION>`: track the version from task creation (starts at 1, increments with each write)
- Keep `<SUMMARY>` to one plain-English sentence. No jargon.

**Recording open questions** — when you encounter something you can't determine from the available context (e.g. "Is token revocation implemented?", "Does this codepath get called in production?"), record it as a question finding:
```bash
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"expected_version\":<CURRENT_VERSION>,\"finding\":{\"finding_id\":\"q_$(date +%s)\",\"type\":\"question\",\"summary\":\"<QUESTION_TEXT>\",\"provenance\":{\"status\":\"hypothesis\",\"recorded_by_route\":\"<ROUTE>\",\"recorded_at\":\"$NOW\"}},\"updated_at\":\"$NOW\"}" \
  "$WORKER/v1/tasks/$TASK_ID/findings" > /dev/null 2>&1 || true
```
The hub will show these as "Open questions" with Answer / Dismiss buttons for the user.

**If no Worker** — keep findings in your working context, emit them at checkpoint.

## Step 5 — Checkpoint output (every 3-5 findings or at session end)

If Worker is active:
> Saved [N] findings. Continue on any device with full code access.

If no Worker (cloud-only):
> Here's your session checkpoint — paste this into ai-config-os.workers.dev/hub/latest to save it, or start your next session with: **resume [short description of goal]**

Final checkpoint always includes:
> ai-config-os.workers.dev/hub/latest

## Never
- Never show raw JSON to the user unless saving is unavailable
- Never show task IDs, UUIDs, or API call details in conversation
- Never say "creating task" or "saving" — just do it
- Never block the review work on task management operations
