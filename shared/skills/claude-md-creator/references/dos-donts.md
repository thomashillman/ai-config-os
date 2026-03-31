# DOs and DON'Ts for CLAUDE.md Files

## DOs

### Structure & Clarity

- **Keep it under 100 lines.** Anything longer gets skimmed. If you need more, split into
  referenced docs.
- **Lead with constraints.** Critical Constraints section comes before everything except
  overview. This is what blocks wrong approaches.
- **Be concrete, not vague.** "Use 2-space indentation" not "format code properly". "Run
  `npm test` before commit" not "test your changes".
- **Use file paths as anchors.** Instead of "see the architecture docs", write "See
  `/docs/architecture.md` for system design." Exact paths are clickable and verifiable.
- **Order by frequency of use.** What does every developer touch first? Put that first.
  Landmines come last.
- **Link, don't duplicate.** Reference `/docs/`, `/config/`, runbooks. Let Claude fetch
  when needed instead of loading everything upfront.
- **Use code blocks for commands.** `bash` or `sh` blocks make them copyable and visible.
- **Document the why, not just the what.** "We use Postgres because X relies on JSONB and
  we benchmarked it vs Y" helps Claude make better decisions than "Use Postgres".

### Hierarchy & Modular Structure

- **Three-tier hierarchy works:** Personal (~/.claude/CLAUDE.md) > Project (./CLAUDE.md) >
  Subdirectory (./\*\*/CLAUDE.md).
- **Personal file covers your work style:** Verbosity preference, thinking style, code
  personality, response format, tool preferences.
- **Project file covers constraints:** Tech stack, testing, deployment, critical patterns,
  project-specific gotchas.
- **Subdirectory file covers service-level rules** (monorepo): This service's testing,
  deployment, integration points, local landmines.
- **Each level inherits upward.** Subdirectory rules are in addition to project rules,
  which are in addition to personal rules.
- **Use imports or references to modular docs.** If you have 10 rules, create
  `.claude/rules/` with one file per rule category, reference them in CLAUDE.md with
  one-line descriptions.

### Content Selection

- **Include things Claude won't already know:**
  - Project-specific patterns (weird legacy constraint, non-standard deployment process)
  - Gotchas unique to your codebase (this test is slow, this module is fragile)
  - File paths and configuration locations specific to your setup
  - Deprecated patterns or forbidden approaches
  - Team decisions not in the codebase (why you chose Postgres over MySQL)

- **Exclude things Claude can infer:**
  - How to use your tech stack (Claude knows React, Django, Kubernetes)
  - Common best practices (test before committing, use semantic versioning)
  - Standard library or framework documentation
  - Information already visible in README, package.json, or config files

### Maintenance

- **Review quarterly or after major changes.**
- **Run staleness checks.** If a rule references a pattern or file no longer in the
  codebase, delete it. Ghost rules confuse.
- **Capture learnings from good sessions.** When you solve a hard problem, ask: "Should
  this be in CLAUDE.md?"
- **Version CLAUDE.md like code.** Commit it. Review changes. Don't let it drift.

---

## DON'Ts

### Structure & Clarity

- **Don't make it a manual.** CLAUDE.md is a constraint file and navigation layer, not a
  replacement for real documentation. If you're writing paragraphs of explanation, move it
  to `/docs/`.
- **Don't duplicate README.** If README says "run `npm install`", don't repeat it in
  CLAUDE.md. Reference it or assume Claude reads it.
- **Don't use vague language.** "Keep things organized" tells Claude nothing. "Store API
  handlers in `src/api/handlers/`, middleware in `src/middleware/`" tells Claude exactly
  where to put files.
- **Don't hide critical constraints.** If something will break the build or cause a
  security issue, put it in Critical Constraints, not buried in Common Workflows.
- **Don't use em-dashes or en-dashes.** Use commas, colons, semicolons, or parentheses.
- **Don't write dense paragraphs.** Use bullets, headers, and whitespace.
- **Don't reference files without paths.** "See the auth module" is useless. "See
  `src/auth/` or `/docs/auth.md`" is actionable.

### Content Selection

- **Don't include personal preferences in shared CLAUDE.md.** It's checked in, it's for
  the team. Personal stuff goes in ~/.claude/CLAUDE.md.
- **Don't document things Claude should infer from the codebase.** "Use async/await" is
  obvious in a modern Node.js project.
- **Don't create rules without examples.** "Write tests" is useless. "Write unit tests for
  business logic; integration tests for external APIs. Target 80% coverage."
