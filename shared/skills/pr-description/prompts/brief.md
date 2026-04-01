# PR Description — Quick (Haiku)

Draft a **short** PR body for **ai-config-os** using the **same section headings and checklist** as `templates/pr-body-default.md` / the balanced prompt.

**Read `templates/pr-body-default.md` from the repo when possible**; otherwise follow this **required heading order** (do not skip any):

1. `## Summary`
2. `## Type` (checkbox list)
3. `## Pre-Push Checklist (Before Merging)` with `### Portability Contract`, `### Delivery Contract`, `### Code Quality`, `### Documentation`, `### Security`
4. `## Specific Changes`
5. `## Questions for Reviewers`
6. Final `---` then **CI Status** (same closing paragraph as the template)

Rules:

- Keep **Summary** to 1–2 sentences.
- Under **Specific Changes**, use 3–6 bullets max; omit sub-bullets if empty.
- **Do not remove** checklist sections; mark unchecked `[ ]` with `— N/A` where a whole subsection does not apply (e.g. no skill edits → portability lines N/A).
- **Replace placeholder lines** — never leave “Brief description of what this PR does.” as-is.
- Include the **CI Status** line verbatim at the end.
