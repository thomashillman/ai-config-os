---
skill: "merge-conflict-resolution"
description:
  "Resolves git merge or rebase conflicts, verifies the merge is fully concluded (including the easy-to-miss `git commit` step), and reviews bulk one-side resolutions against upstream.

  Use when merging or rebasing hits conflicts, `git status` still reports a merge in progress, or after resolving many files with `git checkout --ours`/`--theirs`.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "target_branch"
    type: "string"
    description: "Upstream branch being merged or rebased onto (e.g. origin/main); optional if inferrable from context"
    required: false
  - name: "resolution_strategy"
    type: "string"
    description: "How conflicts were resolved: per-hunk, ours-bulk, theirs-bulk, or mixed"
    required: false
outputs:
  - name: "resolution_summary"
    type: "string"
    description: "Files touched, merge conclusion status, and any upstream deltas flagged for review"
dependencies:
  skills: []
  apis: []
  models:
    - "sonnet"
    - "haiku"
examples:
  - input: "Fix merge conflicts after merging origin/main; I used checkout --ours on most files"
    output: "Conflicts cleared; merge commit created; diff vs origin/main on touched paths shows X — flag for review"
    expected_model: "sonnet"
  - input: "git status says all conflicts fixed but I still see MERGE_HEAD"
    output: "Working tree can be clean while merge is unfinished — run git commit to conclude the merge"
    expected_model: "haiku"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Deep walkthrough: conflict triage, merge conclusion, and upstream diff interpretation"
    cost_factor: 3
    latency_baseline_ms: 900
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Default; resolves conflicts, enforces conclude-merge checklist, suggests targeted diff review"
    cost_factor: 1
    latency_baseline_ms: 350
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Minimal checklist: markers gone, merge committed, one diff command for bulk resolutions"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "opus"
    - "haiku"
tests:
  - id: "test-merge-head-commit"
    type: "prompt-validation"
    input: "MERGE_HEAD exists, git diff is empty — is the merge done?"
    expected_substring: "commit"
    models_to_test:
      - "haiku"
  - id: "test-bulk-ours-review"
    type: "prompt-validation"
    input: "Resolved 20 files with git checkout --ours — anything else?"
    expected_substring: "diff"
    models_to_test:
      - "sonnet"
  - id: "test-still-merging"
    type: "prompt-validation"
    input: "Conflicts are fixed but git says still merging"
    expected_substring: "commit"
    models_to_test:
      - "sonnet"
composition: {}
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "examples"
  help_text: "Resolve merge conflicts, conclude the merge, and review bulk one-side resolutions against upstream."
  keywords:
    - "merge"
    - "conflict"
    - "rebase"
    - "MERGE_HEAD"
    - "git"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "token_count"
    - "cost"
    - "variant_selected"
  alert_threshold_latency_ms: 5000
  public_metrics: false
version: "1.0.0"
changelog:
  "1.0.0": "Initial release: conflict resolution, conclude-merge checklist, post-resolution upstream review"
tags:
  - "git"
  - "merge"
  - "workflow"
capabilities:
  required: []
  optional:
    - "git.read"
    - "git.write"
    - "shell.exec"
    - "fs.read"
  fallback_mode: "prompt-only"
  fallback_notes: "Can guide from pasted git status and file snippets without local git."
---

# merge-conflict-resolution

End-to-end workflow for merge and rebase conflicts: fix content, **finish the merge**, and spot dropped upstream changes after wholesale side picks.

## Relationship to other skills

- **`git-ops`**: Version bumps and rebase/version safety — does **not** replace this skill for conflict content or merge completion.
- **`post-merge-retrospective`**: Run **after** a PR merge to capture session friction; use this skill **during** conflict resolution.

## When to use

- `git merge`, `git pull`, or `git rebase` stops with conflicts
- Status shows unmerged paths or “You are still merging”
- After **`git checkout --ours`** / **`--theirs`** on many paths (or scripted mass resolution)
- Clean `git diff` but **`.git/MERGE_HEAD` still exists** — merge not recorded

## Instructions

### 1. Locate and clear conflicts

1. List conflicted paths: `git status` and/or `git diff --name-only --diff-filter=U`
2. Resolve each file; **remove all conflict markers** (begin / separator / end lines — the three markers Git inserts; do not leave them in the tree)
3. Prefer regenerating lockfiles with the package manager over hand-editing
4. Stage resolved files: `git add` per file or as appropriate

### 2. Conclude the merge (mandatory)

Git can report “all conflicts fixed” while the merge is **still open**:

1. If **`.git/MERGE_HEAD` exists**, the merge is **not** finished until recorded:
   - `git status` — confirm unmerged count is zero and conflicts are resolved
   - If the working tree matches the intended result, create the merge commit:  
     `git commit` (or `git merge --continue` when rebasing)
2. **Do not assume** “no diff” means done: an empty `git diff` and empty `git diff --cached` can occur when the resolved tree matches `HEAD`, but **`MERGE_HEAD` still requires a commit** to close the merge.

### 3. After bulk `--ours` / `--theirs`

If many files were resolved by taking one branch wholesale:

1. Record the list of touched paths (from conflict list or `git diff --name-only` against the pre-merge state)
2. Compare against upstream for substantive gaps, e.g.  
   `git fetch` then inspect differences from merge-base:  
   `BASE=$(git merge-base HEAD origin/main)`  
   `git diff "$BASE"..origin/main -- <paths>`
3. Call out any **upstream-only** changes in those paths that are **not** present in the current tree for human review

### 4. Verify

Run the repo’s checks (for **ai-config-os**, typically `npm run validate`, `npm test`, and any surface-specific scripts from `AGENTS.md` / `CLAUDE.md`).

### Guardrails

- Keep edits minimal; no drive-by refactors while resolving conflicts
- Do not push or tag unless the user asks
- Do not leave conflict markers in the tree

## Examples

### Example 1 — Merge stuck after resolution

**Situation:** `git status`: “All conflicts fixed but you are still merging.” `git diff` is empty.

**Action:** Run `git commit` to record the merge (subject/body as appropriate). Confirm `.git/MERGE_HEAD` is gone afterward.

### Example 2 — Mass `--ours`

**Situation:** Conflicts resolved with `git checkout --ours` on a large set of paths to preserve a feature branch.

**Action:** After concluding the merge, run a targeted `git diff` from merge-base to `origin/main` on those paths; list commits or hunks on `main` that never landed in the feature branch for optional cherry-pick or follow-up PR.
