---
skill: post-merge-retrospective
description: |
  After a PR is merged, analyzes the session conversation to surface errors,
  inefficiencies, and friction points, then recommends new skills and writes a
  machine-readable JSON artifact to disk for tracking improvements over time.
type: agent
status: experimental

capabilities:
  required:
    - fs.write
  optional:
    - fs.read
    - git.read
  fallback_mode: prompt-only
  fallback_notes: "Can analyze pasted conversation without filesystem access; artifact printed to stdout."

platforms:
  claude-web:
    mode: degraded
    notes: "fs.write unavailable; artifact printed to stdout instead of written to disk."

inputs:
  - name: pr_ref
    type: string
    description: "PR number or branch name just merged (e.g. '42' or 'feat/foo'). Auto-detected from git when omitted."
    required: false
  - name: output_path
    type: string
    description: "Path to write JSON artifact. Defaults to ~/.ai-config-os/retrospectives/<date>-<pr>.json"
    required: false

outputs:
  - name: artifact
    type: object
    description: "Structured retrospective report (see schema/artifact.schema.json)"
  - name: skill_recommendations
    type: array
    description: "Ordered list of proposed new skills with rationale and category"

dependencies:
  skills: []
  apis: []
  models:
    - haiku

examples:
  - input: "Run post-merge retrospective for PR #42"
    output: "Artifact written to ~/.ai-config-os/retrospectives/2026-03-23-pr42.json with 3 friction signals and 2 skill recommendations"
    expected_model: haiku

variants:
  haiku:
    prompt_file: prompts/haiku.md
    description: "Cost-efficient session analysis; default for all retrospective runs"
    cost_factor: 0.3
    latency_baseline_ms: 200
  fallback_chain:
    - haiku

tests:
  - id: test-friction-detection
    type: prompt-validation
    input: "Analyze this session for friction: user corrected Claude three times on the same file path; Claude re-read the same file twice without progress"
    expected_substring: "friction"
    models_to_test:
      - haiku
  - id: test-skill-recommendation
    type: prompt-validation
    input: "Session where Claude repeatedly asked for the database schema. Recommend skills."
    expected_substring: "skill"
    models_to_test:
      - haiku
  - id: test-artifact-structure
    type: structure-check
    input: "Emit artifact for empty session"
    expected_not_null: true

docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
  help_text: "Run after merging a PR to capture session friction and generate skill improvement ideas."
  keywords:
    - retrospective
    - self-improvement
    - skill-creation
    - post-merge
    - session-analysis

monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - friction_signal_count
    - recommendation_count
  alert_threshold_latency_ms: 5000
  public_metrics: false

version: "1.0.0"
changelog:
  "1.0.0": "Initial release: session analysis, friction detection, skill recommendations, JSON artifact"

tags:
  - self-improvement
  - retrospective
  - post-merge
---

# post-merge-retrospective

Analyzes the completed session conversation after a PR merge to surface friction signals, errors, and inefficiencies, then recommends new skills and emits a structured JSON artifact.

## When to use

- Immediately after `gh pr merge` or equivalent completes
- Can be wired to a PostToolUse hook matching `Bash(gh pr merge)` — see hook configuration below
- Run manually with `/post-merge-retrospective` at the end of any significant session

## Instructions

You are using the Haiku variant for cost efficiency. Work through the steps below using the session conversation already in context.

### Step 1: Collect context

Identify the PR reference from `$ARGUMENTS`, or auto-detect:
```bash
git log --merges -1 --pretty="%s"
# or
git branch --show-current
```

Note the approximate session turn count and total tool calls from context.

### Step 2: Analyze for friction signals

Scan every assistant turn and tool call in context. Classify each signal:

| Signal type | Definition |
|---|---|
| `error` | Tool call or command returned non-zero exit or error message |
| `correction` | User explicitly corrected Claude's output or direction |
| `loop` | Claude re-read or re-executed the same operation without clear progress |
| `assumption_failure` | Claude made an assumption that proved wrong, requiring backtrack |
| `missing_context` | Claude asked for information the user supplied that could have been pre-loaded |
| `inefficiency` | Approach that worked but took significantly more steps than necessary |
| `capability_gap` | Task where no skill/tool existed, forcing ad-hoc reasoning from scratch |

For each signal record:
- `type` — from table above
- `turn_index` — approximate assistant turn number
- `description` — one concrete sentence
- `impact` — `low | medium | high`
- `repeatable` — `true` if this would recur in a similar session

### Step 3: Generate skill recommendations

For each `repeatable: true` signal with `impact: medium|high`, assess whether a skill would address it. Apply the decision gate:

> Recommend a skill only if: (a) Claude needed domain-specific context not in its training data, OR (b) the task required 3+ coordinated steps assembled from scratch, OR (c) a guard/hook would prevent an error class from recurring.

Classify each into one of eight categories:
`library-api-reference | product-verification | data-fetching | business-automation | scaffolding | code-quality | ci-cd | runbook`

Emit each recommendation with:
- `name` — kebab-case skill name
- `category` — from list above
- `rationale` — one sentence linking it to the observed friction
- `trigger_description` — what user request should activate the skill
- `priority` — `high | medium | low`
- `estimated_reuse` — `once | occasional | frequent`

### Step 4: Write the artifact

Default output path: `~/.ai-config-os/retrospectives/<YYYY-MM-DD>-<pr_ref>.json`

Validate against `schema/artifact.schema.json` before writing. If `fs.write` is unavailable, print the JSON to stdout.

Print a concise summary:
```
Post-merge retrospective: PR #<N>
  <X> friction signals (<Y> high-impact)
  <Z> skill recommendations
  Artifact: <path>
```

## Hook configuration

To trigger automatically after every `gh pr merge`, add via `/update-config`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash(gh pr merge)",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Run /post-merge-retrospective to capture session insights'"
          }
        ]
      }
    ]
  }
}
```

For a fully automated trigger, replace the echo with a script that writes a marker file and invokes the skill on next session start.

## Output schema

See `schema/artifact.schema.json` for the full contract. Top-level structure:

```json
{
  "schema_version": "1.0",
  "generated_at": "<ISO 8601>",
  "pr_ref": "<string>",
  "session_stats": {
    "turn_count": 0,
    "tool_calls": 0,
    "duration_hint": "<string>"
  },
  "friction_signals": [
    {
      "type": "error|correction|loop|assumption_failure|missing_context|inefficiency|capability_gap",
      "turn_index": 0,
      "description": "<string>",
      "impact": "low|medium|high",
      "repeatable": true
    }
  ],
  "skill_recommendations": [
    {
      "name": "<kebab-case>",
      "category": "<category>",
      "rationale": "<string>",
      "trigger_description": "<string>",
      "priority": "high|medium|low",
      "estimated_reuse": "once|occasional|frequent"
    }
  ],
  "summary": {
    "total_signals": 0,
    "high_impact_signals": 0,
    "recommendation_count": 0
  }
}
```

## Examples

### Example 1 — auto-detected PR
**Input:** `/post-merge-retrospective`
**Output:** Artifact at `~/.ai-config-os/retrospectives/2026-03-23-pr42.json` — 4 signals (2 high-impact), 2 skill recommendations

### Example 2 — explicit PR ref, schema-loader recommendation
**Input:** `/post-merge-retrospective 17`
**Output:** Artifact with 1 signal (`missing_context`, high), 1 recommendation: `db-schema-loader` (category: `library-api-reference`, priority: `high`, estimated_reuse: `frequent`)
