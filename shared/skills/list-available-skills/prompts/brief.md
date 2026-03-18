# list-available-skills — brief prompt (haiku variant)

Read `~/.ai-config-os/probe-report.json` and `~/.ai-config-os/cache/claude-code/latest.json`.

Classify each skill:
- **available**: all required + optional caps supported
- **degraded**: required caps met; ≥1 optional missing
- **excluded**: required cap missing but fallback exists
- **unavailable**: required cap missing, no fallback

Output one line per skill, grouped by bucket. Include surface and counts.

Format:
```
Surface: <surface_hint> (<platform_hint>) | Skills: <N> available, <N> degraded, <N> excluded, <N> unavailable

AVAILABLE: skill-a, skill-b, skill-c
DEGRADED:  skill-d (missing: mcp.client)
EXCLUDED:  skill-e (fallback: prompt-only)
```
