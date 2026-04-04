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
   * @param {Array<Object>} observations - Array of bounded diagnostic entries
   * @returns {Object} Summary metrics
   *
   * Derives from bounded diagnostic contract:
   *   - total_selections: count of bounded diagnostic entries
   *   - selection_stability: rate of selection_revision changes per 10 events
   *   - routes_used: distribution of selected route_ids
   *   - route_diversity: count of distinct selected route_ids
   *   - models_used: distribution of selected model_ids
   *   - model_diversity: count of distinct selected model_ids
   *   - routes_admitted_rate: avg(1 / route_candidate_summaries.length)
   *   - models_admitted_rate: avg(1 / model_candidate_summaries.length)
   *   - most_selected_route: most frequent selected route_id
   *   - most_selected_route_count: count for that route
   *   - most_used_model: most frequent selected model_id
   *   - most_used_model_count: count for that model
   *   - avg_evaluation_time_ms: 0 (bounded sink does not store evaluation times)
   *   - fallback_usage_rate: 0 (bounded sink does not store fallback chains)
   *   - total_evaluations: 0 (bounded sink stores only selections, no separate evaluation entries)
   */
  summarize(observations) {
    if (!Array.isArray(observations)) {
      return this._emptySelectionSummary();
    }

    // Process bounded diagnostic entries.
    // Each entry represents one selection observation.
    const routeDistribution = new Map();
    const modelDistribution = new Map();
    const routesAdmittedRatios = [];
    const modelsAdmittedRatios = [];
    let previousRevision = null;
    let revisionChangeCount = 0;

    for (const entry of observations) {
      // Skip malformed entries without selected_pair_summary
      if (!entry.selected_pair_summary) continue;

      const selectedPair = entry.selected_pair_summary;

      // Track routes from selected pair
      if (selectedPair.route_id) {
        const routeId = selectedPair.route_id;
        routeDistribution.set(
          routeId,
          (routeDistribution.get(routeId) || 0) + 1,
        );
      }

      // Track models from selected pair
      if (selectedPair.model_id) {
        const modelId = selectedPair.model_id;
        modelDistribution.set(
          modelId,
          (modelDistribution.get(modelId) || 0) + 1,
        );
      }

      // Track selection_revision changes for stability metric
      if (previousRevision && previousRevision !== entry.selection_revision) {
        revisionChangeCount++;
      }
      previousRevision = entry.selection_revision;

      // Compute routes_admitted_rate as 1 / candidate count (bounded contract approximation)
      // Numerator is always 1 (one selected route per entry)
      // Denominator is route_candidate_summaries.length
      if (
        entry.route_candidate_summaries &&
        entry.route_candidate_summaries.length > 0
      ) {
        routesAdmittedRatios.push(1 / entry.route_candidate_summaries.length);
      }

      // Compute models_admitted_rate as 1 / candidate count (bounded contract approximation)
      // Numerator is always 1 (one selected model per entry)
      // Denominator is model_candidate_summaries.length
      if (
        entry.model_candidate_summaries &&
        entry.model_candidate_summaries.length > 0
      ) {
        modelsAdmittedRatios.push(1 / entry.model_candidate_summaries.length);
      }
    }

    // Count total observations (selections)
    const totalSelections = observations.filter(
      (e) => e.selected_pair_summary,
    ).length;

    // Compute average admission rates
    const avgRoutesAdmitted =
      routesAdmittedRatios.length > 0
        ? routesAdmittedRatios.reduce((a, b) => a + b, 0) /
          routesAdmittedRatios.length
        : 0;

    const avgModelsAdmitted =
      modelsAdmittedRatios.length > 0
        ? modelsAdmittedRatios.reduce((a, b) => a + b, 0) /
          modelsAdmittedRatios.length
        : 0;

    // Selection stability: revision changes per 10 events
    // (bounded contract approximation using revision changes instead of digest changes)
    const selectionStability =
      totalSelections > 0
        ? (revisionChangeCount / Math.max(1, totalSelections - 1)) * 10
        : 0;

    // Find most used route and model
    const mostSelectedRoute = Array.from(routeDistribution.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0] || [null, 0];

    const mostUsedModel = Array.from(modelDistribution.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0] || [null, 0];

    return {
      total_selections: totalSelections,
      selection_stability: Math.round(selectionStability * 100) / 100,
      routes_used: Object.fromEntries(routeDistribution),
      route_diversity: routeDistribution.size,
      models_used: Object.fromEntries(modelDistribution),
      model_diversity: modelDistribution.size,
      avg_evaluation_time_ms: 0,
      fallback_usage_rate: 0,
      routes_admitted_rate: Math.round(avgRoutesAdmitted * 1000) / 1000,
      models_admitted_rate: Math.round(avgModelsAdmitted * 1000) / 1000,
      most_selected_route: mostSelectedRoute[0],
      most_selected_route_count: mostSelectedRoute[1],
      most_used_model: mostUsedModel[0],
      most_used_model_count: mostUsedModel[1],
      total_evaluations: 0,
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
      avg_evaluation_time_ms: 0,
      fallback_usage_rate: 0,
      routes_admitted_rate: 0,
      models_admitted_rate: 0,
      most_selected_route: null,
      most_selected_route_count: 0,
      most_used_model: null,
      most_used_model_count: 0,
      total_evaluations: 0,
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
