# Opus variant: Deep autoresearch optimisation loop

**STOP before running experiments.** Confirm all five inputs with the user:
1. Target skill path (exact path to SKILL.md)
2. Test inputs (3-5 varied prompts covering different use cases -- diversity is critical)
3. Eval criteria (3-6 binary yes/no checks -- see references/eval-guide.md)
4. Runs per experiment (default: 5; consider 10+ for noisy skills)
5. Budget cap (default: unlimited)

## Step 1: Deep skill analysis

Read the full SKILL.md, all files in `references/`, and any linked resources.
Before forming hypotheses:
- Map the skill's core job, inputs, expected output format, and anti-patterns
- Identify implicit assumptions in the current prompt (what the author assumed the model
  would infer but didn't state explicitly)
- Note any instructions that conflict or create ambiguity
- Benchmark your own understanding: could you pass the evals with this prompt?

## Step 2: Build a rigorous eval suite

Evals must be binary (yes/no), specific, consistent across runs, and non-gameable.
Apply the 3-question test to every eval before finalising:
1. Could two different instances score the same output and agree?
2. Could the skill game this eval without improving the actual output?
3. Does this test something the user actually cares about?

Format each eval:
```
EVAL [N]: [Name]
Question: [Yes/no question]
Pass: [Observable "yes" -- one sentence, specific]
Fail: [Observable "no" -- what triggers rejection]
```

Aim for 4-6 evals. More than 6 creates gaming risk. Fewer than 3 misses important
dimensions. `max_score = evals x runs`.

## Step 3: Generate the live dashboard

Create `autoresearch-[skill-name]/dashboard.html` -- single self-contained HTML with
Chart.js from CDN. Auto-refreshes every 10 seconds from `results.json`.
Shows: score progression, per-experiment status bar, eval-level breakdown heatmap,
mutation history, current status.
Open: `open dashboard.html` (macOS) or `xdg-open dashboard.html` (Linux).

## Step 4: Establish baseline (experiment 0)

1. Ask the user what to name the optimised version (e.g. `commit-conventions-v2`).
2. Create `autoresearch-[skill-name]/` inside the skill's directory.
3. Copy original to `[user-chosen-name].md`. Save `SKILL.md.baseline`. NEVER edit original.
4. Create `results.tsv`, `results.json`, open dashboard.
5. Run skill [N] times with full test input suite; score all outputs against all evals.
6. Analyse baseline failure patterns before recording score.
7. **Confirm score with user.** If baseline >= 90%, explicitly ask if optimisation is needed.
   If baseline is < 30%, discuss whether the skill needs rewriting rather than optimisation.

## Step 5: Hypothesis-driven experiment loop (run autonomously)

Stop when: user stops you, budget cap hit, or 95%+ for 3 consecutive experiments.

**Each cycle:**

1. **Root cause analysis.** Which evals fail most? Which test inputs trigger failure?
   Is the failure consistent or flaky? What pattern explains the failures?

2. **Mutation hypothesis.** ONE change only. Apply Occam's razor:
   - Prefer adding a specific missing instruction over rewriting existing ones
   - Prefer adding a worked example over abstract rules
   - Prefer clarifying an ambiguous term over adding new instructions
   - Try removing complexity if the skill shows signs of over-fitting to instructions

3. **Mutation quality check before applying:**
   - Will this change address the diagnosed root cause?
   - Could this mutation cause regressions in currently-passing evals?
   - Is this the minimal change that addresses the issue?

4. **Run [N] times.** Score all outputs against all evals.

5. **Decision: keep or discard.**
   - Improved: keep. New baseline for `[user-chosen-name].md`.
   - Same: discard. The change added complexity with no benefit.
   - Regressed: discard. Understand why before the next mutation.

6. **Log to `results.tsv` and `results.json`.**

7. Append to `changelog.md`:
   ```
   ## Experiment [N] -- [keep/discard]
   **Score:** [X]/[max] ([pct]%)
   **Change:** [one sentence]
   **Hypothesis:** [why expected to help + which evals targeted]
   **Result:** [which evals improved/declined and by how much]
   **Remaining failures:** [pattern description + estimated difficulty to fix]
   ```

**If stuck** (5+ experiments with no improvement): step back. Re-read ALL failing outputs.
Consider whether the eval is testing the right thing. Consider a fundamentally different
approach to the problem the skill is solving.

## Step 6: Deliver results

Baseline score, final score, percent improvement, total experiments run, keep rate,
top 3 changes with evidence of impact, remaining failure patterns, difficulty estimate
for remaining issues, location of all artefacts.
