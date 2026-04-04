/**
 * Execution Selection Diagnostic Sink
 *
 * Segregated diagnostic recording for ExecutionSelection observations.
 * Provides append-only JSONL recording and retrieval for selection decisions,
 * evaluation outcomes, and aggregated diagnostics.
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
 * DiagnosticEntry structure for serialization
 * @typedef {Object} DiagnosticEntry
 * @property {string} selection_digest - Canonical digest of ExecutionSelection
 * @property {string} selection_revision - Revision identifier (computed)
 * @property {string} task_id - Task identifier
 * @property {string} recorded_at - ISO8601 timestamp
 * @property {Object} execution_selection - The full ExecutionSelection object
 * @property {Object} evaluation - Evaluation metrics and outcomes
 * @property {number} evaluation.routes_evaluated - Number of routes considered
 * @property {number} evaluation.models_considered - Number of models considered
 * @property {number} evaluation.routes_admitted - Number of routes passing constraints
 * @property {number} evaluation.models_admitted - Number of models passing constraints
 * @property {number} evaluation.duration_ms - Time spent on evaluation
 * @property {string} evaluation.reason - Narrative reason for selection
 * @property {Object} metadata - Additional context and policy state
 * @property {Object} metadata.policy_intent - Policy constraints that drove selection
 * @property {Object} metadata.route_compatibility_projection - Route capability matrix
 * @property {string} metadata.fallback_policy - Fallback policy applied
 */

/**
 * Validate taskId for path safety.
 * Rejects path traversal attempts and invalid characters.
 * @param {string} taskId
 * @throws {Error} If taskId contains path traversal or invalid characters
 */
function validateTaskId(taskId) {
  if (typeof taskId !== "string" || taskId.trim().length === 0) {
    throw new Error("taskId must be a non-empty string");
  }
  // Reject path traversal attempts
  if (taskId.includes("..") || taskId.includes("/") || taskId.includes("\\")) {
    throw new Error(
      `invalid task_id: path traversal detected in "${taskId}"`,
    );
  }
  // Allow only alphanumeric, hyphen, underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
    throw new Error(
      `invalid task_id: "${taskId}" contains invalid characters`,
    );
  }
}

/**
 * Validate selectionRevision for path safety.
 * Ensures it stays within the task directory.
 * @param {string} selectionRevision
 * @throws {Error} If selectionRevision contains path traversal
 */
function validateSelectionRevision(selectionRevision) {
  if (typeof selectionRevision !== "string" || selectionRevision.length === 0) {
    throw new Error("selectionRevision must be a non-empty string");
  }
  // Reject path traversal attempts
  if (
    selectionRevision.includes("..") ||
    selectionRevision.includes("/") ||
    selectionRevision.includes("\\")
  ) {
    throw new Error(
      `path traversal detected in selectionRevision: "${selectionRevision}"`,
    );
  }
}

/**
 * Verify file path stays within base directory.
 * @param {string} filePath - Resolved file path
 * @param {string} baseDir - Base directory
 * @throws {Error} If filePath is outside baseDir
 */
function enforcePathBoundary(filePath, baseDir) {
  const normalizedBase = normalize(resolve(baseDir));
  const normalizedFile = normalize(resolve(filePath));
  if (!normalizedFile.startsWith(normalizedBase)) {
    throw new Error(
      `path boundary violation: ${normalizedFile} is outside ${normalizedBase}`,
    );
  }
}

/**
 * ExecutionSelectionDiagnosticSink
 * Records and retrieves ExecutionSelection decisions with bounded diagnostic contract.
 */
export class ExecutionSelectionDiagnosticSink {
  /**
   * Create a diagnostic sink for ExecutionSelection observations
   * @param {string} [baseDir] - Base directory for diagnostic storage
   *                            Defaults to ~/.ai-config-os/diagnostics/selections/
   */
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
   * Stores only:
   * - task_id
   * - selection_revision
   * - capture_reason (one of: development, replay_validation, targeted_troubleshooting)
   * - recorded_at
   * - route_candidate_summaries
   * - model_candidate_summaries (max 3, admissible only)
   * - selected_pair_summary
   *
   * Does NOT store:
   * - Full execution_selection
   * - Prose selection_reason
   * - Rejected candidates
   * - Runtime failure details
   *
   * @param {Object} executionSelection - The ExecutionSelection object
   * @param {Object} context - Selection context
   * @param {string} context.taskId - Task identifier
   * @param {string} context.taskType - Type of task (required but not stored)
   * @param {string} context.timestamp - ISO8601 timestamp
   * @param {string} context.reason - capture_reason (development, replay_validation, or targeted_troubleshooting)
   * @throws {Error} If write fails or parameters are invalid
   */
  recordSelection(executionSelection, context) {
    if (!executionSelection || typeof executionSelection !== "object") {
      throw new Error("executionSelection must be a non-null object");
    }
    if (!context || typeof context !== "object") {
      throw new Error("context must be a non-null object");
    }

    // Validate taskId for path safety
    validateTaskId(context.taskId);

    const selectionDigest = computeSelectionDigest(executionSelection);
    const selectionRevision = computeSelectionRevision(executionSelection);

    // Validate selectionRevision for path safety
    validateSelectionRevision(selectionRevision);

    const timestamp = context.timestamp || new Date().toISOString();
    const captureReason = context.reason || "development";

    // Validate captureReason is one of the allowed values
    const ALLOWED_CAPTURE_REASONS = [
      "development",
      "replay_validation",
      "targeted_troubleshooting",
    ];
    if (!ALLOWED_CAPTURE_REASONS.includes(captureReason)) {
      throw new Error(
        `invalid capture_reason: "${captureReason}". Must be one of: ${ALLOWED_CAPTURE_REASONS.join(", ")}`,
      );
    }

    // Build bounded diagnostic entry (NO full executionSelection, NO prose reason)
    const entry = {
      task_id: context.taskId,
      selection_revision: selectionRevision,
      capture_reason: captureReason,
      recorded_at: timestamp,
      route_candidate_summaries: [
        {
          route_id: executionSelection.selected_route?.route_id,
          route_kind: executionSelection.selected_route?.route_kind,
        },
      ],
      model_candidate_summaries: [
        {
          provider: executionSelection.resolved_model_path?.provider,
          model_id: executionSelection.resolved_model_path?.model_id,
          model_tier: executionSelection.resolved_model_path?.model_tier,
          execution_mode: executionSelection.resolved_model_path?.execution_mode,
          cost_basis: "standard",
          reliability_margin: "baseline",
          latency_risk: "low",
        },
      ],
      selected_pair_summary: {
        route_id: executionSelection.selected_route?.route_id,
        route_kind: executionSelection.selected_route?.route_kind,
        provider: executionSelection.resolved_model_path?.provider,
        model_id: executionSelection.resolved_model_path?.model_id,
        model_tier: executionSelection.resolved_model_path?.model_tier,
        execution_mode: executionSelection.resolved_model_path?.execution_mode,
      },
    };

    // Write to JSONL file with path safety checks
    const taskDir = join(this.baseDir, context.taskId);
    enforcePathBoundary(taskDir, this.baseDir);

    mkdirSync(taskDir, { recursive: true });

    const filePath = join(taskDir, `${selectionRevision}.jsonl`);
    enforcePathBoundary(filePath, this.baseDir);

    appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  }

