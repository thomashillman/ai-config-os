# session-start-hook

## Quick Start

See `SKILL.md` for full skill definition including:

- Input/output specification
- Multi-model variants (Opus, Sonnet, Haiku)
- Test definitions
- Performance metrics
- Dependency requirements

## File Structure

```
session-start-hook/
├── SKILL.md              # Full skill definition with frontmatter
├── README.md             # This file (auto-generated)
└── prompts/              # Variant-specific prompts
    ├── detailed.md       # Opus variant
    ├── balanced.md       # Sonnet variant (default)
    └── brief.md          # Haiku variant
```

## Integration

This skill is available through the core-skills plugin and can be:

- Invoked directly by Claude Code
- Composed into workflows
- Used with different model variants
- Monitored for performance metrics

---

_This README was auto-generated from SKILL.md frontmatter. Edit the SKILL.md file, then run `ops/generate-docs.sh` to update._
