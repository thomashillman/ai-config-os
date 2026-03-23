---
skill: autoresearch
description: |
  Autonomously optimise any skill by running it repeatedly, scoring outputs against
  binary evals, mutating the prompt, and keeping improvements. Based on Karpathy's
  autoresearch methodology.

  Use when: "optimise this skill", "improve this skill", "run autoresearch on",
  "make this skill better", "self-improve skill", "benchmark skill", "eval my skill",
  "run evals on". Outputs: an improved SKILL.md copy, a results log, and a changelog
  of every mutation tried.
type: agent
status: experimental
inputs:
  - name: skill_path
    type: string
    description: Path to the SKILL.md file to optimise
    required: true
  - name: test_inputs
    type: array
    description: 3-5 varied prompts/scenarios to test the skill with
    required: true
  - name: eval_criteria
    type: array
    description: 3-6 binary yes/no checks that define a good output
    required: true
  - name: runs_per_experiment
    type: number
    description: How many times to run the skill per mutation (default 5)
    required: false
  - name: run_interval_seconds
    type: number
    description: Seconds between experiment cycles (default 120)
    required: false
  - name: budget_cap
    type: number
    description: Max experiment cycles before stopping (default unlimited)
    required: false
outputs:
  - name: improved_skill
    type: string
    description: Path to the improved skill file in the autoresearch working directory
  - name: results_tsv
    type: string
    description: Tab-separated experiment log
  - name: changelog
    type: string
    description: Detailed mutation log with reasoning and outcomes
  - name: dashboard
    type: string
    description: Path to the self-contained HTML live dashboard
dependencies:
  skills: []
  apis: []
  models:
    - sonnet
examples:
  - input: "Run autoresearch on my commit-conventions skill"
    output: "Improved SKILL.md copy, results.tsv, changelog.md, dashboard.html"
    expected_model: sonnet
capabilities:
  required:
    - fs.read
    - fs.write
    - shell.exec
  optional:
    - browser.fetch
  fallback_mode: manual
  fallback_notes: >
    Without shell.exec the dashboard cannot be opened automatically.
    The user can open dashboard.html manually.
tests:
  - id: test-context-gathering
    type: prompt-validation
    input: "Run autoresearch on my skill"
    expected_substring: "skill_path"
    models_to_test:
      - sonnet
docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
  keywords:
    - autoresearch
    - optimisation
    - evals
    - self-improvement
monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
version: "1.0.0"
changelog:
  1.0.0: "Initial release; full Karpathy autoresearch loop with live HTML dashboard"
---

# autoresearch

Autonomously optimise any Claude Code skill by running it repeatedly, scoring outputs
against binary evals, mutating the prompt, and keeping improvements.

Most skills work about 70% of the time. The other 30% you get garbage. The fix isn't
to rewrite the skill from scratch. It's to let an agent run it dozens of times, score
every output, and tighten the prompt until that 30% disappears.

This skill adapts Andrej Karpathy's autoresearch methodology (autonomous
experimentation loops) to Claude Code skills.

---

## the core job

Take any existing skill, define what "good output" looks like as binary yes/no checks,
then run an autonomous loop that:

1. Generates outputs from the skill using test inputs
2. Scores every output against the eval criteria
3. Mutates the skill prompt to fix failures
4. Keeps mutations that improve the score, discards the rest
5. Repeats until the score ceiling is hit or the user stops it

**Output:** An improved SKILL.md copy + `results.tsv` log + `changelog.md` of every
mutation attempted + a live HTML dashboard you can watch in your browser.

---

## before starting: gather context

**STOP. Do not run any experiments until all fields below are confirmed with the user.
Ask for any missing fields before proceeding.**

1. **Target skill** -- Which skill do you want to optimize? (need the exact path to SKILL.md)
2. **Test inputs** -- What 3-5 different prompts/scenarios should we test the skill with?
   (variety matters -- pick inputs that cover different use cases so we don't overfit
   to one scenario)