- **Don't overspecify coding style if you have a linter.** Point to the linter instead.
- **Don't include aspirational constraints.** "We want to be microservices someday" is not
  a constraint. "We are monolithic but split by feature boundary" is.
- **Don't add "nice to have" sections.** Every section should be something Claude needs
  to know or will forget. If it's nice to know, it goes in `/docs/` with a reference.

### Hierarchy & Modular Structure

- **Don't create too many levels.** Personal > Project > Subdirectory is enough.
- **Don't orphan CLAUDE.md files.** If you create `.claude/rules/fancy-new-rule.md`,
  reference it in the parent CLAUDE.md.
- **Don't reference files in deleted directories.** Stale paths are worse than no reference.
- **Don't nest CLAUDE.md imports too deep.** Max 2 levels of imports.

### Maintenance

- **Don't let CLAUDE.md drift from reality.** A rule that no longer applies is active
  misinformation. Delete it.
- **Don't add rules without removing old ones.** For every rule added, scan for something
  to remove or consolidate.
- **Don't bloat it over time.** If CLAUDE.md grows past 150 lines, refactor it into
  `/docs/` + references.
- **Don't make it a changelog.** "We used to do X but now we do Y" is historical, not
  actionable. Just say "Do Y".

### For Specialized Scenarios

- **Don't use CLAUDE.md for secrets or keys.** It's checked in.
- **Don't add constraints that only apply in one branch.** Use a feature branch CLAUDE.md
  or `.claude/rules/` file with a date. Delete it after the branch merges.
- **Don't create CLAUDE.md for every micro-package in a monorepo.** Only create one if
  the package has specific constraints. Otherwise, inherit from project-level.

---

## Quick Checklist Before Committing CLAUDE.md

- [ ] Is every file path a clickable absolute path or relative to project root?
- [ ] Can a new developer run the "Before You Code" checklist in 2 minutes?
- [ ] Is there a "Known Landmines" section with at least one real footgun?
- [ ] Does it fit on one screen (under 100 lines)? If not, what can move to `/docs/`?
- [ ] Are all constraints stated as "do X" or "don't do Y", not "try to" or "consider"?
- [ ] Is there at least one specific command under Build/Test that someone can copy and run?
- [ ] Would a new team member understand why each constraint exists?
- [ ] Are there any rules that reference patterns or files no longer in the codebase?

---

## Examples of Strong vs Weak CLAUDE.md Sections

### Testing

**Weak:**

```
## Testing
Test your changes regularly. Use the test framework.
```

**Strong:**

```
## Before You Code
- Run tests: `npm test` -- must pass before commit
- Coverage threshold: 80% for business logic; type definitions and fixtures excluded
- Integration tests live in `tests/integration/` and require a real database; run
  separately with `npm run test:integration` (slow, ~2m)
- Before pushing: run `npm run test:unit` (fast, covers 90% of issues)
```

### API Conventions

**Weak:**

```
## API Conventions
Endpoints should return JSON. Use REST principles.
```

**Strong:**

```
## API Conventions
- Responses: `{ data: {...}, meta: { timestamp, version } }`
- Errors: `{ error: { code, message, path } }` with HTTP status matching semantics
- Pagination: `?page=1&limit=20` (default 20, max 100); response includes
  `meta: { total, page, hasMore }`
- Versioning: path-based (`/api/v1/users`). Breaking changes require major version bump.
- See `/docs/api.md` for full schema.
```

### Known Landmines

**Weak:**

```
## Known Landmines
- The auth system is old
- Tests can be flaky
```

**Strong:**

```
## Known Landmines
- `src/auth/legacy.js` handles both session and token auth due to a migration that
  never finished. Do not refactor without consulting the team; it's load-bearing.
- Integration tests that hit the real database can fail if run in parallel. Always
  run `npm run test:integration -- --runInBand`.
- The `scripts/deploy.sh` has a 30-second timeout; if you add heavy initialization,
  deployments will fail silently. Test locally with `./scripts/deploy.sh --dry-run`.
- Windows path handling: use `path.join()` everywhere, never string concatenation.
```

---

## When to Create a New CLAUDE.md vs When to Update Existing

**Create a new one if:**

- You're starting a new project or service in a monorepo
- A subdirectory has constraints that differ from the project level
- A team has documented decisions specific to their area

**Update the existing one if:**

- The constraint already applies at project level
- It's a minor clarification
- It's a new pattern the whole team should know

**Delete it if:**

- All constraints apply equally at project level and subdirectory adds nothing new
- The subdirectory will inherit everything from above and has no special rules
