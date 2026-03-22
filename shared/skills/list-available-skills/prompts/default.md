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

- **`mobile-app`**, **`ios-app`**, or **`web-app`**:
  - Use the **categorised mobile format** described in Step 4b
  - Do not show AVAILABLE / DEGRADED / EXCLUDED / UNAVAILABLE sections
  - Classify skills as usable (required caps met OR fallback_mode set) vs excluded (no fallback)
  - Show only usable skills, grouped by category
  - Append a single excluded-count note at the end (omit if zero)

- **`desktop-cli`**, **`desktop-ide`**, **`desktop-app`**, **`cloud-sandbox`**, **`remote-shell`**:
  - No surface-specific reordering; use standard bucket format (Step 4a)

## Step 4a: Standard output (non-mobile surfaces)

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

## Step 4b: Mobile output (mobile-app, ios-app, web-app)

Group usable skills (available + degraded) into functional categories.
Read each skill's `description` field from the manifest and assign it to the most
appropriate category. Do **not** use hardcoded membership lists — classify purely
from descriptions so new skills are picked up automatically.
Sort categories alphabetically. Sort skills within each category alphabetically.
Format skill names as backtick code spans.
Omit any category that has zero usable skills. If a skill fits no category well,
create a new one using the same format.

| Category | Tagline | Classify here when the skill… |
|---|---|---|
| **Code Quality & Review** | Review, refactor, test, and secure your codebase | reviews, refactors, tests, or audits code quality or security |
| **Debugging & Explanation** | Diagnose failures, explain code, analyse CI logs | diagnoses errors, explains code behaviour, or analyses failures |
| **Git & CI/CD** | Commit, review PRs, release, and track changes | involves commits, PRs, changelogs, releases, or CI pipelines |
| **Planning & Tasks** | Break down, start, save, and resume work sessions | decomposes, starts, saves, resumes, or triages tasks or issues |
| **Research & Reference** | Search the web, manage context and token budget | searches the web, manages context, or surfaces reference material |
| **Skills & Configuration** | Discover, audit, and configure your AI skills layer | manages skills, configuration, sessions, or AI tooling itself |

Output format:

```
Surface: <surface_hint> (<platform_hint>)

**<Category Name>**
<Tagline>
`<skill-a>`, `<skill-b>`, `<skill-c>`

**<Category Name>**
...
```

Trailing note (omit if zero excluded):
```
> <N> skill(s) excluded on this surface — require shell or filesystem access not available on iOS.
```
