/**
 * Execution Selection Diagnostic Sink
 *
 * Segregated diagnostic recording for ExecutionSelection observations.
 * Provides append-only JSONL recording with bounded diagnostic contract.
 * Enforces path safety and rejects full ExecutionSelection storage.
 *
 * Storage layout:
 * - ~/.ai-config-os/diagnostics/selections/{taskId}/{selectionRevision}.json
 * - Uses JSONL format for append-only immutability
 */

import { join, resolve, normalize } from "node:path";
import { homedir } from "node:os";
import {
  mkdirSync,
  appendFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import {
  computeSelectionDigest,
  computeSelectionRevision,
} from "./execution-selection-identity.mjs";

/**
 * Validate taskId for path safety.
 * Rejects path traversal attempts and invalid characters.
 * @private
 */
function validateTaskId(taskId) {
  if (typeof taskId !== "string" || taskId.trim().length === 0) {
    throw new Error("taskId must be a non-empty string");
  }
  if (taskId.includes("..") || taskId.includes("/") || taskId.includes("\\")) {
    throw new Error(`invalid task_id: path traversal detected in "${taskId}"`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
    throw new Error(`invalid task_id: "${taskId}" contains invalid characters`);
  }
}

/**
 * Validate selectionRevision for path safety.
 * Rejects path traversal attempts.
 * @private
 */
function validateSelectionRevision(selectionRevision) {
  if (typeof selectionRevision !== "string" || selectionRevision.length === 0) {
    throw new Error("selectionRevision must be a non-empty string");
  }
  if (
    selectionRevision.includes("..") ||
    selectionRevision.includes("/") ||
    selectionRevision.includes("\\")
  ) {
    throw new Error(
      `path traversal detected in selectionRevision: "${selectionRevision}"`
    );
  }
}

/**
 * Enforce path boundary to prevent directory traversal.
 * @private
 */
function enforcePathBoundary(filePath, baseDir) {
  const normalizedBase = normalize(resolve(baseDir));
  const normalizedFile = normalize(resolve(filePath));
  if (!normalizedFile.startsWith(normalizedBase)) {
    throw new Error(
      `path boundary violation: ${normalizedFile} is outside ${normalizedBase}`
    );
  }
}

/**
 * DiagnosticEntry structure for bounded diagnostic contract
 * @typedef {Object} DiagnosticEntry
 * @property {string} task_id - Task identifier
 * @property {string} selection_revision - Revision identifier (computed)
 * @property {string} capture_reason - One of: development, replay_validation, targeted_troubleshooting
 * @property {string} recorded_at - ISO8601 timestamp
 * @property {Array} route_candidate_summaries - Minimal route summaries
 * @property {Array} model_candidate_summaries - Minimal model summaries
 * @property {Object} selected_pair_summary - Summary of selected pair only
 */

/**
 * ExecutionSelectionDiagnosticSink
 * Records and retrieves ExecutionSelection diagnostics with bounded contract.
 */
export class ExecutionSelectionDiagnosticSink {
  constructor(baseDir = null) {
    if (baseDir === null) {
      const home = homedir();
      this.baseDir = join(home, ".ai-config-os", "diagnostics", "selections");
    } else {
      this.baseDir = baseDir;
    }

    // Ensure base directory exists
    mkdirSync(this.baseDir, { recursive: true });
  }

  /**
   * Record a selection decision with bounded diagnostic contract.
   *
   * @param {Object} executionSelection - The ExecutionSelection object
   * @param {Object} context - Selection context
   * @param {string} context.taskId - Task identifier
   * @param {string} context.selectionRevision - Selection revision identifier
   * @param {string} context.captureReason - One of: development, replay_validation, targeted_troubleshooting
   * @param {string} [context.timestamp] - ISO8601 timestamp (optional)
   * @param {Array} [context.routeCandidates] - Route candidates evaluated (optional)
   * @param {Array} [context.modelCandidates] - Model candidates evaluated (optional)
   * @throws {Error} If parameters are invalid or path safety checks fail
   */
  recordSelection(executionSelection, context) {
    if (!executionSelection || typeof executionSelection !== "object") {
      throw new Error("executionSelection must be a non-null object");
    }
    if (!context || typeof context !== "object") {
      throw new Error("context must be a non-null object");
    }

    // Validate task_id for path safety
    validateTaskId(context.taskId);

    // Validate selection_revision for path safety
    const selectionRevision =
      context.selectionRevision ||
      computeSelectionRevision(executionSelection);
    validateSelectionRevision(selectionRevision);

    // Validate capture_reason
    const allowedReasons = [
      "development",
      "replay_validation",
      "targeted_troubleshooting",
    ];
    if (!allowedReasons.includes(context.captureReason)) {
      throw new Error(
        `captureReason must be one of: ${allowedReasons.join(", ")}`
      );
    }

    const timestamp = context.timestamp || new Date().toISOString();

    // Build bounded diagnostic entry
    const routeCandidateSummaries = (context.routeCandidates || []).map(
      (route) => ({
        route_id: route.route_id,
        route_kind: route.route_kind,
      })
    );

    const modelCandidateSummaries = (context.modelCandidates || []).map(
      (model) => ({
        provider: model.provider,
        model_id: model.model_id,
        model_tier: model.model_tier,
        execution_mode: model.execution_mode,
        cost_basis: model.cost_basis,
        reliability_margin: model.reliability_margin,
        latency_risk: model.latency_risk,
      })
    );

    const entry = {
      task_id: context.taskId,
      selection_revision: selectionRevision,
      capture_reason: context.captureReason,
      recorded_at: timestamp,
      route_candidate_summaries: routeCandidateSummaries,
      model_candidate_summaries: modelCandidateSummaries,
      selected_pair_summary: {
        route_id: executionSelection.selected_route.route_id,
        route_kind: executionSelection.selected_route.route_kind,
        provider: executionSelection.resolved_model_path.provider,
        model_id: executionSelection.resolved_model_path.model_id,
        model_tier: executionSelection.resolved_model_path.model_tier,
        execution_mode: executionSelection.resolved_model_path.execution_mode,
      },
    };

    // Write to JSONL file with path boundary check
    const taskDir = join(this.baseDir, context.taskId);
    mkdirSync(taskDir, { recursive: true });

    const filePath = join(taskDir, `${selectionRevision}.jsonl`);
    enforcePathBoundary(filePath, this.baseDir);

    appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  }

  /**
   * Retrieve all selection history for a task
   *
   * @param {string} taskId - Task identifier
   * @returns {Array} Array of bounded diagnostic entries
   * @throws {Error} If taskId is invalid
   */
  retrieveSelectionHistory(taskId) {
    validateTaskId(taskId);

    const taskDir = join(this.baseDir, taskId);
    enforcePathBoundary(taskDir, this.baseDir);

    const entries = [];

    // Return empty array if task directory doesn't exist
    if (!existsSync(taskDir)) {
      return entries;
    }

    try {
      const files = readdirSync(taskDir);

      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;

        const filePath = join(taskDir, file);
        enforcePathBoundary(filePath, this.baseDir);

        try {
          const content = readFileSync(filePath, "utf8");
          const lines = content.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              entries.push(parsed);
            } catch {
              // Skip malformed lines
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Task directory unreadable — return empty array
    }

    return entries;
  }

  /**
   * Retrieve specific selection diagnostics
   *
   * @param {string} taskId - Task identifier
   * @param {string} selectionRevision - Selection revision identifier
   * @returns {Object} Aggregated diagnostic data for the selection
   * @throws {Error} If parameters are invalid or path safety checks fail
   */
  retrieveSelectionDiagnostics(taskId, selectionRevision) {
    validateTaskId(taskId);
    validateSelectionRevision(selectionRevision);

    const filePath = join(this.baseDir, taskId, `${selectionRevision}.jsonl`);
    enforcePathBoundary(filePath, this.baseDir);

    const diagnostics = {
      selection_revision: selectionRevision,
      task_id: taskId,
      entries: [],
    };

    // Return empty diagnostics if file doesn't exist
    if (!existsSync(filePath)) {
      return diagnostics;
    }

    try {
      const content = readFileSync(filePath, "utf8");
      const lines = content.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          diagnostics.entries.push(parsed);
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // File unreadable — return partial diagnostics
    }

    return diagnostics;
  }
}
