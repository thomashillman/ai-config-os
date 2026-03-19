# agnostic-labs-skill-creator — Opus Variant (Detailed)

You are creating a new skill for the ai-config-os repository. This is the detailed variant — provide thorough guidance, handle edge cases, and explain rationale for every decision.

## Full Skill Creation Protocol

### Pre-flight checks

1. **Validate the skill name** against the kebab-case pattern `^[a-z][a-z0-9-]*$`. If the user provides a name like `MySkill` or `my_skill`, suggest the corrected form (`my-skill`) and confirm before proceeding.

2. **Check for naming conflicts** — scan `shared/skills/` to ensure no directory with the same name exists. If a conflict is found, inform the user and suggest alternatives.

3. **Determine the skill type** from the user's description:
   - `prompt` — provides instructions/guidance to Claude (most common)
   - `hook` — executes at specific lifecycle events (SessionStart, PreToolUse, etc.)
   - `agent` — runs as an isolated subagent with its own context
   - `workflow-blueprint` — orchestrates multiple skills in sequence

### Invocation control analysis

Determine who should be able to invoke this skill:

| Scenario | Frontmatter | Rationale |
|----------|-------------|-----------|
| General-purpose tool | (default — both) | Claude and user can both trigger |
| Deploys, commits, destructive ops | `disable-model-invocation: true` | Prevents accidental side effects |
| Background conventions/knowledge | `user-invocable: false` | Always in context but not a command |
| Sensitive operations | `disable-model-invocation: true` | User must explicitly invoke |

**Context loading behavior:**
- Default: description always in context; full skill loads when invoked
- `disable-model-invocation: true`: description NOT in context; loads only on user `/skill-name`
- `user-invocable: false`: description always in context; Claude invokes when relevant

### Subagent execution analysis

Determine if the skill should run in an isolated subagent (`context: fork`):

**Use subagent when:**
- Skill performs broad research that would consume main context tokens
- Skill has explicit task instructions with a clear deliverable
- Skill's output is a self-contained summary (doesn't need conversation history)

**Do NOT use subagent when:**
- Skill provides guidelines or conventions (needs conversation context to apply them)
- Skill needs access to ongoing conversation
- Skill modifies files that depend on what was discussed

**Agent type selection:**
| Agent | Best for | Context size |
|-------|----------|-------------|
| `Explore` | Codebase search, file discovery, reading code | Optimized for fast search |
| `Plan` | Architecture planning, implementation strategy | Full tool access minus writes |
| `general-purpose` | Multi-step tasks with full tool access | Default, largest context |
| Custom (`.claude/agents/<name>.md`) | Domain-specific agents | Custom |

### Dynamic context injection

If the skill needs real-time data, use the `` !`command` `` syntax. Commands run in the user's shell before the prompt is sent to Claude.

**Common patterns:**
```markdown
## Current state
- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Recent commits: !`git log --oneline -5`
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Package version: !`node -p "require('./package.json').version"`
- Environment: !`echo $NODE_ENV`
```

**Important considerations:**
- Commands execute with user's shell permissions
- Command failures produce empty output (not errors)
- Keep commands fast — they block skill loading
- Use `context: fork` with dynamic context to prevent stale data in long conversations

### Tool restriction analysis

Determine if the skill should limit available tools:

| Skill purpose | Suggested `allowed-tools` |
|---------------|--------------------------|
| Read-only analysis | `Read, Grep, Glob` |
| Code review (no edits) | `Read, Grep, Glob, Bash` |
| Web research only | `WebSearch, WebFetch` |
| File modifications | `Read, Grep, Glob, Edit, Write` |
| Unrestricted | (omit field — all tools available) |

### Hook configuration (for hook-type skills)

If creating a hook skill, determine:

1. **Hook type**: `command` (shell), `http` (webhook), `prompt` (LLM decision), `agent` (multi-turn)
2. **Event**: Which lifecycle event triggers it
3. **Matcher**: Filter pattern (tool name, notification type, etc.)
4. **Communication**: How the hook signals proceed/block

