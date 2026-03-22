---
skill: lockfile-audit
description: |
  Scans the repository for package.json files that lack a committed lockfile,
  then cross-references against deployment configs (wrangler.toml, Cloudflare
  Pages, Dockerfile, CI workflow install steps) to identify which missing
  lockfiles will break a production build. Reports severity: BLOCKING (deploy
  target uses `npm ci` / `clean-install`) vs WARNING (local-only package).
  Use when: (1) a CI/CD build fails with "npm ci requires package-lock.json"
  or similar; (2) before deploying a new subpackage or Worker; (3) after
  adding a new package.json to check it has a lockfile committed; (4) when
  suspecting a lockfile is present locally but excluded by .gitignore. Not
  useful for lockfile version conflicts — use `npm audit` for those instead.

type: prompt
status: stable

capabilities:
  required: []
  optional:
    - fs.read
    - shell.exec
  fallback_mode: prompt-only
  fallback_notes: |
    Without fs.read/shell, user can run:
      find . -name package.json | grep -v node_modules | xargs -I{} dirname {}
    and paste the directory list; the skill will then direct the review.

platforms: {}

inputs:
  - name: scope
    type: string
    description: "Root directory to scan. Defaults to repo root."
    required: false

outputs:
  - name: audit_report
    type: string
    description: Severity-ranked table (BLOCKING / WARNING) of packages missing a lockfile, with remediation commands.

dependencies:
  skills: []
  apis: []
  models:
    - sonnet

examples:
  - input: "Audit lockfiles across the repo"
    output: "BLOCKING: worker/package.json — no package-lock.json. wrangler.toml references this directory; deploy uses npm ci."
    expected_model: sonnet
  - input: "Check for missing lockfiles before deploying"
    output: "BLOCKING: worker/executor/package.json — no lockfile. WARNING: scripts/local-tool/package.json — no deploy reference found."
    expected_model: sonnet

variants:
  sonnet:
    prompt_file: prompts/balanced.md
    description: Default — thorough cross-reference with deployment configs
    cost_factor: 1.0
    latency_baseline_ms: 400
  haiku:
    prompt_file: prompts/brief.md
    description: Fast inventory — list missing lockfiles without deep deploy analysis
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - sonnet
    - haiku

tests:
  - id: detects-missing-lockfile
    type: prompt-validation
    input: "Audit lockfiles across the repo"
    expected_substring: "package-lock.json"
    models_to_test:
      - sonnet
  - id: detects-blocking-severity
    type: prompt-validation
    input: "Check for missing lockfiles before deploying"
    expected_substring: "BLOCKING"
    models_to_test:
      - sonnet

docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
  help_text: "Scan {scope} for package.json files missing a lockfile and flag which ones will block a deployment."
  keywords:
    - lockfile
    - npm
    - package-lock
    - deploy
    - ci
    - wrangler
    - audit

monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - cost
  alert_threshold_latency_ms: 5000
  public_metrics: false

version: "1.0.0"
changelog:
  "1.0.0": "Initial release — lockfile audit with deployment-severity classification"

tags:
  - ci
  - npm
  - deploy
  - audit
  - lockfile
---

# lockfile-audit

Scans the repository for `package.json` files that lack a committed lockfile, then
cross-references against deployment configs to classify severity: **BLOCKING** (a
deploy pipeline runs `npm ci` and will hard-fail without the lockfile) vs
**WARNING** (package exists but has no known deploy reference). For BLOCKING items,
offers to generate the missing lockfile without writing `node_modules`.

## When to use

- Before deploying a new subpackage (e.g. a new Worker, a new dashboard)
- When a CI/CD build fails with `npm ci can only install packages when your package.json
  and package-lock.json are in sync` or `Missing: package-lock.json`
- As a pre-push check after adding a new `package.json`
- Invoke manually with `/lockfile-audit [scope]`

Auto-invoke when user says:
- "npm ci is failing because of a missing lockfile"
- "check for missing lockfiles before we deploy"
- "why does the worker deploy fail?"

## Instructions

### Step 1 — Discover all package.json files

**If `shell.exec` is available:**
```bash
find . -name "package.json" \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  | sort
```

**If `fs.read` is available:** walk the directory tree from `scope`, listing
`package.json` files, skipping `node_modules/`.

**If neither:** ask the user to paste the output of the find command above.

---

### Step 2 — Check for lockfiles

For each `package.json` found, check whether any of these exist **in the same directory**:
- `package-lock.json` (npm)
- `yarn.lock` (Yarn)
- `pnpm-lock.yaml` (pnpm)
- `bun.lockb` (Bun)

Record packages with **no lockfile** for the next step.

---

### Step 3 — Cross-reference deployment configs

For each package missing a lockfile, search for deploy references:

**Wrangler / Cloudflare Workers:**
```bash
grep -r "package.json\|npm\|yarn\|pnpm" wrangler.toml */wrangler.toml 2>/dev/null
```
Look for `[build]` sections with `command = "npm ..."` or directory references.

