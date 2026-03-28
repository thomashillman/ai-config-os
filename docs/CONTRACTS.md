# Contract Resource Catalog

Every response from a contract surface conforms to the canonical envelope defined in `docs/CONTRACT_SPEC.md`.
This catalog lists each named resource, its locality, purpose, and how a consumer should render it.

## How to read this catalog

Each entry shows:
- **Path** — HTTP endpoint or MCP tool name
- **Locality** — `worker` (public, remote-safe) or `local` (tunnel required)
- **Five-second answer** — what the response tells a human or agent in one sentence
- **data shape** — the keys inside `data`
- **Render hints** — LLM answer / compact card / richer UI

---

## Worker resources (remote-safe, no tunnel)

### `runtime.capabilities`

**Path:** `GET /v1/runtime/capabilities`
**Locality:** worker — `worker_backed: true`, `remote_safe: true`

**Five-second answer:** What this surface can do and which resources are reachable right now.

**data shape:**
```json
{
  "surface": "worker",
  "worker_backed": true,
  "local_only": false,
  "remote_safe": true,
  "tunnel_required": false,
  "environment": "production",
  "available_resources": ["tasks.list", "tasks.get", "runtime.capabilities", "..."],
  "unavailable_resources": []
}
```

**Render hints:**
- **LLM answer:** "This surface is Worker-backed and remote-safe. No tunnel is required. All task and runtime resources are available."
- **Compact card:** Surface badge (Worker), green dot, resource count
- **Richer UI:** Capability grid showing each flag with tooltip; available_resources as chip list

---

### `tasks.list`

**Path:** `GET /v1/tasks`
**Locality:** worker — `worker_backed: true`, `remote_safe: true`

**Five-second answer:** Which tasks exist and what state each is in.

**data shape:**
```json
{
  "tasks": [
    {
      "task_id": "...",
      "goal": "Review the authentication module",
      "state": "active",
      "current_route": "local_repo",
      "version": 3,
      "findings": [...],
      "updated_at": "2026-03-28T10:00:00Z"
    }
  ]
}
```

**Render hints:**
- **LLM answer:** Use `summary` field directly: "3 task(s) found. 2 active, 1 complete."
- **Compact card:** Task name + state dot + time-ago
- **Richer UI:** HubTab task list with status summary, Continue button on hover

---

### `tasks.get`

**Path:** `GET /v1/tasks/:task_id`
**Locality:** worker — `worker_backed: true`, `remote_safe: true`

**Five-second answer:** Full detail on one task: findings, questions, current route, readiness.

**data shape:**
```json
{
  "task": { "task_id": "...", "goal": "...", "state": "active", "findings": [...], "version": 3 }
}
```

**meta shape (task-bearing responses):**
```json
{
  "urgency": "blocked",
  "open_questions": 2,
  "blocker_count": 1,
  "best_next_route": "local_repo",
  "verification_count": 4
}
```

**Render hints:**
- **LLM answer:** "Task 'Review auth module' is active. 1 blocker, 2 open questions. Best next route: local_repo."
- **Compact card:** Title + urgency badge + question/blocker counts
- **Richer UI:** TaskDetailTab — findings by provenance status, open questions, event story

---

### `tasks.events`

**Path:** `GET /v1/tasks/:task_id/progress-events`
**Locality:** worker — `worker_backed: true`, `remote_safe: true`

**Five-second answer:** What happened during this task, in order.

**data shape:**
```json
{
  "events": [
    { "type": "state_change", "metadata": { "next_state": "active" }, "created_at": "..." }
  ]
}
```

**Render hints:**
- **LLM answer:** "5 events recorded. Last: 'Handoff saved' at 10:05."
- **Compact card:** Event count + last event type
- **Richer UI:** EventStory timeline in TaskDetailTab

---

### `tasks.available_routes`

**Path:** `GET /v1/tasks/:task_id/available-routes`
**Locality:** worker — `worker_backed: true`, `remote_safe: true`

**Five-second answer:** Which execution routes are available and which is strongest for the current environment.

**data shape:**
```json
{
  "best_next_route": "local_repo",
  "available_routes": [
    { "route_id": "local_repo", "strength": "strong", "label": "Full mode" },
    { "route_id": "github_pr", "strength": "weak", "label": "Cloud mode" }
  ]
}
```

**Render hints:**
- **LLM answer:** "Best route: local_repo (Full mode). 2 routes available."
- **Compact card:** Best route badge + route count
- **Richer UI:** Route picker in ResumeSheet

