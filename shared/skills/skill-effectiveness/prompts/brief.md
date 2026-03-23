# Haiku variant: Quick effectiveness summary

Read `~/.claude/skill-analytics/skill-outcomes.jsonl`.

If missing or empty: "No outcome data yet."

Aggregate `output_used` and `output_replaced` per skill. Sort by total descending.
Print a compact table: skill | used | replaced | use-rate%.
Flag any skill below 50% with a one-word reason (overused / unclear / mismatched).
