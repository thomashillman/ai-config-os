# Hook System Architecture

This directory contains the Claude Code hook system, refactored to separate policy (config), parsing (dispatcher), and enforcement (rule modules).

## Architecture Overview

The hook system is divided into three layers:

```
.claude/settings.json             ← Thin router: event type → hook command
     ↓
.claude/hooks/pre-tool-use.sh    ← Shell wrapper: pipes stdin to Node
     ↓
.claude/hooks/dispatch.mjs        ← Typed dispatcher: parses JSON, validates, routes to rules
     ↓
.claude/hooks/lib/rules/*.mjs     ← Rule modules: isolated policy, analytics, state tracking
```

## File Structure

```
.claude/hooks/
├── lib/
│   ├── contracts/
│   │   ├── hook-event.ts         [TypeScript types: event shapes]
│   │   └── hook-event.mjs        [Runtime validation]
│   ├── rules/
│   │   ├── index.mjs             [Rule registry: exports all rules]
│   │   ├── pre-tool-use-guard.mjs
│   │   ├── post-tool-use-reminder.mjs
│   │   ├── log-skill-usage.mjs
│   │   ├── log-tool-inefficiencies.mjs
│   │   └── skill-outcome-tracker.mjs
│   ├── rule-executor.mjs         [Rule dispatcher: executes rules in sequence]
│   └── __tests__/
│       ├── hook-event.test.mjs
│       ├── rule-executor.test.mjs
│       └── fixtures.mjs
├── dispatch.mjs                  [Main dispatcher: orchestrates parsing + rule dispatch]
├── pre-tool-use.sh              [Wrapper: pipes stdin to dispatch.mjs]
├── post-tool-use.sh             [Wrapper: pipes stdin to dispatch.mjs]
└── session-start.sh             [Orchestration: env setup, bootstrap]
```

## Rule Module Contract

Each rule module follows this interface:

```javascript
export const rule = {
  name: 'unique-rule-id',
  triggers: ['PreToolUse'],  // Event type(s) that trigger this rule

  async execute(event) {
    // Process event, perform side effects (file I/O, logging, etc.)
    // Return a decision
    return {
      decision: 'allow' | 'block',
      reason?: 'explanation if blocked',
      metadata?: { /* telemetry */ }
    };
  }
};
```

**Rules must:**
- Be stateless (no global state except reading/writing JSONL files)
- Handle their own errors gracefully (throw only for assertion failures)
- Return quickly (< 100ms)
- Assume the event has been validated already

**Rules may:**
- Append to JSONL files (for analytics)
- Read/write session state in `/tmp/claude-sessions/`
- Log to stderr for debugging
- Block tool execution (return `decision: 'block'`)

## Event Contract

See `lib/contracts/hook-event.ts` for the canonical event types. Every rule receives a validated event object with this shape:

### PreToolUseEvent
```javascript
{
  type: 'PreToolUse',
  tool_name: 'Write' | 'Edit' | 'Skill' | ...,
  file_path?: '/absolute/path/to/file',
  tool_input?: { skill?, name?, args? },
  session_id: 'session-abc123',
  timestamp: '2026-03-30T10:00:00Z'
}
```

### PostToolUseEvent
```javascript
{
  type: 'PostToolUse',
  tool_name: 'Bash' | ...,
  file_path?: '/absolute/path/to/file',
  tool_input?: { skill?, name?, args? },
  tool_response?: { is_error: boolean, content? },
  session_id: 'session-abc123',
  timestamp: '2026-03-30T10:00:00Z'
}
```

### SessionStartEvent
```javascript
{
  type: 'SessionStart',
  session_id: 'session-abc123',
  project_dir: '/home/user/project',
  home_dir: '/home/user',
  timestamp: '2026-03-30T10:00:00Z'
}
```

## Adding a New Rule

1. Create a new file `lib/rules/my-rule.mjs`:

```javascript
// .claude/hooks/lib/rules/my-rule.mjs

export const rule = {
  name: 'my-rule',
  triggers: ['PreToolUse'],

  async execute(event) {
    // Your logic here
    return { decision: 'allow' };
  }
};
```

2. Register in `lib/rules/index.mjs`:

```javascript
import { rule as myRule } from './my-rule.mjs';

export const rules = {
  myRule,
  // ... other rules
};
```

3. The dispatcher auto-discovers rules from the registry.

## Dispatcher Behavior

`dispatch.mjs` is the main entry point. It:

1. **Parses** stdin as JSON with error handling
2. **Injects** missing session_id and timestamp from environment
3. **Normalizes** file paths (relative → absolute)
4. **Validates** using the event contract
5. **Dispatches** to all applicable rules (based on event type)
6. **Collects** results (block decisions stop processing)
7. **Outputs** decision to stdout (if blocking)
8. **Exits** with code 0 (success, regardless of rule results)

**Error handling:**
- Parse errors: log to stderr, exit 0 (allow)
- Validation errors: log to stderr, exit 0 (allow)
- Rule errors: log to stderr, continue to next rule (graceful degradation)
- Block decision: output JSON to stdout, exit 0

This ensures a single hook failure doesn't crash Claude Code.

## Testing

Tests are in `lib/__tests__/`:

- **hook-event.test.mjs** — Event validation and normalization
- **rule-executor.test.mjs** — Rule registry and dispatch
- **observation-reader-compat.test.mjs** — JSONL format matches readers
- **fixtures.mjs** — Sample events for testing

Run tests:
```bash
npm test -- --grep "hook"
```

## Backward Compatibility

- Shell wrappers (`.sh` files) keep the same stdin/stdout interface
- JSONL output formats are identical to the old shell scripts
- Observation readers in `runtime/lib/observation-sources/` work unchanged
- Session state via `CLAUDE_SESSION_ID` environment variable
- Graceful degradation: hook failures don't affect Claude Code sessions

## Performance

- Dispatcher startup overhead: < 50ms (Node startup + JSON parsing)
- Each rule: < 10ms (typical)
- Total hook latency: < 100ms (9 rules worst-case)

This is acceptable because hooks run in the background and don't block Claude Code.

## Migration Path

This architecture was rolled out in 6 phases:

1. **Phase 0** — Directory structure + TypeScript event contract
2. **Phase 1** — Core dispatcher + rule executor
3. **Phase 2** — Analytics rules (skill usage, inefficiencies)
4. **Phase 3** — Policy rules (guard, reminder, outcome tracker)
5. **Phase 4** — Integration testing + backward compatibility
6. **Phase 5** — Documentation updates

Each phase is self-contained and tested before moving to the next.
