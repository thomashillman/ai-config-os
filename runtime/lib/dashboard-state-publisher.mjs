/**
 * Dashboard state publisher: compute local state and push canonical snapshots to the Worker.
 *
 * Pattern: local-runtime-computes → publishes → Worker stores and serves → dashboard reads.
 *
 * Each publish function:
 *   1. Gathers local data (via script or file read)
 *   2. Shapes it into a canonical resource payload with freshness metadata
 *   3. POSTs to the Worker publish endpoint
 *   4. Returns a publish receipt
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  buildFrictionSignalsContract,
  buildSkillEffectivenessContract,
  buildSkillsListContract,
  buildToolUsageContract,
  buildAutoresearchRunsContract,
  parseSkillStatsOutput,
  readAutoresearchRuns,
} from "./dashboard-analytics-contracts.mjs";
import { loadObservationSnapshot } from "./observation-read-model.mjs";

const FRESHNESS_TTL_MS = 5 * 60 * 1000; // 5 minutes

function toIsoNow() {
  return new Date().toISOString();
}

function resolveRepoRoot() {
  return path.resolve(new URL("../../", import.meta.url).pathname);
}

function runScript(repoRoot, script, args = []) {
  const scriptPath = path.join(repoRoot, script);
  try {
    const output = execFileSync("bash", [scriptPath, ...args], {
      encoding: "utf8",
      timeout: 30000,
      cwd: repoRoot,
    });
    return { success: true, output };
  } catch (err) {
    return {
      success: false,
      output: String(err.stdout || ""),
      error: String(err.stderr || err.message || "Script error"),
    };
  }
}

function freshnessMeta(scope, publisherSurface = "local_runtime") {
  return {
    generated_at: toIsoNow(),
    publisher_surface: publisherSurface,
    freshness_state: "fresh",
    scope,
  };
}

async function postSnapshot(workerUrl, token, resource, urlPath, payload) {
  const url = `${workerUrl}${urlPath}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Repo-Id": payload.meta?.scope?.repo_id ?? "unknown",
        "X-Machine-Id": payload.meta?.scope?.machine_id ?? "unknown",
        "X-Publisher-Surface":
          payload.meta?.publisher_surface ?? "local_runtime",
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return { resource, ok: res.ok, status: res.status, body };
  } catch (err) {
    return {
      resource,
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Publisher functions ───────────────────────────────────────────────────────

export async function publishSkillsList({
  workerUrl,
  token,
  scope,
  repoRoot = resolveRepoRoot(),
}) {
  const result = runScript(repoRoot, "ops/skill-stats.sh", []);
  const skills = parseSkillStatsOutput(result.output);
  const contractData = buildSkillsListContract(skills);
  return postSnapshot(workerUrl, token, "skills.list", "/v1/skills/publish", {
    data: contractData,
    meta: {
      ...freshnessMeta(scope),
      interpretation: contractData.interpretation,
    },
    summary: `skills.list: ${skills.length} skill(s)`,
  });
}

export async function publishToolingStatus({
  workerUrl,
  token,
  scope,
  repoRoot = resolveRepoRoot(),
}) {
  const result = runScript(repoRoot, "runtime/manifest.sh", ["status"]);
  return postSnapshot(
    workerUrl,
    token,
    "tooling.status",
    "/v1/tooling/status/publish",
    {
      data: { raw_output: result.output, success: result.success },
      meta: freshnessMeta(scope),
      summary: result.success
        ? "tooling.status: manifest loaded"
        : "tooling.status: script error",
    },
  );
}

export async function publishConfigSummary({
  workerUrl,
  token,
  scope,
  repoRoot = resolveRepoRoot(),
}) {
  const result = runScript(repoRoot, "shared/lib/config-merger.sh", []);
  return postSnapshot(
    workerUrl,
    token,
    "config.summary",
    "/v1/config/summary/publish",
    {
      data: { raw_output: result.output, success: result.success },
      meta: freshnessMeta(scope),
      summary: result.success
        ? "config.summary: config loaded"
        : "config.summary: script error",
    },
  );
}

export async function publishContextCost({
  workerUrl,
  token,
  scope,
  repoRoot = resolveRepoRoot(),
  threshold = 2000,
}) {
  const result = runScript(repoRoot, "ops/context-cost.sh", [
    "--threshold",
    String(threshold),
  ]);
  return postSnapshot(
    workerUrl,
    token,
    "runtime.context_cost",
    "/v1/runtime/context-cost/publish",
    {
      data: { raw_output: result.output, success: result.success, threshold },
      meta: freshnessMeta(scope),
      summary: result.success
        ? "runtime.context_cost: computed"
        : "runtime.context_cost: script error",
    },
  );
}

export async function publishAuditValidateAll({
  workerUrl,
  token,
  scope,
  repoRoot = resolveRepoRoot(),
}) {
  const result = runScript(repoRoot, "ops/validate-all.sh", []);
  return postSnapshot(
    workerUrl,
    token,
    "audit.validate_all",
    "/v1/audit/validate-all/publish",
    {
      data: { raw_output: result.output, success: result.success },
      meta: freshnessMeta(scope),
      summary: result.success
        ? "audit.validate_all: passed"
        : "audit.validate_all: failures detected",
    },
  );
}

export async function publishAnalyticsToolUsage({
  workerUrl,
  token,
  scope,
  repoRoot = resolveRepoRoot(),
}) {
  let contractData;
  try {
    const { events } = await loadObservationSnapshot({ projectDir: repoRoot });
    const metrics = events.filter((e) => e.type === "tool_usage");
    contractData = buildToolUsageContract(metrics);
  } catch {
    contractData = buildToolUsageContract([]);
  }
  return postSnapshot(
    workerUrl,
    token,
    "analytics.tool_usage",
    "/v1/analytics/tool-usage/publish",
    {
      data: contractData,
      meta: {
        ...freshnessMeta(scope),
        interpretation: contractData.interpretation,
      },
      summary: `analytics.tool_usage: ${contractData.total_events} event(s)`,
    },
  );
}

export async function publishAnalyticsSkillEffectiveness({
  workerUrl,
  token,
  scope,
  repoRoot = resolveRepoRoot(),
}) {
  let contractData;
  try {
    const { events } = await loadObservationSnapshot({
      home: process.env.HOME,
      projectDir: repoRoot,
    });
    const outcomeEvents = events.filter((e) => e.type === "skill_outcome");
    const totals = {};
    for (const e of outcomeEvents) {
      if (typeof e.skill !== "string") continue;
      if (!totals[e.skill]) totals[e.skill] = { used: 0, replaced: 0 };
      if (e.outcome === "output_used") totals[e.skill].used++;
      else if (e.outcome === "output_replaced") totals[e.skill].replaced++;
    }
    const skills = Object.entries(totals)
      .map(([skill, c]) => ({
        skill,
        used: c.used,
        replaced: c.replaced,
        total: c.used + c.replaced,
        use_rate:
          c.used + c.replaced > 0
            ? Math.round((c.used / (c.used + c.replaced)) * 100)
            : 0,
      }))
      .sort((a, b) => b.total - a.total);
    contractData = buildSkillEffectivenessContract(
      skills,
      outcomeEvents.length,
    );
  } catch {
    contractData = buildSkillEffectivenessContract([], 0);
  }
  return postSnapshot(
    workerUrl,
    token,
    "analytics.skill_effectiveness",
    "/v1/analytics/skill-effectiveness/publish",
    {
      data: contractData,
      meta: {
        ...freshnessMeta(scope),
        interpretation: contractData.interpretation,
      },
      summary: `analytics.skill_effectiveness: ${contractData.total_events} event(s)`,
    },
  );
}

export async function publishAnalyticsAutoresearchRuns({
  workerUrl,
  token,
  scope,
  repoRoot = resolveRepoRoot(),
}) {
  const runs = readAutoresearchRuns(repoRoot);
  const contractData = buildAutoresearchRunsContract(runs);
  return postSnapshot(
    workerUrl,
    token,
    "analytics.autoresearch_runs",
    "/v1/analytics/autoresearch-runs/publish",
    {
      data: contractData,
      meta: {
        ...freshnessMeta(scope),
        interpretation: contractData.interpretation,
      },
      summary: `analytics.autoresearch_runs: ${runs.length} run(s)`,
    },
  );
}

export async function publishAnalyticsFrictionSignals({
  workerUrl,
  token,
  scope,
}) {
  const emptyRetro = {
    artifact_count: 0,
    signal_breakdown: {},
    top_recommendations: [],
  };
  let retroSummary = emptyRetro;

  if (process.env.HOME) {
    const cacheFile = path.join(
      process.env.HOME,
      ".ai-config-os",
      "cache",
      "claude-code",
      "retrospectives-aggregate.json",
    );
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      retroSummary = {
        artifact_count:
          typeof data.artifact_count === "number" ? data.artifact_count : 0,
        signal_breakdown:
          data.signal_breakdown &&
          typeof data.signal_breakdown === "object" &&
          !Array.isArray(data.signal_breakdown)
            ? data.signal_breakdown
            : {},
        top_recommendations: Array.isArray(data.top_recommendations)
          ? data.top_recommendations
          : [],
      };
    } catch {
      // cache file absent or unreadable — use empty
    }
  }

  const contractData = buildFrictionSignalsContract(retroSummary);
  return postSnapshot(
    workerUrl,
    token,
    "analytics.friction_signals",
    "/v1/analytics/friction-signals/publish",
    {
      data: contractData,
      meta: {
        ...freshnessMeta(scope),
        interpretation: contractData.interpretation,
      },
      summary: `analytics.friction_signals: ${contractData.artifact_count} artifact(s)`,
    },
  );
}

// ── Publish-all orchestrator ──────────────────────────────────────────────────

export async function publishAll({
  workerUrl,
  token,
  scope,
  repoRoot = resolveRepoRoot(),
}) {
  const opts = { workerUrl, token, scope, repoRoot };
  const results = [];

  const publishers = [
    { name: "skills.list", fn: publishSkillsList },
    { name: "tooling.status", fn: publishToolingStatus },
    { name: "config.summary", fn: publishConfigSummary },
    { name: "runtime.context_cost", fn: publishContextCost },
    { name: "audit.validate_all", fn: publishAuditValidateAll },
    { name: "analytics.tool_usage", fn: publishAnalyticsToolUsage },
    {
      name: "analytics.skill_effectiveness",
      fn: publishAnalyticsSkillEffectiveness,
    },
    { name: "analytics.friction_signals", fn: publishAnalyticsFrictionSignals },
    {
      name: "analytics.autoresearch_runs",
      fn: publishAnalyticsAutoresearchRuns,
    },
  ];

  for (const { name, fn } of publishers) {
    try {
      const receipt = await fn(opts);
      results.push(receipt);
    } catch (err) {
      results.push({
        resource: name,
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
