# Session-Start Robustness Contract (v0.8.0+)

The **session-start robustness contract** guarantees that Claude Code can discover and use skills reliably, even when the Worker is unavailable or manifests are stale.

## What happens at session start

When Claude Code starts in a remote environment (`.claude/hooks/session-start.sh`):

1. **Task resumption** — Query Worker KV for active tasks (or detect from clipboard)
2. **Validation** — Run skill structure validation (catches config errors early)
3. **Runtime sync** — Reconcile desired vs installed runtime config
4. **Capability probe** — Detect local platform capabilities (filesystem, shell, MCP, etc.) and cache results at `~/.ai-config-os/probe-report.json`
5. **Fetch manifest** — Background fetch latest manifest from Worker, compare with local cache
   - If newer: update cache (`~/.ai-config-os/cache/claude-code/latest.json`)
   - If unreachable: use cached version silently
   - If stale (>1 day old): emit non-fatal warning

## Robustness guarantees

| Scenario | Behavior | Fallback |
|----------|----------|----------|
| Worker unavailable | Uses last-known-good manifest | Oldest cached manifest (forever valid) |
| Network partition | Skills still work | All local skills loaded from cache |
| Manifest 1 week old | Still usable | Versions are immutable; no retroactive breaking changes |
| New skill published | Available next session | Current session uses cached skills |
| Capability mismatch | Skill excluded from display | Manual prompt-only fallback available |

## Architecture

**Worker contract (immutable-by-version):**
- `GET /v1/manifest/latest` returns manifest with `Cache-Control: max-age=31536000, immutable`
- ETag: version hash (clients can use If-None-Match)
- Fallback: Serve cached manifest if KV/R2 unavailable

**Client contract (local-first):**
- Manifest cache: `~/.ai-config-os/cache/claude-code/latest.json`
- Capability cache: `~/.ai-config-os/probe-report.json`
- Both caches survive Worker downtime indefinitely
- Fetch new manifest in background (non-blocking)

**Skill compatibility:**
- Skills declare `capabilities.required` (e.g., `[shell.exec, fs.write]`)
- Client filters display: show only skills compatible with detected capabilities
- Fallback modes: if skill unavailable, show prompt-only guidance

## Testing robustness locally

```bash
# Simulate Worker unavailable
bash adapters/claude/materialise.sh status        # see cached vs remote
rm ~/.ai-config-os/cache/claude-code/latest.json # clear cache
bash ops/capability-probe.sh                      # run probe manually
```

## When robustness fails

**Manifest cache corrupted or missing:**
```bash
rm ~/.ai-config-os/cache/claude-code/latest.json
bash adapters/claude/materialise.sh fetch        # re-fetch
```

**Probe results stale (>1 week):**
```bash
bash ops/capability-probe.sh --quiet              # re-run probe
```

**Skills incompatible with detected capabilities:**
- Check `~/.ai-config-os/probe-report.json` for detected capabilities
- Cross-reference against skill's `capabilities.required` in SKILL.md
- File issue if skill declares wrong requirements
