---
skill: claude-md-creator
description: |
  Create, audit, and improve CLAUDE.md files and their referenced documentation.
  Use when the user wants to establish or refine CLAUDE.md constraints, write supporting
  docs in /docs/ or .claude/, troubleshoot a weak CLAUDE.md, migrate constraints to a new
  project, or build a multi-file constraint system. Trigger proactively when a user mentions
  starting a project, restructuring documentation, or asks how to document technical
  constraints for AI tooling.
type: prompt
status: stable

capabilities:
  required: [fs.read, fs.write]
  optional: []
  fallback_mode: prompt-only
  fallback_notes: Can operate from pasted file contents when local tools are unavailable.

platforms: {}

inputs:
  - name: mode
    type: string
    description: "create | audit | migrate | modularize"
    required: false
  - name: target_path
    type: string
    description: Path to existing CLAUDE.md (for audit/improve mode)
    required: false

outputs:
  - name: claude_md
    type: string
    description: The created or improved CLAUDE.md content
  - name: audit_report
    type: string
    description: Audit findings and recommendations (audit mode only)

dependencies:
  skills: []
  apis: []
  models:
    - sonnet

examples:
  - input: "Create a CLAUDE.md for my Node.js API project"
    output: "A complete CLAUDE.md with critical constraints, code standards, known landmines"
    expected_model: sonnet
  - input: "Audit my existing CLAUDE.md"
    output: "Audit report with strengths, gaps, and prioritised recommendations"
    expected_model: sonnet

tests:
  - id: test-create
    type: prompt-validation
    input: "Create a CLAUDE.md for a Django REST API"
    expected_substring: "Critical Constraints"
    expected_not_null: true
    models_to_test:
      - sonnet
  - id: test-audit
    type: prompt-validation
    input: "Audit this CLAUDE.md: ## Testing\nTest your changes."
    expected_substring: "Weak"
    expected_not_null: true
    models_to_test:
      - sonnet

docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
  help_text: "Ask me to create or audit a CLAUDE.md for your project."
  keywords:
    - claude-md
    - documentation
    - constraints
    - ai-config

monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
  alert_threshold_latency_ms: 5000
  public_metrics: false

version: "1.0.0"
changelog:
  "1.0.0": "Initial release"

tags:
  - documentation
  - setup
  - constraints
---

# claude-md-creator

Create, audit, and improve CLAUDE.md files. CLAUDE.md is a constraint and navigation file
for Claude (and humans) working in a codebase -- a machine-readable contract specifying what
Claude should and shouldn't do, where things live, and what will break the build.

Reference docs for this skill:

- `references/audit-checklist.md` -- full audit checklist
- `references/template.md` -- CLAUDE.md template
- `references/dos-donts.md` -- DOs and DON'Ts reference

## When to use

- User wants to create a CLAUDE.md from scratch for a new or existing project
- User wants to audit or improve an existing CLAUDE.md
- User wants to modularize a large CLAUDE.md into `.claude/rules/` or `/docs/`
- User mentions starting a project, restructuring docs, or documenting constraints for AI tooling
- User asks how to document technical constraints

## Instructions

### Core principles

**Constraints, not documentation.** CLAUDE.md specifies what blocks wrong approaches and what
Claude needs to infer. It does not replace README, API docs, or architecture guides -- it
references them.

**Concrete over vague.** "Use 2-space indentation" beats "format code properly". File paths
are absolute. Commands are copyable code blocks.

**Organized by frequency.** What does every developer touch first? Put that first. Landmines
come last.

**Maintained like code.** Commit it. Review changes. Delete staleness quarterly.

---

### Step 1: Intake Interview (2 minutes max)

Ask only what is essential. Do not explore beyond answers to these four questions:

1. **Are you creating from scratch or improving an existing CLAUDE.md?**
   - Scratch: jump to Step 2 (narrow interview).
   - Existing: jump to Step 3 (audit).

2. **If creating: What is the project?** (One sentence: "Node.js API", "Django monolith", "Rust library")

3. **Are you setting this up for yourself, a team, or both?**
   - Personal, Project, or Multi-tier? That determines output structure.

4. **What is the biggest footgun in this codebase right now?** (This becomes your first Known Landmine.)

Stop. Do not ask for detailed architecture or workflow explanations yet. Move to the next step.

---

### Step 2: Interview (5 minutes, targeted questions only)

Do not ask all of these. Ask only what is missing from codebase signals (README, package.json,
existing docs).

**Check these first (read, do not ask):**
- Does README describe the project? If yes, skip explanation questions.
- Does package.json or similar show the tech stack? If yes, skip stack questions.
- Are there existing test commands? If yes, skip testing questions.

**Ask only these gaps:**