---

### `tasks.continue`

**Path:** `POST /v1/tasks/:task_id/continuation`
**Locality:** worker — `worker_backed: true`, `remote_safe: true`

**Five-second answer:** A signed continuation package ready to resume the task in a new session.

**data shape:**
```json
{
  "continuation_package": {
    "task_id": "...",
    "route": "local_repo",
    "context_summary": "...",
    "findings": [...],
    "open_questions": [...]
  }
}
```

**Render hints:**
- **LLM answer:** Paste `continuation_package` into session context. Route and open questions are pre-loaded.
- **Compact card:** "Ready to continue — route: local_repo"
- **Richer UI:** ResumeSheet confirmation step

---

### `tasks.answer_question`

**Path:** `POST /v1/tasks/:task_id/questions/:question_id/answer`
**Locality:** worker — `worker_backed: true`, `remote_safe: true`

**Five-second answer:** The question was answered; task version incremented.

**data shape:** `{ "task": { ... updated task ... } }`

---

### `tasks.dismiss_question`

**Path:** `POST /v1/tasks/:task_id/questions/:question_id/dismiss`
**Locality:** worker — `worker_backed: true`, `remote_safe: true`

**Five-second answer:** The question was dismissed; task version incremented.

**data shape:** `{ "task": { ... updated task ... } }`

---

## Local-only resources (tunnel required)

These resources are backed by the local runtime process. They require a tunnel (e.g. Cloudflare Tunnel) to reach from a remote agent. `capability.local_only` is `true` and `capability.tunnel_required` is `true` on all responses.

---

### `skills.list`

**Path:** `GET /api/contracts/skills.list`  |  **MCP tool:** `skills.list`
**Locality:** local — `local_only: true`, `tunnel_required: true`

**Five-second answer:** All skills installed in this repository with type, status, and variant coverage.

**data shape:**
```json
{
  "contract": "skills.list",
  "generated_at": "2026-03-28T10:00:00.000Z",
  "skills": [
    { "name": "commit-conventions", "type": "invocable", "status": "stable", "opus": true, "sonnet": true, "haiku": false, "tests": 3 }
  ],
  "total_skills": 42,
  "interpretation": {
    "why_it_matters_now": "Skill inventory exposes 42 skills; 3 are experimental.",
    "skills_needing_improvement": ["debug", "refactor"],
    "top_opportunity": "Stabilize the highest-used experimental skills."
  }
}
```

**Render hints:**
- **LLM answer:** Use `summary`: "Loaded skills.list contract." + `interpretation.why_it_matters_now` for context.
- **Compact card:** Skill count + experimental count badge
- **Richer UI:** SkillsTab table — name, type, status, model variant columns

---

### `tooling.status`

**Path:** `GET /api/contracts/tooling.status`  |  **MCP tool:** `tooling.status`
**Locality:** local — `local_only: true`, `tunnel_required: true`

**Five-second answer:** Which tools are installed, missing, or degraded in the local environment.

**data shape:** Parsed `list_tools` output — tool entries with name, version, status, and sync state.

**Render hints:**
- **LLM answer:** Use `summary` + `data` for installed/missing split.
- **Compact card:** Installed count + warning count
- **Richer UI:** ToolsTab — structured tool list with Sync button

---

### `config.summary`

**Path:** `GET /api/contracts/config.summary`  |  **MCP tool:** `config.summary`
**Locality:** local — `local_only: true`, `tunnel_required: true`

**Five-second answer:** The merged runtime configuration (global + machine + project layers) in effect right now.

**data shape:** Parsed `get_config` output — config sections with key-value pairs and source layer labels.

**Render hints:**
- **LLM answer:** Use `summary` + top-level config sections for a quick answer.
- **Compact card:** Active profile + warning count
- **Richer UI:** ConfigTab — section headers with source badge, expandable raw view

---

## Error response

Any resource can return an error envelope. The shape is identical to success except:
- `data` is `null`
- `error` object is present with `code`, `message`, `hint`

See `docs/CONTRACT_SPEC.md` for the full error code list.

---

## Living docs protocol

Update this file when:
- A new resource is added or renamed
- A resource's locality changes (local → worker or vice versa)
- The `data` shape of an existing resource changes in a breaking way

Do NOT duplicate field semantics documented in `docs/CONTRACT_SPEC.md`.
