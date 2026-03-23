# Sonnet variant: Autoresearch optimisation loop

**STOP before running experiments.** Confirm all five inputs with the user:
1. Target skill path (exact path to SKILL.md)
2. Test inputs (3-5 varied prompts covering different use cases)
3. Eval criteria (3-6 binary yes/no checks -- see references/eval-guide.md)
4. Runs per experiment (default: 5)
5. Budget cap (default: unlimited)

## Step 1: Read the skill

Read the full SKILL.md and any files in `references/`. Understand the core job,
process steps, and output format before changing anything.

## Step 2: Build the eval suite

Convert each eval criterion into:
```
EVAL [N]: [Name]
Question: [Yes/no question]
Pass: [Specific observable "yes"]
Fail: [Specific observable "no"]
```
Rules: binary only; 3-6 evals; specific enough to be consistent; not so narrow the
skill games it. `max_score = evals x runs`.

## Step 3: Generate the live dashboard

Create `autoresearch-[skill-name]/dashboard.html` -- single self-contained HTML file
with Chart.js from CDN. Auto-refreshes every 10 seconds from `results.json`.
Shows: score progression line chart, per-experiment bar (green=keep, red=discard,
blue=baseline), per-eval breakdown, current status.
Open it: `open dashboard.html` (macOS) or `xdg-open dashboard.html` (Linux).

## Step 4: Establish baseline (experiment 0)

1. Ask the user what to name the optimised version (e.g. `commit-conventions-v2`).
2. Create `autoresearch-[skill-name]/` inside the skill's directory.
3. Copy original SKILL.md to `[user-chosen-name].md` -- NEVER edit the original.
4. Save `SKILL.md.baseline` (identical copy for revert).
5. Create `results.tsv`, `results.json`, open dashboard.
6. Run skill [N] times with test inputs; score all outputs; record baseline.
7. **Confirm score with user before proceeding.** If baseline >= 90%, ask whether to continue.

`results.tsv` header: `experiment\tscore\tmax_score\tpass_rate\tstatus\tdescription`

## Step 5: Experiment loop (run autonomously)

Loop until stopped, budget hit, or 95%+ for 3 consecutive experiments:

1. **Analyse failures.** Which evals fail most? Read the actual failing outputs.
2. **Hypothesise ONE change.** Good: add specific instruction, reword ambiguous step,
   add anti-pattern, move buried instruction up, add worked example.
   Bad: rewrite everything, add 10 rules at once, vague "improve it" edits.
3. **Edit `[user-chosen-name].md`** with the single mutation. Never touch original.
4. **Run [N] times.** Score all outputs.
5. **Keep if score improved; discard and revert otherwise.**
6. **Log to `results.tsv` and `results.json`.**
7. Append to `changelog.md`:
   ```
   ## Experiment [N] -- [keep/discard]
   **Score:** [X]/[max] ([pct]%)
   **Change:** [one sentence]
   **Reasoning:** [why expected to help]
   **Result:** [what actually happened]
   ```

## Step 6: Deliver results

Score summary, total experiments, keep rate, top 3 changes, remaining failure patterns,
location of improved file and logs.