If tech stack is unclear:
- Language(s) and primary framework?
- Test framework? How do you run tests?

If constraints are unclear:
- What breaks the build? (Non-negotiable constraint)
- Is there a deprecated pattern or forbidden approach?

If workflows are unclear:
- Who deploys and how? (One sentence.)
- Is there a release process? (Versioning scheme, if any)

Do not ask philosophy questions, hypotheticals, or "tell me about" -- only "what is the actual X".
Stop early. Fill gaps from README/code later if needed.

---

### Step 3: Audit (if improving existing CLAUDE.md)

Read the existing CLAUDE.md first. Do not ask the user questions yet.

**First pass (max 3 minutes):**
1. Read the entire file.
2. Identify ONE critical gap or ONE instance of vague language.
3. Check for stale references (files/patterns that no longer exist in codebase).

**Do not:**
- Rewrite the whole file
- Ask for missing sections you have not identified in the file yet
- Suggest modularization unless it is already >150 lines

**Report to user:**
- One strength (what is working)
- One gap or weakness (what is blocking clarity)
- One recommendation (highest-impact fix)

Ask: "Should I proceed with this revision?" before continuing.

If the user confirms, move to Step 4 (draft or revise). If not, ask for clarification on scope.

Use `references/audit-checklist.md` for the full checklist to evaluate each section.

---

### Step 4: Draft or Revise (minimal scope)

**If creating from scratch:** Fill the template (`references/template.md`) with answers from the
interview. Do not add sections not explicitly needed.

**If revising:** Make only the one improvement identified in the audit. Do not rewrite multiple
sections.

**Review your output against these only:**
- [ ] Every file path is absolute or project-root-relative?
- [ ] Is there at least one copyable command (test, build, deploy)?
- [ ] Are there any em-dashes or en-dashes? (Replace if found.)
- [ ] Does it fit under 100 lines? (If not, what is the one section to extract?)

Stop. Do not optimise beyond this. Present to user.

---

### Step 5: Validation (1 minute checklist)

Before presenting to user:

- [ ] Every file path is absolute or project-root-relative?
- [ ] At least one copyable command (test, build, deploy)?
- [ ] No em-dashes or en-dashes?
- [ ] Fits under 100 lines, or is extraction plan clear?

If all pass, present. If not, fix the one blocking issue and re-check.

---

### Workflow: Migrate an existing codebase to CLAUDE.md

If the user has an existing codebase with scattered documentation, consolidate:

1. Read README, package.json, and any /docs/ folder
2. Extract constraints (what blocks wrong approaches?)
3. Identify footguns (slow tests, fragile modules, non-standard patterns)
4. Map file structure (use exact paths)
5. Fill the template
6. Present to user for approval

---

### Operating principles: Minimal context, maximum focus

**Default posture:**
- Minimal context first. Do not assume extra guidance is needed.
- Prioritise direct signals. Use code, tests, and existing CLAUDE.md content.
- Act before exploring. Start with the existing CLAUDE.md, README, or package.json first.

**Search and investigation:**
- Strict file read limits: start with max 3 file reads. Expand only if blocked.
- Targeted search: use function names, error strings, or specific constraint keywords.
- Expand incrementally: if the first attempt fails, add one more file read.

**Editing and iteration:**
- Minimal edits: modify the fewest files necessary.
- Avoid refactoring: unless required to fix a critical constraint.
- One meaningful change per iteration.

**Stopping discipline:**
- Stop if no progress after 2-3 iterations.
- Prefer partial insight over exhaustive search.
- Solve the task with the least exploration, least code change, and least tool use necessary.

**Cost guardrails:**
- Max file reads per task: 10
- Max edit attempts: 3

See `references/dos-donts.md` for the full DOs and DON'Ts reference.

## Examples

### Example 1: Create from scratch

**Input:** "Create a CLAUDE.md for my Node.js REST API. Biggest footgun: the auth middleware
caches tokens and doesn't invalidate on logout."

**Output:** A complete CLAUDE.md using the template, with the auth footgun as the first Known
Landmine entry.

### Example 2: Audit

**Input:** "Audit my CLAUDE.md" (followed by the file content)

**Output:**
```
### Strengths
- Critical Constraints section is specific and actionable

### Gaps
- Known Landmines is vague: "auth system is old" gives no actionable detail
- No copyable test command

### Recommendations
1. Rewrite Known Landmines entry with file path and specific constraint
2. Add "Run tests: `npm test`" under Before You Code
```

### Example 3: Modularize

**Input:** "My CLAUDE.md is 200 lines. Help me split it."

**Output:** Extraction plan: which sections move to `.claude/rules/`, which stay in CLAUDE.md,
and how to reference them.