**Hook event reference:**
| Event | Matcher | Use case |
|-------|---------|----------|
| `SessionStart` | `startup`/`resume`/`compact` | Environment setup, context injection |
| `PreToolUse` | Tool name (e.g., `Edit\|Write`) | Validation, blocking, safety gates |
| `PostToolUse` | Tool name | Auto-formatting, logging, notifications |
| `PermissionRequest` | Tool name | Custom permission logic |
| `Stop` | — | Post-response cleanup, summarization |

**Exit code protocol:**
- Exit 0: Action proceeds; stdout is added to context
- Exit 2: Action blocked; stderr message sent to Claude as feedback

### Argument substitution

If the skill accepts user arguments, use these variables in the body:

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments as a single string |
| `$ARGUMENTS[0]`, `$0` | First argument |
| `$ARGUMENTS[1]`, `$1` | Second argument |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_SKILL_DIR}` | Skill directory path |

Set `argument-hint` in frontmatter for autocomplete:
```yaml
argument-hint: "[file-path] [--format json|markdown]"
```

If `$ARGUMENTS` is absent from skill content, arguments are auto-appended as `ARGUMENTS: <value>`.

### MCP prompt integration

If the skill interacts with MCP servers, document which MCP prompts are relevant. MCP prompts appear as `/mcp__<server>__<prompt>` commands. The skill can reference these or compose with them.

### Capability analysis

Carefully consider which capabilities the skill truly needs:

| Capability | When to require | When to make optional |
|------------|----------------|----------------------|
| `fs.read` | Skill reads files as core function | Skill can work from pasted content |
| `fs.write` | Skill creates/modifies files | Output can be shown to user instead |
| `shell.exec` | Skill runs commands | Commands can be shown for manual execution |
| `git.read` | Skill needs git history/status | User can paste git output |
| `git.write` | Skill commits/pushes | User can run git commands manually |
| `network.http` | Skill fetches from URLs | User can paste fetched content |
| `mcp.client` | Skill uses MCP tools | Can fall back to manual steps |

**Fallback mode decision tree:**
- If skill works entirely from text input/output → `prompt-only`
- If skill can provide manual steps instead of executing → `manual`
- If skill is useless without its required capabilities → `none`

### SKILL.md generation

Generate the complete SKILL.md with:

1. **Full Phase 2 frontmatter** — every applicable field populated with thoughtful defaults
2. **Claude Code extensions** — invocation control, subagent config, tool restrictions as needed
3. **Capability contract section** — explain what the skill needs and why
4. **When to use section** — 3-5 bullet points describing trigger conditions
5. **Instructions section** — step-by-step instructions Claude should follow, with code blocks
6. **Examples section** — at least 2 concrete input/output examples

### Post-creation validation

After creating the skill:

1. Run `node scripts/lint/skill.mjs shared/skills/<name>/SKILL.md` to validate schema compliance
2. Run `node scripts/build/compile.mjs --validate-only` to check the full build pipeline
3. Verify the manifest entry in `shared/manifest.md` is correctly formatted
4. Confirm all variant prompt files referenced in frontmatter exist
5. Test invocation control by checking the description appears (or doesn't) in context
6. If using dynamic context, verify commands produce expected output

### Common mistakes to avoid

- **Over-requiring capabilities**: Don't mark `fs.read` as required if the skill can work from pasted input
- **Missing fallback_mode**: Schema requires this when `capabilities.required` is non-empty
- **Forgetting manifest update**: Every new skill needs a row in `shared/manifest.md`
- **Using `context: fork` for guidelines**: Guideline skills need conversation context — don't fork them
- **Forgetting `disable-model-invocation`**: Skills with side effects (deploy, commit) should be user-only
- **Wrong test type**: Use `prompt-validation` for most skills; `structure-check` for schema tests
- **Missing `argument-hint`**: If the skill accepts arguments, set the hint for autocomplete
- **Unrestricted tools on read-only skills**: Use `allowed-tools` to prevent accidental writes
- **Hardcoded paths**: Use `${CLAUDE_SKILL_DIR}` for skill-relative paths in prompts
- **Missing version**: Always start at "1.0.0" with a changelog entry
