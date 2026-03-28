import fs from 'node:fs';
import path from 'node:path';

function toIsoNow() {
  return new Date().toISOString();
}

export function parseSkillStatsOutput(output) {
  const lines = String(output || '').split('\n').filter(Boolean);
  const dataLines = lines.slice(2);
  return dataLines
    .map((line) => {
      const parts = line.trim().split(/\s{2,}/);
      return {
        name: parts[0] || '',
        type: parts[1] || '',
        status: parts[2] || '',
        opus: hasVariant(parts[3]),
        sonnet: hasVariant(parts[4]),
        haiku: hasVariant(parts[5]),
        tests: Number.parseInt(parts[6] || '0', 10) || 0,
      };
    })
    .filter((row) => row.name);
}

function hasVariant(value) {
  const normalised = String(value || '').trim().toLowerCase();
  return normalised === '✓' || normalised === '✔' || normalised === 'true' || normalised === 'yes';
}

export function buildSkillsListContract(skills) {
  const experimental = skills.filter((s) => s.status === 'experimental').length;
  const needingImprovement = skills.filter((s) => s.status !== 'stable');
  return {
    contract: 'skills.list',
    generated_at: toIsoNow(),
    skills,
    total_skills: skills.length,
    interpretation: {
      why_it_matters_now: `Skill inventory currently exposes ${skills.length} skills; ${experimental} are experimental and may need hardening before broad use.`,
      attention_required: experimental > 0,
      top_opportunity: experimental > 0 ? 'Stabilize the highest-used experimental skills.' : 'Expand tests on stable skills with low coverage.',
      empty_state_reason: skills.length === 0 ? 'No skills found in shared/skills/. Run node scripts/build/compile.mjs.' : null,
      best_next_action: needingImprovement.length > 0 ? `Stabilize ${needingImprovement[0].name}` : 'Expand test coverage on stable skills',
      severity: experimental > 0 ? 'warning' : 'ok',
      skills_needing_improvement: needingImprovement.map((s) => s.name).slice(0, 5),
      changed_since_last_period: 'Prior-period baseline not yet available in this contract.',
    },
    sources: {
      observation_snapshot: null,
      retrospectives_aggregate: null,
      autoresearch_results: null,
    },
    success: true,
  };
}

export function buildToolUsageContract(metrics) {
  const counts = {};
  for (const metric of metrics) {
    const tool = typeof metric.tool === 'string' ? metric.tool : typeof metric.tool_name === 'string' ? metric.tool_name : 'unknown';
    counts[tool] = (counts[tool] || 0) + 1;
  }

  const tools = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({ tool, count }));

  return {
    contract: 'analytics.tool_usage',
    generated_at: toIsoNow(),
    total_events: metrics.length,
    tools,
    interpretation: {
      why_it_matters_now: tools.length > 0 ? `Top tool is ${tools[0].tool} (${tools[0].count} events), indicating where automation leverage is concentrated.` : 'No tool usage events yet; telemetry needs runtime activity.',
      attention_required: false,
      top_opportunity: tools.length > 0 ? `Improve workflow around ${tools[0].tool} where current demand is highest.` : 'Collect baseline tool-usage events.',
      empty_state_reason: tools.length === 0 ? 'No tool usage events collected yet. Runtime activity produces telemetry.' : null,
      best_next_action: tools.length > 0 ? `Review usage patterns for ${tools[0].tool}` : 'Run the runtime to collect tool usage telemetry',
      severity: 'info',
      skills_needing_improvement: [],
      changed_since_last_period: 'Prior-period baseline not yet available in this contract.',
    },
    sources: {
      observation_snapshot: { tool_usage_events: metrics.length },
      retrospectives_aggregate: null,
      autoresearch_results: null,
    },
    success: true,
  };
}

export function buildSkillEffectivenessContract(skills, totalEvents) {
  const needingImprovement = skills.filter((s) => s.use_rate < 50).map((s) => s.skill).slice(0, 5);
  const attentionRequired = needingImprovement.length > 0 && totalEvents > 0;
  return {
    contract: 'analytics.skill_effectiveness',
    generated_at: toIsoNow(),
    total_events: totalEvents,
    skills,
    interpretation: {
      why_it_matters_now: totalEvents > 0 ? 'Output-used rate indicates where skill guidance is helping versus being replaced during execution.' : 'No skill outcome events captured yet.',
      attention_required: attentionRequired,
      top_opportunity: needingImprovement[0] ? `Run /autoresearch on ${needingImprovement[0]} to improve output-used rate.` : 'Expand measurement coverage for more skills.',
      empty_state_reason: totalEvents === 0 ? 'No skill outcome events captured yet. Use skills in sessions to collect data.' : null,
      best_next_action: needingImprovement[0] ? `Run /autoresearch on ${needingImprovement[0]}` : 'Continue collecting skill outcome data',
      severity: attentionRequired ? 'warning' : 'ok',
      skills_needing_improvement: needingImprovement,
      changed_since_last_period: 'Prior-period baseline not yet available in this contract.',
    },
    sources: {
      observation_snapshot: { skill_outcome_events: totalEvents },
      retrospectives_aggregate: null,
      autoresearch_results: null,
    },
    success: true,
  };
}