**GitHub Actions workflows** (`.github/workflows/*.yml`):
- Does any step `cd` into the package directory and run `npm ci`, `npm clean-install`,
  or `yarn install --frozen-lockfile`?
- Does any step reference the package directory path?

**Dockerfile / docker-compose:**
- Does `COPY` include the package directory?
- Does `RUN` call `npm ci` inside it?

**Cloudflare Pages config** (`pages.json`, `wrangler.toml` with `[pages]`):
- Is the package's directory the build root?

---

### Step 4 — Classify severity

| Severity | Condition |
|----------|-----------|
| **BLOCKING** | A deploy config runs `npm ci`, `npm clean-install`, or `yarn install --frozen-lockfile` in this package's directory. Will hard-fail without a lockfile. |
| **WARNING** | Package exists but no deploy config references it. May be local tooling, a script, or an orphaned directory. Won't break a deploy now, but could if added later. |

---

### Step 5 — Report

#### FINDINGS

One block per package missing a lockfile:

```
Package: <relative/path/to/package.json>
  Missing:    package-lock.json (or yarn.lock / pnpm-lock.yaml)
  Severity:   BLOCKING | WARNING
  Deploy ref: <wrangler.toml line N> | <.github/workflows/deploy.yml step "Install">
  Why:        <one sentence — what fails and when>
  Fix:        cd <dir> && npm install --package-lock-only
              git add package-lock.json && git commit -m "chore: add lockfile for <dir>"
```

For WARNING items with no deploy reference:
```
  Fix:        Review whether this package needs a lockfile. If it will ever be
              deployed, generate one now: cd <dir> && npm install --package-lock-only
```

#### SUMMARY TABLE

```
| Package                    | Lockfile | Severity | Deploy ref         |
|----------------------------|----------|----------|--------------------|
| worker/package.json        | MISSING  | BLOCKING | wrangler.toml:12   |
| worker/executor/package.json | MISSING | BLOCKING | workflows/deploy.yml:34 |
| scripts/local/package.json | MISSING  | WARNING  | none               |
```

---

### Step 6 — Offer to generate BLOCKING lockfiles

For each BLOCKING item, offer:

```
Run the following to generate the lockfile without installing node_modules:
  cd <dir> && npm install --package-lock-only
  git add package-lock.json
  git commit -m "chore: add missing lockfile for <dir>"
```

`--package-lock-only` writes only the lockfile; it does not write `node_modules/` and
requires no network access for packages already in the registry.

---

## Gotchas

- **Monorepo workspaces** — if the root `package.json` uses workspaces, sub-packages
  may inherit the root lockfile. Check if the deploy step uses `--workspace` or
  references the sub-package path separately.
- **`npm install` vs `npm ci`** — only `npm ci` hard-requires a lockfile. A deploy
  using plain `npm install` will auto-generate one, but at a non-deterministic
  version. Flag these as WARNING with a note.
- **Wrangler versions** — Wrangler 3+ uses `npm ci` by default for Worker builds.
  Wrangler 2 may use `npm install`. Check `wrangler.toml`'s `[build]` command.
- **`.gitignore`** — check that `package-lock.json` is not listed in `.gitignore` for
  the package directory. If it is, the lockfile exists locally but is not committed.

## Examples

### Example 1 — Two BLOCKING missing lockfiles (the original bug)

**Input:** `Audit lockfiles across the repo`

**Output:**
```
FINDINGS

Package: worker/package.json
  Missing:    package-lock.json
  Severity:   BLOCKING
  Deploy ref: worker/wrangler.toml — [build] command = "npm ci && npm run build"
  Why:        Cloudflare Worker deploy runs `npm ci` which hard-requires a committed
              lockfile; without it the deploy fails immediately.
  Fix:        cd worker && npm install --package-lock-only
              git add package-lock.json && git commit -m "chore: add lockfile for worker"

Package: worker/executor/package.json
  Missing:    package-lock.json
  Severity:   BLOCKING
  Deploy ref: worker/executor/wrangler.toml — [build] command = "npm ci"
  Why:        Same as above — executor Worker deploy will fail without a lockfile.
  Fix:        cd worker/executor && npm install --package-lock-only
              git add package-lock.json && git commit -m "chore: add lockfile for worker/executor"

SUMMARY
| Package                        | Lockfile | Severity | Deploy ref              |
|-------------------------------|----------|----------|-------------------------|
| worker/package.json           | MISSING  | BLOCKING | worker/wrangler.toml:3  |
| worker/executor/package.json  | MISSING  | BLOCKING | executor/wrangler.toml:3|
```

### Example 2 — All lockfiles present

**Output:**
```
SUMMARY
Packages scanned: 4  |  Missing lockfiles: 0
All packages have committed lockfiles.
```
