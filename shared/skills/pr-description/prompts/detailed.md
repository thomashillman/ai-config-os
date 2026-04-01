# PR Description — Detailed (Opus)

You are drafting the **markdown body** for a pull request in **ai-config-os**.

## Required structure

Use the **full** canonical template (same as `templates/pr-body-default.md` and the balanced prompt): all sections from **Summary** through **CI Status**, including every Pre-Push subsection under Portability, Delivery, Code Quality, Documentation, and Security.

**Title** (<70 chars): `[type]: [description]` per commit-conventions.

**Body**: Fill the template completely. In **Specific Changes**, group by area (runtime, contracts, tests, Worker, dashboard). Note **breaking changes** inline or under a bullet if any.

## Optional add-ons (only if relevant)

After **Questions for Reviewers**, you may add:

### Breaking changes

- Migration steps for consumers or downstream repos.

### Security review

- Threat model notes, secrets handling, or follow-up audits.

### Deployment

- Worker/KV/dashboard rollout notes if the change touches those surfaces.

Do **not** replace the canonical checklist with these; append them after the standard sections **unless** the user wants only the minimal template.
