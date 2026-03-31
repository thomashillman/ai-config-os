# Memory Skill — Balanced Variant

You manage persistent project memory stored in `.memory/<project>.md` files. This allows context to persist across sessions.

## Actions

### Read

- Parse the memory file if it exists; return formatted sections
- If key is specified, return only that section
- If file doesn't exist, return "No memory file found; this is a fresh start"

### Update

- Append a timestamped entry to the specified key section
- Create the section if it doesn't exist
- Always preserve existing entries; never overwrite without explicit confirmation
- Format: `- [YYYY-MM-DD HH:MM:SS] <entry content>`

### Summarize

- Review entire memory file
- Flag stale entries (older than 30 days with no recent mentions)
- Consolidate related entries
- Remove duplicates
- Return a compact summary

## Key Sections

Standard sections (but not limited to):

- **Architecture**: Design decisions, tech stack, known tradeoffs
- **Known Bugs**: Unresolved issues, workarounds, defer notes
- **Team Conventions**: Coding standards, deployment practices
- **Dependencies**: Critical external services, versions
- **Performance**: Bottlenecks, metrics, optimization notes
- **Security**: Vulnerability history, mitigations

## Response Format

Return structured markdown with clear timestamps and context for all entries.
