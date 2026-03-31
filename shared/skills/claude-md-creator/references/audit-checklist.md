# CLAUDE.md Audit Checklist

Use this checklist to evaluate an existing CLAUDE.md file. Mark each item and flag issues
for revision.

## Structure & Length

- [ ] Is the file under 100 lines?
  - If NO: Identify which sections can move to `/docs/` and mark for extraction
  - Candidate sections: detailed API specs, architecture explanations, lengthy examples

- [ ] Does it start with an overview sentence?
  - If NO: Add "## Project Overview" at the top with one-sentence summary

- [ ] Does it lead with Critical Constraints (before code standards)?
  - If NO: Reorder so constraints come early; this is what blocks wrong approaches

- [ ] Is there a "Before You Code" section with runnable steps?
  - If NO: Add specific commands (test runs, prerequisite checks, dependency setup)

## Content Quality

- [ ] Is every constraint stated as a "do" or "don't", not "try to" or "consider"?
  - Weak: "Try to use async/await"
  - Strong: "Use async/await everywhere except hot loops (benchmark first)"

- [ ] Does every file path include absolute paths or project-root-relative paths?
  - Weak: "See the auth module"
  - Strong: "See `src/auth/` or `/docs/auth.md`"

- [ ] Are all commands in copyable code blocks (with bash/sh language tags)?
  - Count: How many commands are there? Should be at least 1-2 (test, build, or deploy)

- [ ] Does every rule have at least one concrete example?
  - Weak: "Write tests"
  - Strong: "Write unit tests for business logic; integration tests for external APIs. Run: `npm test`"

- [ ] Is there a "Known Landmines" section?
  - If NO: Add it; identify footguns from git history, recent bugs, slow tests, fragile modules

- [ ] Does the "Known Landmines" section include real footguns with specifics?
  - Weak: "Auth system is old"
  - Strong: "`src/auth/legacy.js` handles both session and token auth; do not refactor without team approval. It's load-bearing."

## Language & Clarity

- [ ] Are there any em-dashes or en-dashes?
  - If YES: Replace with commas, colons, semicolons, or parentheses

- [ ] Is any language vague?
  - Examples to flag: "format properly", "keep organized", "as needed", "when possible"
  - Action: Rewrite with concrete specifics or examples

- [ ] Are there dense paragraphs (5+ lines)?
  - Action: Break into bullets or shorter chunks; add whitespace

- [ ] Are all relative references clickable paths?
  - Example to avoid: "See the style guide" -- "See `/docs/style.md` or `.eslintrc.json`"

## Content Gaps (Interview-Based)

For each of these, check if CLAUDE.md covers it. If not, note it as a gap:

**Architecture & Constraints:**

- [ ] Major architectural decisions documented? (Monolith vs. microservices, database choice, etc.)
- [ ] Non-negotiable technical boundaries stated? (What will break the build? What's forbidden?)
- [ ] Deprecated patterns called out?
- [ ] Critical integrations or dependencies explained?

**Code & Testing:**

- [ ] Test framework and command documented?
- [ ] Coverage target specified?
- [ ] Linter/formatter linked or described?
- [ ] Commit format documented (Conventional Commits)?

**Workflows:**

- [ ] Deployment process and ownership clear?
- [ ] Code review expectations stated?
- [ ] Release process (versioning, tagging, changelog) documented?
- [ ] Configuration location specified? (.env, config files, etc.)

**Known Issues:**

- [ ] Slow tests or fragile modules flagged?
- [ ] Common mistakes documented?
- [ ] Silent failure modes explained?
- [ ] Platform-specific gotchas (Windows, macOS, Linux)?

## Staleness Check

- [ ] Do all referenced files still exist in the codebase?
  - If any are missing: Delete or update those rules

- [ ] Do referenced patterns match current code?
  - If drift detected: Sync CLAUDE.md to reality, not the reverse

- [ ] Have there been major commits since CLAUDE.md was last updated?
  - If >3 months old: Review for staleness

## Modularization Check (if large)

If CLAUDE.md approaches or exceeds 150 lines:

- [ ] Are there >15 rules total?
  - If YES: Consider splitting into `.claude/rules/` with one file per rule category

- [ ] Is there service-specific guidance for a monorepo?
  - If YES: Extract to `./<service>/CLAUDE.md` or `.claude/rules/<service>.md`

- [ ] Is there detailed API or architecture documentation?
  - If YES: Extract to `/docs/api.md`, `/docs/architecture.md`, or similar

## Final Checklist

Before signing off on the audit:

- [ ] All weak sections identified and flagged for revision
- [ ] All stale references removed or updated
- [ ] All gaps noted and ready for user review
- [ ] Reordering plan clear (if needed)
- [ ] Modularization plan clear (if needed)

---

## Audit Report Template

Share findings with the user in this format:

### Strengths

- [What's working well]
- [What's clear and specific]

### Gaps

- [Missing constraints or commands]
- [Vague language or missing examples]
- [Stale references]

### Recommendations (Priority Order)

1. [High impact: e.g., "Add Known Landmines section with 2-3 real footguns"]
2. [Medium impact: e.g., "Rewrite API Conventions with concrete example responses"]
3. [Low impact: e.g., "Replace em-dashes with parentheses"]

### Revised Sections

[Show user the updated CLAUDE.md with all changes highlighted]