3. **Eval criteria** -- What 3-6 binary yes/no checks define a good output? (these are
   your "test questions" -- see [references/eval-guide.md](references/eval-guide.md)
   for how to write good evals)
4. **Runs per experiment** -- How many times should we run the skill per mutation?
   Default: 5.
5. **Run interval** -- How often should experiments cycle? Default: every 2 minutes.
6. **Budget cap** -- Optional. Max number of experiment cycles before stopping.
   Default: no cap (runs until you stop it).

---

## step 1: read the skill

Before changing anything, read and understand the target skill completely.

1. Read the full SKILL.md file
2. Read any files in `references/` that the skill links to
3. Identify the skill's core job, process steps, and output format
4. Note any existing quality checks or anti-patterns already in the skill

Do NOT skip this. You need to understand what the skill does before you can improve it.

---

## step 2: build the eval suite

Convert the user's eval criteria into a structured test. Every check must be binary --
pass or fail, no scales.

**Format each eval as:**

```
EVAL [number]: [Short name]
Question: [Yes/no question about the output]
Pass condition: [What "yes" looks like -- be specific]
Fail condition: [What triggers a "no"]
```

**Rules for good evals:**
- Binary only. Yes or no. No "rate 1-7" scales. Scales compound variability.
- Specific enough to be consistent. "Is the text readable?" is too vague.
  "Are all words spelled correctly with no truncated sentences?" is testable.
- Not so narrow that the skill games the eval.
- 3-6 evals is the sweet spot.

See [references/eval-guide.md](references/eval-guide.md) for detailed examples.

**Max score calculation:**

```
max_score = [number of evals] x [runs per experiment]
```

---

## step 3: generate the live dashboard

Before running any experiments, create a live HTML dashboard at
`autoresearch-[skill-name]/dashboard.html` and open it in the browser.

The dashboard must:
- Auto-refresh every 10 seconds (reads from `results.json`)
- Show a score progression line chart (experiment number on X axis, pass rate % on Y)
- Show a colored bar for each experiment: green = keep, red = discard, blue = baseline
- Show a table of all experiments: experiment #, score, pass rate, status, description
- Show per-eval breakdown: which evals pass most/least across all runs
- Show current status: "Running experiment [N]..." or "Idle"
- Use clean styling (white background, pastel accents, clean sans-serif font)

Generate as a single self-contained HTML file with inline CSS and JavaScript.
Use Chart.js from CDN for the line chart.

**Open it immediately** after creating it:
- macOS: `open dashboard.html`
- Linux: `xdg-open dashboard.html`

**Update `results.json`** after every experiment. Format:

```json
{
  "skill_name": "[name]",
  "status": "running",
  "current_experiment": 3,
  "baseline_score": 70.0,
  "best_score": 90.0,
  "experiments": [
    {
      "id": 0,
      "score": 14,
      "max_score": 20,
      "pass_rate": 70.0,
      "status": "baseline",
      "description": "original skill -- no changes"
    }
  ],
  "eval_breakdown": [
    {"name": "Text legibility", "pass_count": 8, "total": 10}
  ]
}
```

When the run finishes, update `status` to `"complete"`.

---

## step 4: establish baseline

Run the skill AS-IS before changing anything. This is experiment #0.

1. **Ask the user what to name the new version.** Example: "What should I call the
   optimized version? (e.g., commit-conventions-v2)"
2. Create working directory: `autoresearch-[skill-name]/` inside the skill's folder
3. **Copy the original SKILL.md into the working directory as `[user-chosen-name].md`**
   -- this is the copy you will mutate. NEVER edit the original SKILL.md.
4. Save `SKILL.md.baseline` in the working directory (identical to the original)
5. Create `results.tsv`, `results.json`, `dashboard.html` -- open the dashboard
6. Run the skill [N] times using the test inputs (use `[user-chosen-name].md`)
7. Score every output against every eval
8. Record the baseline score in both `results.tsv` and `results.json`

