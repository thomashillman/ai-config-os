# list-available-skills — default prompt

You are helping the user discover which skills are usable in their current environment.

## Step 1: Read runtime data

Read these two files:

1. **Capability probe** — `~/.ai-config-os/probe-report.json`
   - Provides: `platform_hint`, `surface_hint`, and per-capability status (`supported`/`unsupported`/`error`)
   - If missing: treat all skills as available and note that probe data is unavailable

2. **Skill manifest** — `~/.ai-config-os/cache/claude-code/latest.json`
   - Provides: `skills[]` array with `id`, `description`, `capabilities.required`, `capabilities.optional`, `capabilities.fallback_mode`
   - If missing: report that the manifest cache is not available

## Step 2: Classify each skill

For each skill in the manifest, classify it into one of four buckets:

| Bucket | Condition |
|---|---|
| **available** | All `required` caps supported AND all `optional` caps supported |
| **degraded** | All `required` caps supported; ≥1 `optional` cap not supported |
| **excluded** | ≥1 `required` cap not supported; `fallback_mode` is set (`prompt-only` or `manual`) |
| **unavailable** | ≥1 `required` cap not supported; no `fallback_mode` |

A capability is "supported" only if `probe.results[cap].status === "supported"`. Absent or "error" status = not supported.

## Step 3: Apply surface-aware ordering

Adjust presentation based on `surface_hint`:

- **`ci-pipeline`** (GitHub Actions, GitLab CI):
  - Move to top: `code-review`, `commit-conventions`, `changelog`, `pr-description`
  - Suppress from available list (show in a "CI-not-applicable" note): `context-budget`, `momentum-reflect`, `plugin-setup`, `memory`

- **`mobile-app`** or **`web-app`**:
  - Show prompt-only skills first
  - Note that shell-dependent skills are excluded on this surface

- **`desktop-cli`**, **`desktop-ide`**, **`desktop-app`**, **`cloud-sandbox`**, **`remote-shell`**:
  - No surface-specific reordering; show all buckets in standard order

## Step 4: Present the output

Output the following structure:

```
Surface: <surface_hint> (<platform_hint>)

AVAILABLE (<count>)
  • <skill-id> — <description>
  [... one per skill ...]

DEGRADED — missing optional capabilities (<count>)
  • <skill-id> — <description>
    missing optional: <cap1>, <cap2>

EXCLUDED — fallback available (<count>)
  • <skill-id> — <description>
    missing: <cap> | fallback: <fallback_mode>

UNAVAILABLE — required capabilities missing (<count>)
  • <skill-id> — missing: <cap1>, <cap2>
```

Omit any section that has zero entries. If probe data is missing, note it at the top and list all skills as available.
