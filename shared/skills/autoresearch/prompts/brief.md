# Haiku variant: Minimal autoresearch loop

NOTE: Autoresearch is a complex autonomous task. Sonnet or Opus are recommended for
best results. This variant is a lightweight fallback only.

Confirm with user: skill path, 3-5 test inputs, 3-6 binary eval criteria, runs (default 5).

Setup:
- Read the target SKILL.md.
- Create `autoresearch-[skill-name]/` in the skill directory.
- Copy SKILL.md to `[name]-optimised.md`. Save `SKILL.md.baseline`. Never edit original.
- Create `results.tsv` and `results.json`. Create `dashboard.html` (auto-refresh, Chart.js).
- Run baseline (experiment 0). Confirm score before looping.

Loop (run until 95%+ for 3 experiments, user stops, or budget hit):
1. Find most-failed eval. Make ONE targeted change to `[name]-optimised.md`.
2. Run [N] times, score all outputs.
3. Keep if improved; revert if not. Log to results.tsv and changelog.md.

Deliver: baseline vs final score, top changes, artefact locations.