**results.tsv format (tab-separated):**

```
experiment	score	max_score	pass_rate	status	description
0	14	20	70.0%	baseline	original skill -- no changes
```

**IMPORTANT:** After establishing baseline, confirm the score with the user before
proceeding. If baseline is already 90%+, the skill may not need optimization -- ask
the user if they want to continue.

---

## step 5: run the experiment loop

Once started, run autonomously until stopped.

**LOOP:**

1. **Analyze failures.** Look at which evals are failing most. Read the actual outputs
   that failed. Identify the pattern -- formatting issue? Missing instruction?
   Ambiguous directive?

2. **Form a hypothesis.** Pick ONE thing to change. Do not change 5 things at once.

   Good mutations:
   - Add a specific instruction addressing the most common failure
   - Reword an ambiguous instruction to be more explicit
   - Add an anti-pattern ("Do NOT do X") for a recurring mistake
   - Move a buried instruction higher (priority = position)
   - Add or improve an example showing correct behavior
   - Remove an instruction causing over-optimization for one thing

   Bad mutations:
   - Rewriting the entire skill from scratch
   - Adding 10 new rules at once
   - Making the skill longer without a specific reason
   - Adding vague instructions like "make it better"

3. **Make the change.** Edit `[user-chosen-name].md` with ONE targeted mutation.
   NEVER touch the original SKILL.md.

4. **Run the experiment.** Execute the skill [N] times with the same test inputs.

5. **Score it.** Run every output through every eval. Calculate total score.

6. **Decide: keep or discard.**
   - Score improved -- **KEEP.** Log it. New baseline for `[user-chosen-name].md`.
   - Score same or worse -- **DISCARD.** Revert `[user-chosen-name].md`.

7. **Log the result** in `results.tsv` and `results.json`.

8. **Repeat.** Go back to step 1.

**NEVER STOP** until:
- The user manually stops you
- You hit the budget cap (if one was set)
- You hit 95%+ pass rate for 3 consecutive experiments

**If you run out of ideas:** Re-read the failing outputs. Try combining two previous
near-miss mutations. Try removing things instead of adding them. Simplification that
maintains the score is a win.

---

## step 6: write the changelog

After each experiment, append to `changelog.md`:

```markdown
## Experiment [N] -- [keep/discard]
**Score:** [X]/[max] ([percent]%)
**Change:** [One sentence describing what was changed]
**Reasoning:** [Why this change was expected to help]
**Result:** [What actually happened -- which evals improved/declined]
**Failing outputs:** [Brief description of what still fails, if anything]
```

---

## step 7: deliver results

When the loop stops, present:

1. **Score summary:** Baseline score -> Final score (percent improvement)
2. **Total experiments run:** How many mutations were tried
3. **Keep rate:** How many mutations were kept vs discarded
4. **Top 3 changes that helped most** (from the changelog)
5. **Remaining failure patterns** (what the skill still gets wrong)
6. **The improved `[user-chosen-name].md`** (original SKILL.md is untouched)
7. **Location of `results.tsv` and `changelog.md`** for reference

---

## output structure

Four files are created in `autoresearch-[skill-name]/` inside the skill's folder:

```
autoresearch-[skill-name]/
|-- dashboard.html       # live browser dashboard (auto-refreshes)
|-- results.json         # data file powering the dashboard
|-- results.tsv          # score log for every experiment
|-- changelog.md         # detailed mutation log
|-- SKILL.md.baseline    # original skill before optimization
```

The original SKILL.md is NEVER modified. The improved version lives in
`[user-chosen-name].md`. The user can review, diff, and manually apply changes.

---

## the failure mode to avoid

The temptation is to let the agent generate your test inputs and write your checklist.
It will do it. The inputs will look diverse. The questions will look reasonable. But if
you haven't personally read outputs first, the judges are measuring a problem you
imagined, not one you observed.

The manual work is not overhead. It's what makes the automated part valid.
