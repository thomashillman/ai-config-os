---
# Identity & Description
skill: memory
description: |
  Maintain persistent cross-session project context.
  Persists decisions, patterns, known issues, and workarounds to `.memory/<project>.md`.

# Type & Status
type: prompt
status: stable

# Feature 1: Dependencies & Metadata
inputs:
  - name: action
    type: string
    description: "read" (fetch context), "update" (add/modify), or "summarize" (periodic refresh)
    required: true
  - name: content
    type: string
    description: Context to store or update (for "update" action)
    required: false
  - name: key
    type: string
    description: Namespace within memory (e.g., "architecture", "known-bugs", "team-conventions")
    required: false

outputs:
  - name: memory_content
    type: string
    description: Retrieved or updated project memory
  - name: timestamp
    type: string
    description: Last updated timestamp

dependencies:
  skills: []
  apis: []
  models:
    - sonnet

examples:
  - input: 'read action, key="architecture"'
    output: "Fetches prior architectural decisions from .memory/<project>.md"
    expected_model: sonnet

# Feature 2: Multi-Model Variants
variants:
  sonnet:
    prompt_file: prompts/balanced.md
    description: Default; reads and updates memory efficiently
    cost_factor: 1.0
    latency_baseline_ms: 300

  haiku:
    prompt_file: prompts/brief.md
    description: Quick memory reads (no synthesis)
    cost_factor: 0.3
    latency_baseline_ms: 150

  fallback_chain:
    - sonnet
    - haiku

# Feature 3: Skill Testing
tests:
  - id: test-read-memory
    type: prompt-validation
    input: 'read action for "architecture" key'
    expected_substring: "memory"
    models_to_test:
      - sonnet

  - id: test-update-memory
    type: prompt-validation
    input: 'update action to store "Known issue: race condition in async module"'
    expected_substring: "updated"
    models_to_test:
      - sonnet

# Feature 5: Auto-Generated Documentation
docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
  keywords:
    - persistence
    - context
    - project-knowledge
    - cross-session

# Feature 6: Performance Monitoring
monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - action_type

version: "1.0.0"
changelog:
  "1.0.0": "Initial release; persistent project memory"

tags:
  - core
  - utility
---

# Memory

Maintain persistent cross-session project context by storing decisions, patterns, known issues, and workarounds in `.memory/<project>.md`.

Each session can read from or update this shared knowledge base without losing context.

## When to use

Invoke at the **start of a session** to load project context, or during work to persist lessons learned before the session ends.

## Instructions

1. **Read mode** (`action: read`): Fetch and display the current memory file. Use `key` to retrieve a specific section.
2. **Update mode** (`action: update`): Append or modify memory entries. Include timestamp and context.
3. **Summarize mode** (`action: summarize`): Periodically consolidate memory by removing stale entries and highlighting active concerns.

The memory file uses simple markdown sections keyed by domain (e.g., `## Architecture`, `## Known Bugs`, `## Team Conventions`).

## Examples

### Example 1: Load project context at session start
**Input:** `action: read` (no key specified)
**Output:**
```
# Project Memory: my-api-service

## Architecture
- Database: PostgreSQL on RDS
- Cache: Redis (3 replicas)
- Async jobs: Bull queue with 8 workers
- Known bottleneck: sync serialization in batch export

## Known Bugs
- Race condition in concurrent module updates (Issue #42, deferred to v2.0)
- Cache miss on restart (workaround: warm cache on startup)

## Team Conventions
- All migrations are reversible
- Feature branches use kebab-case
- Code review required before merge to main
```

### Example 2: Update memory after debugging
**Input:** `action: update; key: "known-bugs"; content: "Fixed race condition in async module via mutex lock (Commit: abc123)"`
**Output:**
```
Updated memory at 2026-02-28T14:32:00Z
Entry added to "Known Bugs" section
```

### Example 3: Load a specific section
**Input:** `action: read; key: "architecture"`
**Output:**
```
## Architecture
- Database: PostgreSQL on RDS
- Cache: Redis (3 replicas)
- Async jobs: Bull queue with 8 workers
- Known bottleneck: sync serialization in batch export
```