export function readAutoresearchRuns(repoRoot) {
  if (!repoRoot) return [];
  const skillsDir = path.join(repoRoot, 'shared', 'skills');
  const runs = [];
  const maxResultsBytes = 512 * 1024;

  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const skillName of skillDirs) {
    const skillPath = path.join(skillsDir, skillName);
    let runDirs = [];
    try {
      runDirs = fs.readdirSync(skillPath, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('autoresearch-')).map((d) => d.name);
    } catch {
      continue;
    }

    for (const runDir of runDirs) {
      const resultsFile = path.join(skillPath, runDir, 'results.json');
      try {
        const stat = fs.statSync(resultsFile);
        if (stat.size > maxResultsBytes) continue;
        const data = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        runs.push({
          skill: skillName,
          run_dir: runDir,
          status: typeof data.status === 'string' ? data.status : 'unknown',
          control_score: typeof data.control_score === 'number' ? data.control_score : null,
          baseline_score: typeof data.baseline_score === 'number' ? data.baseline_score : null,
          best_score: typeof data.best_score === 'number' ? data.best_score : null,
          current_experiment: typeof data.current_experiment === 'number' ? data.current_experiment : 0,
          experiment_count: Array.isArray(data.experiments) ? data.experiments.length : 0,
          improved_by: typeof data.baseline_score === 'number' && typeof data.best_score === 'number'
            ? Math.round(data.best_score - data.baseline_score)
            : null,
        });
      } catch {
        // ignore malformed or missing runs
      }
    }
  }

  return runs.sort((a, b) => (b.best_score ?? 0) - (a.best_score ?? 0));
}

export function buildAutoresearchRunsContract(runs) {
  const best = runs[0];
  const notImproved = runs.filter((r) => (r.improved_by ?? 0) <= 0).map((r) => r.skill).slice(0, 5);
  return {
    contract: 'analytics.autoresearch_runs',
    generated_at: toIsoNow(),
    runs,
    interpretation: {
      why_it_matters_now: best ? `Best run is ${best.skill}/${best.run_dir} at ${best.best_score ?? 0}%.` : 'No autoresearch runs available yet.',
      attention_required: false,
      top_opportunity: best ? `Replicate high-scoring patterns from ${best.skill}/${best.run_dir}.` : 'Start autoresearch on low-performing skills.',
      empty_state_reason: runs.length === 0 ? 'No autoresearch runs found in shared/skills/. Run /autoresearch on a skill to generate data.' : null,
      best_next_action: best ? `Replicate patterns from ${best.skill}/${best.run_dir}` : 'Run /autoresearch on a low-performing skill',
      severity: 'info',
      skills_needing_improvement: notImproved,
      changed_since_last_period: 'Prior-period baseline not yet available in this contract.',
    },
    sources: {
      observation_snapshot: null,
      retrospectives_aggregate: null,
      autoresearch_results: { run_count: runs.length },
    },
    success: true,
  };
}

export function buildAutoresearchRunGetContract(runs, skill, runDir) {
  const run = runs.find((entry) => entry.skill === skill && entry.run_dir === runDir) || null;
  return {
    contract: 'analytics.autoresearch_run_get',
    generated_at: toIsoNow(),
    run,
    interpretation: {
      why_it_matters_now: run ? `Run status is ${run.status} with ${run.experiment_count} experiments.` : 'Requested autoresearch run was not found.',
      skills_needing_improvement: run && (run.improved_by ?? 0) <= 0 ? [run.skill] : [],
      top_opportunity: run ? `Review experiments in ${run.run_dir} to iterate prompt mutations.` : 'Verify run directory and skill name.',
      changed_since_last_period: 'Prior-period baseline not yet available in this contract.',
    },
    sources: {
      observation_snapshot: null,
      retrospectives_aggregate: null,
      autoresearch_results: run ? { run_key: `${run.skill}/${run.run_dir}` } : null,
    },
    success: true,
  };
}

export function buildFrictionSignalsContract(retroSummary) {
  const signalBreakdown = retroSummary?.signal_breakdown || {};
  const topSignal = Object.entries(signalBreakdown).sort((a, b) => b[1] - a[1])[0] || null;
  const artifactCount = retroSummary?.artifact_count || 0;
  const attentionRequired = topSignal !== null && topSignal[1] > 3;
  return {
    contract: 'analytics.friction_signals',
    generated_at: toIsoNow(),
    artifact_count: artifactCount,
    signal_breakdown: signalBreakdown,
    top_recommendations: Array.isArray(retroSummary?.top_recommendations) ? retroSummary.top_recommendations : [],
    interpretation: {
      why_it_matters_now: topSignal ? `Most frequent friction is ${topSignal[0]} (${topSignal[1]} occurrences).` : 'No retrospective friction signals collected yet.',
      attention_required: attentionRequired,
      top_opportunity: topSignal ? `Address recurring ${topSignal[0]} signals in high-frequency workflows.` : 'Collect retrospectives after merged changes.',
      empty_state_reason: artifactCount === 0 ? 'No retrospective artifacts found. Run /post-merge-retrospective after merges.' : null,
      best_next_action: topSignal ? `Address ${topSignal[0]} friction pattern` : 'Run /post-merge-retrospective after the next merge',
      severity: attentionRequired ? 'warning' : artifactCount === 0 ? 'info' : 'ok',
      skills_needing_improvement: Array.isArray(retroSummary?.top_recommendations)
        ? retroSummary.top_recommendations.map((r) => r.name).slice(0, 5)
        : [],
      changed_since_last_period: 'Prior-period baseline not yet available in this contract.',
    },
    sources: {
      observation_snapshot: null,
      retrospectives_aggregate: { artifact_count: artifactCount },
      autoresearch_results: null,
    },
    success: true,
  };
}
