---
name: pr-description-body
description: Structures GitHub or GitLab PR descriptions for the ai-config-os repository using the canonical checklist template under shared/skills/pr-description/templates/. Use when the user asks for PR description text, PR body, merge checklist, or pre-push checklist for this repo.
---

# PR description body (ai-config-os)

When generating markdown for a pull request in this repository:

1. **Read the file first** (when possible): `shared/skills/pr-description/templates/pr-body-default.md` — match its **exact** section order, headings, checklist lines, and **CI Status** closing paragraph. Cursor project rule: `@305-pr-description-authoring` (`.cursor/rules/305-pr-description-authoring.mdc`).

2. **Fill, do not echo placeholders**: Replace stub lines (e.g. “Brief description of what this PR does.”) with real prose.

3. **Fill** Summary, Type (check one primary box), Specific Changes, and reviewer questions; mark checklist items `[x]` only for what you verified, add short `— N/A` notes where a section does not apply.

4. **Pair with** the `pr-description` and `commit-conventions` skills for title length and Conventional Commits prefixes.

Do not replace this structure with a minimal bullet-only summary unless the user explicitly opts out.
