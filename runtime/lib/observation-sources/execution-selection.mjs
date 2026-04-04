/**
 * Execution Selection Observation Source
 *
 * ObservationSource adapter for aggregating ExecutionSelection diagnostics.
 * Loads selection decisions and evaluations from the diagnostic sink,
 * then generates summary statistics for observation aggregation.
 *
 * Implements the ObservationSource interface:
 * - loadObservations(taskId): Array<DiagnosticEntry>
 * - summarize(observations): Object with aggregated metrics
 */

import { ExecutionSelectionDiagnosticSink } from "../execution-selection-diagnostic-sink.mjs";

/**
 * Execution Selection Observation Source
 * Reads diagnostic data and generates observation summary metrics.
 */
export class ExecutionSelectionObservationSource {
  constructor(diagnosticSinkBaseDir = null) {
    this.sink = new ExecutionSelectionDiagnosticSink(diagnosticSinkBaseDir);
  }

  /**
   * Load all observations (diagnostic entries) for a task
   *
   * @param {string} taskId - Task identifier
   * @returns {Array<Object>} Array of diagnostic entries
   */
  loadObservations(taskId) {
    return this.sink.retrieveSelectionHistory(taskId);
  }

  /**
   * Summarize observations into actionable metrics
   *
   * @param {Array<Object>} observations - Array of diagnostic entries
   * @returns {Object} Summary metrics
   *
   * @returns {Object} Summary with:
   *   - total_selections: number of selection decisions made
   *   - selection_stability: rate of digest changes per 10 events
   *   - routes_used: distribution of routes selected
   *   - model_diversity: count and types of models used
   *   - avg_evaluation_time_ms: average evaluation duration
   *   - fallback_usage_rate: percentage using fallback chains
   *   - models_admitted_rate: percentage of candidate models passing constraints
   *   - routes_admitted_rate: percentage of candidate routes passing constraints
   *   - most_selected_route: most frequently selected route_id
   *   - most_used_model: most frequently used model
   */
  summarize(observations) {
    if (!Array.isArray(observations)) {
      return this._emptySelectionSummary();
    }

    const selectionEntries = observations.filter(
      (o) => !o.type || o.type === "selection",
    );
    const evaluationEntries = observations.filter(
      (o) => o.type === "evaluation_result",
    );

    // Build selection distribution from bounded diagnostic entries
    const routeDistribution = new Map();
    const modelDistribution = new Map();
    const digestToRevision = new Map();
    let previousDigest = null;
    let digestChangeCount = 0;
    let fallbackUsageCount = 0;

    // Process selection entries (now using bounded contract)
    for (const entry of selectionEntries) {
      // Work with bounded diagnostic structure
      if (!entry.selected_pair_summary) continue;

      // Track digest changes
      if (previousDigest && previousDigest !== entry.selection_revision) {
        digestChangeCount++;
      }
      previousDigest = entry.selection_revision;
      digestToRevision.set(entry.selection_revision, entry.selection_revision);

      // Extract from bounded selected_pair_summary
      const { route_id, model_id } = entry.selected_pair_summary;

      // Track routes
      if (route_id) {
        routeDistribution.set(
          route_id,
          (routeDistribution.get(route_id) || 0) + 1,
        );
      }

      // Track models
      if (model_id) {
        modelDistribution.set(
          model_id,
          (modelDistribution.get(model_id) || 0) + 1,
        );
      }

      // Note: fallback_chain info not available in bounded contract
      // This metric is not computable from the current design
    }

    // Compute stability metric from bounded diagnostic entries
    const selectionStability =
      selectionEntries.length > 0
        ? 1 - digestChangeCount / Math.max(1, selectionEntries.length - 1)
        : 1;

    // Find most used route and model
    const mostSelectedRoute = Array.from(routeDistribution.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0] || [null, 0];

    const mostUsedModel = Array.from(modelDistribution.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0] || [null, 0];

    // Return only metrics computable from bounded diagnostic contract
    return {
      total_selections: selectionEntries.length,
      selection_stability: Math.round(selectionStability * 100) / 100,
      routes_used: Object.fromEntries(routeDistribution),
      route_diversity: routeDistribution.size,
      models_used: Object.fromEntries(modelDistribution),
      model_diversity: modelDistribution.size,
      most_selected_route: mostSelectedRoute[0],
      most_selected_route_count: mostSelectedRoute[1],
      most_used_model: mostUsedModel[0],
      most_used_model_count: mostUsedModel[1],
    };
  }

  /**
   * Generate empty summary for no observations
   * @private
   */
  _emptySelectionSummary() {
    return {
      total_selections: 0,
      selection_stability: 0,
      routes_used: {},
      route_diversity: 0,
      models_used: {},
      model_diversity: 0,
      most_selected_route: null,
      most_selected_route_count: 0,
      most_used_model: null,
      most_used_model_count: 0,
    };
  }
}

/**
 * Factory function for creating ExecutionSelectionObservationSource
 * @param {string} [diagnosticSinkBaseDir] - Base directory for diagnostic storage
 * @returns {ExecutionSelectionObservationSource}
 */
export function createExecutionSelectionObservationSource(
  diagnosticSinkBaseDir = null,
) {
  return new ExecutionSelectionObservationSource(diagnosticSinkBaseDir);
}
