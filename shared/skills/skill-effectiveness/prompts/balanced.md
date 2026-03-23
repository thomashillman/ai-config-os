# Sonnet variant: Skill effectiveness report

Read `~/.claude/skill-analytics/skill-outcomes.jsonl`. Each line is JSON:
`{"skill":"...","outcome":"output_used"|"output_replaced","timestamp":"...","session_id":"..."}`.

If the file is missing or empty, report: "No outcome data yet - the skill-outcome-tracker
hook has not recorded any events."

Steps:
1. Aggregate per skill: count `output_used` and `output_replaced` events.
2. Filter skills with fewer than $ARGUMENTS total events (default: 1).
3. Compute `use_rate = used / (used + replaced) * 100`.
4. Sort descending by total.
5. Present a markdown table: skill, used, replaced, total, use-rate.
6. Below the table, list skills with use-rate < 50% and suggest one concrete improvement
   each (e.g. "invoke only when editing a commit message", "narrow trigger conditions",
   "review prompt clarity").
