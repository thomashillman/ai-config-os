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

    // Build selection distribution
    const routeDistribution = new Map();
    const modelDistribution = new Map();
    const digestToRevision = new Map();
    let previousDigest = null;
    let digestChangeCount = 0;
    const evaluationTimes = [];
    const routesAdmittedRatios = [];
    const modelsAdmittedRatios = [];
    let fallbackUsageCount = 0;

    // Process selection entries
    for (const entry of selectionEntries) {
      if (!entry.execution_selection) continue;

      const { selected_route, resolved_model_path, fallback_chain } =
        entry.execution_selection;
      const { selection_digest } = entry;

      // Track digest changes
      if (previousDigest && previousDigest !== selection_digest) {
        digestChangeCount++;
      }
      previousDigest = selection_digest;
      digestToRevision.set(selection_digest, entry.selection_revision);

      // Track routes
      if (selected_route && selected_route.route_id) {
        const routeId = selected_route.route_id;
        routeDistribution.set(
          routeId,
          (routeDistribution.get(routeId) || 0) + 1,
        );
      }

      // Track models
      if (resolved_model_path && resolved_model_path.model_id) {
        const modelId = resolved_model_path.model_id;
        modelDistribution.set(
          modelId,
          (modelDistribution.get(modelId) || 0) + 1,
        );
      }

      // Track fallback usage
      if (fallback_chain && fallback_chain.length > 0) {
        fallbackUsageCount++;
      }
    }

    // Process evaluation entries
    for (const entry of evaluationEntries) {
      if (!entry.evaluation) continue;

      const {
        duration_ms,
        routes_evaluated,
        models_considered,
        routes_admitted,
        models_admitted,
      } = entry.evaluation;

      if (duration_ms !== undefined) {
        evaluationTimes.push(duration_ms);
      }

      if (
        routes_evaluated !== undefined &&
        routes_admitted !== undefined &&
        routes_evaluated > 0
      ) {
        routesAdmittedRatios.push(routes_admitted / routes_evaluated);
      }

      if (
        models_considered !== undefined &&
        models_admitted !== undefined &&
        models_considered > 0
      ) {
        modelsAdmittedRatios.push(models_admitted / models_considered);
      }
    }

    // Compute averages and rates
    const avgEvaluationTime =
      evaluationTimes.length > 0
        ? Math.round(
            evaluationTimes.reduce((a, b) => a + b, 0) / evaluationTimes.length,
          )
        : 0;

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

    const fallbackUsageRate =
      selectionEntries.length > 0
        ? fallbackUsageCount / selectionEntries.length
        : 0;

    // Selection stability: digest changes per 10 events
    const selectionStability =
      selectionEntries.length > 0
        ? (digestChangeCount / Math.max(1, selectionEntries.length - 1)) * 10
        : 0;

    // Find most used route and model
    const mostSelectedRoute = Array.from(routeDistribution.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0] || [null, 0];

    const mostUsedModel = Array.from(modelDistribution.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0] || [null, 0];

    return {
      total_selections: selectionEntries.length,
      selection_stability: Math.round(selectionStability * 100) / 100,
      routes_used: Object.fromEntries(routeDistribution),
      route_diversity: routeDistribution.size,
      models_used: Object.fromEntries(modelDistribution),
      model_diversity: modelDistribution.size,
      avg_evaluation_time_ms: avgEvaluationTime,
      fallback_usage_rate: Math.round(fallbackUsageRate * 1000) / 1000,
      routes_admitted_rate: Math.round(avgRoutesAdmitted * 1000) / 1000,
      models_admitted_rate: Math.round(avgModelsAdmitted * 1000) / 1000,
      most_selected_route: mostSelectedRoute[0],
      most_selected_route_count: mostSelectedRoute[1],
      most_used_model: mostUsedModel[0],
      most_used_model_count: mostUsedModel[1],
      total_evaluations: evaluationEntries.length,
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
