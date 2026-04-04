/**
 * Observation read model: unified loader and summarizer
 *
 * Two complementary functions:
 * 1. loadObservationSnapshot: reads raw observations from disk (bootstrap telemetry, tool usage)
 * 2. summarizeObservations: computes engagement metrics from Momentum observer events in ProgressEventStore
 */

import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { loadToolUsageObservations } from "./observation-sources/tool-usage.mjs";
import { loadExecutionResourceObservations } from "./observation-sources/execution-resource.mjs";
import { readSkillOutcomes } from "./observation-sources/skill-outcomes.mjs";
import { mapRetrospectiveToObservations } from "./observation-sources/retrospectives.mjs";
import { createExecutionSelectionObservationSource } from "./observation-sources/execution-selection.mjs";

/**
 * Load observation snapshot from all available sources
 *
 * @param {Object} options
 * @param {string} options.home - home directory to search in
 * @param {number} [options.limit=1000] - maximum number of events to return
 * @returns {Promise<{events: Array, summary: Object}>}
 */
export async function loadObservationSnapshot(options = {}) {
  const {
    home = process.env.HOME || "/root",
    projectDir = process.cwd(),
    limit = 1000,
    retrospectivesDir,
  } = options;
  const logsDir = join(home, ".ai-config-os", "logs");

  const events = [];
  const summary = {
    total_events: 0,
    tool_usage_count: 0,
    tool_error_count: 0,
    skill_outcome_count: 0,
    execution_resource_count: 0,
    bootstrap_success_count: 0,
    bootstrap_error_count: 0,
    loop_suspected_count: 0,
    execution_selection_count: 0,
  };

  // Load bootstrap telemetry events
  try {
    const logFiles = readdirSync(logsDir);

    for (const file of logFiles) {
      if (!file.endsWith(".jsonl")) continue;

      const filePath = join(logsDir, file);
      const content = readFileSync(filePath, "utf8");
      const lines = content.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        if (events.length >= limit) break;

        try {
          const parsed = JSON.parse(line);
          const event = normalizeEvent(parsed, file);
          events.push(event);
          updateSummary(summary, event);
        } catch (err) {
          // Skip malformed lines
        }
      }

      if (events.length >= limit) break;
    }
  } catch (err) {
    // Logs directory doesn't exist or is unreadable — continue to next sources
  }

  // Load tool usage observations
  if (events.length < limit) {
    const toolEvents = await loadToolUsageObservations({
      projectDir,
      limit: limit - events.length,
    });

    for (const event of toolEvents) {
      if (events.length >= limit) break;
      events.push(event);
      updateSummary(summary, event);
    }
  }

  // Load skill outcome observations
  if (events.length < limit) {
    const skillOutcomesFile = join(
      home,
      ".claude",
      "skill-analytics",
      "skill-outcomes.jsonl",
    );
    const outcomeEvents = readSkillOutcomes(skillOutcomesFile, {
      maxBytes: 5 * 1024 * 1024,
    });
    for (const event of outcomeEvents) {
      if (events.length >= limit) break;
      events.push(event);
      updateSummary(summary, event);
    }
  }

  // Execution resource telemetry (resource policy / Atom 5)
  if (events.length < limit) {
    const execEvents = loadExecutionResourceObservations({
      home,
      limit: limit - events.length,
    });
    for (const event of execEvents) {
      if (events.length >= limit) break;
      events.push(event);
      updateSummary(summary, event);
    }
  }

  // Load retrospective observations from local cache directory (if provided)
  if (retrospectivesDir && events.length < limit) {
    try {
      const files = readdirSync(retrospectivesDir).filter((f) =>
        f.endsWith(".json"),
      );
      for (const file of files) {
        if (events.length >= limit) break;
        try {
          const artifact = JSON.parse(
            readFileSync(join(retrospectivesDir, file), "utf-8"),
          );
          const id = file.replace(/\.json$/, "");
          const mapped = mapRetrospectiveToObservations({
            retrospectiveId: id,
            artifact,
          });
          for (const event of mapped) {
            if (events.length >= limit) break;
            events.push(event);
            updateSummary(summary, event);
          }
        } catch {
          // Skip malformed or unreadable artifact files
        }
      }
    } catch {
      // retrospectivesDir missing or unreadable — continue silently
    }
  }

  // Load execution selection observations (if taskId provided)
  // This is typically used for task-specific diagnostic aggregation
  if (options.taskId && events.length < limit) {
    try {
      const executionSelectionSource =
        createExecutionSelectionObservationSource(
          home
            ? join(home, ".ai-config-os", "diagnostics", "selections")
            : undefined,
        );
      const selectionObservations = executionSelectionSource.loadObservations(
        options.taskId,
      );
      for (const event of selectionObservations) {
        if (events.length >= limit) break;
        const normalized = {
          type: "execution_selection",
          ...event,
        };
        events.push(normalized);
        updateSummary(summary, normalized);
      }
    } catch {
      // Execution selection diagnostics unavailable — continue silently
    }
  }

  summary.total_events = events.length;
  return { events, summary };
}

