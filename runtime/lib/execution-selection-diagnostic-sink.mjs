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

import { join } from "node:path";
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
 * ExecutionSelectionDiagnosticSink
 * Records and retrieves ExecutionSelection decisions and evaluation outcomes.
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
   * Record a selection decision
   *
   * @param {Object} executionSelection - The ExecutionSelection object
   * @param {Object} context - Selection context
   * @param {string} context.taskId - Task identifier
   * @param {string} context.taskType - Type of task (e.g., "research", "implementation")
   * @param {string} context.timestamp - ISO8601 timestamp
   * @param {string} context.reason - Why this selection was made
   * @throws {Error} If write fails or parameters are invalid
   */
  recordSelection(executionSelection, context) {
    if (!executionSelection || typeof executionSelection !== "object") {
      throw new Error("executionSelection must be a non-null object");
    }
    if (!context || typeof context !== "object") {
      throw new Error("context must be a non-null object");
    }
    if (typeof context.taskId !== "string" || context.taskId.trim().length === 0) {
      throw new Error("context.taskId is required");
    }

    const selectionDigest = computeSelectionDigest(executionSelection);
    const selectionRevision = computeSelectionRevision(executionSelection);
    const timestamp = context.timestamp || new Date().toISOString();

    const entry = {
      selection_digest: selectionDigest,
      selection_revision: selectionRevision,
      task_id: context.taskId,
      recorded_at: timestamp,
      execution_selection: executionSelection,
      evaluation: {
        routes_evaluated: 0,
        models_considered: 0,
        routes_admitted: 0,
        models_admitted: 0,
        duration_ms: 0,
        reason: context.reason || "selection_recorded",
      },
      metadata: {
        policy_intent: executionSelection.selection_basis || {},
        route_compatibility_projection: executionSelection.selected_route
          ?.effective_capabilities || {},
        fallback_policy: executionSelection.fallback_chain
          ? executionSelection.fallback_chain[0]?.policy || "standard"
          : "standard",
      },
    };

    // Write to JSONL file
    const taskDir = join(this.baseDir, context.taskId);
    mkdirSync(taskDir, { recursive: true });

    const filePath = join(taskDir, `${selectionRevision}.jsonl`);
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
    if (typeof selectionRevision !== "string" || selectionRevision.trim().length === 0) {
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
