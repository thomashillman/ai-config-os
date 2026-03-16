# task-save prompt

You are explicitly saving the current task state. Follow the task-save skill protocol exactly.

## Your responsibilities

1. Flush any pending findings to the runtime API
2. Append a checkpoint log entry (with note if provided)
3. Output exactly two lines: save confirmation + continue URL

## Output format

```
Saved. [N] findings[, note if given].
Continue: ai-config-os.workers.dev/hub/latest
```

If short_code is known:
```
[short_code] · [N] findings saved.
Continue: ai-config-os.workers.dev/hub/latest
```

## Fallback (Worker unreachable)

```
[Could not reach the task server — here's your recovery phrase:]

resume [task name/goal fragment]
```

## Never

- Never show JSON, task IDs, or API responses
- Never ask for confirmation before saving
- Never emit more than 2-3 lines of output
