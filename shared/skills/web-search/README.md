# web-search

Search the web for current information using available APIs and synthesize results for the user.

## Quick Start

See `SKILL.md` for full skill definition including:
- Input/output specification
- Multi-model variants (Opus, Sonnet, Haiku)
- Test definitions
- Performance metrics
- Dependency requirements

## Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search query string |
| num_results | integer | No | Number of results to retrieve (1-10) |
| filter_by_date | string | No | Filter results (latest_day, latest_week, latest_month) |

## Outputs

| Name | Type | Description |
|------|------|---|
| results | array | Array of search results with title, url, snippet |

## Multi-Model Variants

| Variant | Cost | Speed | Best For |
|---------|------|-------|----------|
| opus | 3.0x | Slow | Comprehensive research |
| sonnet | 1.0x | Medium | Default / balanced |
| haiku | 0.3x | Fast | Quick lookups |

## Examples

### Research Query
**Input:** Search for latest Claude model updates
**Output:** Recent announcements show Claude 4.6 released with improved reasoning...

## Dependencies

**APIs:**
- web-search-api

**Models:**
- Sonnet (default)
- Opus (detailed research)

## Testing

The skill includes:
- Basic search validation tests
- Current events handling tests
- Performance benchmarks across variants
- Edge case handling (invalid queries)

## File Structure

```
web-search/
├── SKILL.md              # Full skill definition with frontmatter
├── README.md             # This file (auto-generated)
└── prompts/              # Variant-specific prompts
    ├── detailed.md       # Opus variant (comprehensive)
    ├── balanced.md       # Sonnet variant (default)
    └── brief.md          # Haiku variant (quick)
```

## Integration

This skill:
- Is available through the core-skills plugin
- Can be invoked directly by Claude Code
- Can be composed into "researcher" persona workflows
- Supports all 6 Phase 2 features (dependencies, variants, testing, composition, monitoring, docs)

---

*This README was auto-generated from SKILL.md frontmatter.*