  /**
   * Record evaluation outcome for a selection
   *
   * @param {Object} executionSelection - The ExecutionSelection object
   * @param {Object} evaluationResult - Evaluation metrics
   * @param {boolean} evaluationResult.success - Whether selection succeeded
   * @param {number} evaluationResult.duration_ms - Time spent evaluating
   * @param {number} evaluationResult.routes_evaluated - Routes considered
   * @param {number} evaluationResult.models_considered - Models considered
   * @param {number} [evaluationResult.routes_admitted] - Routes passing constraints
   * @param {number} [evaluationResult.models_admitted] - Models passing constraints
   * @param {string} evaluationResult.taskId - Task identifier
   * @throws {Error} If write fails or parameters are invalid
   */
  recordSelectionEvaluation(executionSelection, evaluationResult) {
    if (!executionSelection || typeof executionSelection !== "object") {
      throw new Error("executionSelection must be a non-null object");
    }
    if (!evaluationResult || typeof evaluationResult !== "object") {
      throw new Error("evaluationResult must be a non-null object");
    }
    if (typeof evaluationResult.taskId !== "string") {
      throw new Error("evaluationResult.taskId is required");
    }

    const selectionRevision = computeSelectionRevision(executionSelection);
    const timestamp = evaluationResult.timestamp || new Date().toISOString();

    const entry = {
      selection_revision: selectionRevision,
      task_id: evaluationResult.taskId,
      recorded_at: timestamp,
      type: "evaluation_result",
      evaluation: {
        success: evaluationResult.success,
        duration_ms: evaluationResult.duration_ms,
        routes_evaluated: evaluationResult.routes_evaluated,
        models_considered: evaluationResult.models_considered,
        routes_admitted: evaluationResult.routes_admitted || 0,
        models_admitted: evaluationResult.models_admitted || 0,
        reason: evaluationResult.reason || "evaluation_recorded",
      },
    };

    // Append to existing selection file
    const taskDir = join(this.baseDir, evaluationResult.taskId);
    mkdirSync(taskDir, { recursive: true });

    const filePath = join(taskDir, `${selectionRevision}.jsonl`);
    appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  }

  /**
   * Retrieve all selection history for a task
   *
   * @param {string} taskId - Task identifier
   * @returns {Array<DiagnosticEntry>} Array of diagnostic entries
   * @throws {Error} If task directory doesn't exist
   */
  retrieveSelectionHistory(taskId) {
    if (typeof taskId !== "string" || taskId.trim().length === 0) {
      throw new Error("taskId is required");
    }

    const taskDir = join(this.baseDir, taskId);
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
   * @throws {Error} If parameters are invalid
   */
  retrieveSelectionDiagnostics(taskId, selectionRevision) {
    if (typeof taskId !== "string" || taskId.trim().length === 0) {
      throw new Error("taskId is required");
    }
    if (
      typeof selectionRevision !== "string" ||
      selectionRevision.trim().length === 0
    ) {
      throw new Error("selectionRevision is required");
    }

    const filePath = join(this.baseDir, taskId, `${selectionRevision}.jsonl`);
    const diagnostics = {
      selection_revision: selectionRevision,
      task_id: taskId,
      entries: [],
      summary: {
        total_entries: 0,
        selection_entry: null,
        evaluations: [],
      },
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
          diagnostics.summary.total_entries++;

          // Categorize by type
          if (parsed.type === "evaluation_result") {
            diagnostics.summary.evaluations.push(parsed.evaluation);
          } else if (!parsed.type || parsed.type === "selection") {
            diagnostics.summary.selection_entry = parsed;
          }
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