/**
 * Normalize raw event data into standard event format
 * @private
 */
function normalizeEvent(raw, fileName) {
  // Bootstrap telemetry events
  if (fileName.startsWith("bootstrap-")) {
    return {
      type: "bootstrap_phase",
      phase: raw.phase,
      provider: raw.provider,
      duration_ms: raw.duration_ms,
      result: raw.result,
      error_code: raw.error_code,
      deferred: raw.deferred,
    };
  }

  // Default: pass through as-is
  return raw;
}

/**
 * Update summary counts based on event type/content
 * @private
 */
function updateSummary(summary, event) {
  if (event.type === "bootstrap_phase") {
    if (event.result === "ok") {
      summary.bootstrap_success_count++;
    } else if (event.result === "error") {
      summary.bootstrap_error_count++;
    }
  } else if (event.type === "tool_usage") {
    summary.tool_usage_count++;
    if (event.status === "error") {
      summary.tool_error_count++;
    }
  } else if (event.type === "skill_outcome") {
    summary.skill_outcome_count++;
  } else if (event.type === "execution_resource") {
    summary.execution_resource_count++;
  } else if (event.type === "execution_selection") {
    summary.execution_selection_count++;
  }
}

/**
 * Summarize observations for a task, computing engagement and upgrade metrics.
 *
 * @param {object} deps
 * @param {ProgressEventStore} deps.store - ProgressEventStore instance
 * @param {string} deps.taskId - Task to summarize
 * @returns {object} Summary with narration_engagement_rate and upgrade_acceptance_rate
 */
export function summarizeObservations({ store, taskId } = {}) {
  if (!store || !taskId) {
    throw new Error("store and taskId are required");
  }

  const events = store.listByTaskId(taskId) || [];

  // Separate narrations and responses
  const narrations = events.filter((e) => e.type === "narration_shown");
  const responses = events.filter((e) => e.type === "user_response");

  // Engagement rate: across all narrations
  const totalNarrations = narrations.length;
  const engagedCount = responses.filter(
    (r) => r.metadata?.response_type === "engaged",
  ).length;

  // Upgrade acceptance rate: only onUpgradeAvailable narrations
  const upgradeNarrations = narrations.filter(
    (n) => n.metadata?.narration_point === "onUpgradeAvailable",
  );
  const totalUpgradeProposals = upgradeNarrations.length;

  const acceptedUpgrades = responses.filter((r) => {
    if (r.metadata?.response_type !== "accepted_upgrade") {
      return false;
    }
    // Check if this response links to an upgrade narration
    const linkedNarration = upgradeNarrations.find(
      (n) => n.event_id === r.metadata?.narration_event_id,
    );
    return !!linkedNarration;
  }).length;

  return {
    total_narrations: totalNarrations,
    total_engaged: engagedCount,
    narration_engagement_rate:
      totalNarrations > 0 ? engagedCount / totalNarrations : 0,
    total_upgrade_proposals: totalUpgradeProposals,
    total_upgrades_accepted: acceptedUpgrades,
    upgrade_acceptance_rate:
      totalUpgradeProposals > 0 ? acceptedUpgrades / totalUpgradeProposals : 0,
  };
}
