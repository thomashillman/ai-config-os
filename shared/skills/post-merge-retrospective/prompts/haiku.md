# Post-Merge Retrospective — Haiku Variant

You are performing a cost-efficient session retrospective using Haiku. Be concise and analytical. Do not narrate; output structured data and a brief summary.

## Task

Analyze the conversation already in context. Identify every friction signal, apply the decision gate, and emit the JSON artifact.

## Friction signal types (scan for these in every turn)

- **error** — non-zero exit code, stack trace, permission denied, file not found
- **correction** — user said "no", "wait", "that's wrong", "actually", re-stated a requirement
- **loop** — same file read twice, same command run twice, no observable progress between attempts
- **assumption_failure** — Claude stated something as fact that the user contradicted, or a tool call revealed wrong assumptions
- **missing_context** — Claude asked "what is your X?" or "can you share Y?" for information the repo/environment should provide
- **inefficiency** — task completed but via 3+ unnecessary steps (e.g. re-reading a file that was already in context)
- **capability_gap** — Claude assembled multi-step reasoning from scratch for a task that would clearly benefit from a dedicated skill

## Decision gate for skill recommendations

Only recommend a skill if ALL of the following are true:
1. The friction signal is `repeatable: true`
2. The impact is `medium` or `high`
3. One of: (a) domain-specific context not in Claude's training, (b) 3+ steps assembled from scratch, (c) a hook/guard would prevent recurrence

## Output format

Respond with:

1. The raw JSON artifact (wrapped in ```json ... ```)
2. A 3-line summary:
   ```
   Signals: <N> total, <N> high-impact
   Recommendations: <N> skills proposed
   Artifact: <path>
   ```

No other prose. If no friction signals are found, emit an artifact with empty arrays and a `summary.total_signals` of 0.

## JSON artifact schema

```json
{
  "schema_version": "1.0",
  "generated_at": "<ISO 8601 timestamp>",
  "pr_ref": "<pr number or branch name>",
  "session_stats": {
    "turn_count": "<integer>",
    "tool_calls": "<integer>",
    "duration_hint": "<e.g. '~45 min' or 'unknown'>"
  },
  "friction_signals": [
    {
      "type": "<signal type>",
      "turn_index": "<integer>",
      "description": "<one sentence>",
      "impact": "<low|medium|high>",
      "repeatable": "<true|false>"
    }
  ],
  "skill_recommendations": [
    {
      "name": "<kebab-case name>",
      "category": "<library-api-reference|product-verification|data-fetching|business-automation|scaffolding|code-quality|ci-cd|runbook>",
      "rationale": "<one sentence>",
      "trigger_description": "<what user request activates this>",
      "priority": "<high|medium|low>",
      "estimated_reuse": "<once|occasional|frequent>"
    }
  ],
  "summary": {
    "total_signals": "<integer>",
    "high_impact_signals": "<integer>",
    "recommendation_count": "<integer>"
  }
}
```
