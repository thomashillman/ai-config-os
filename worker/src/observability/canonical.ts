import type { BootstrapRun } from "./schema";
import type { ObservabilitySettings } from "./settings";
import type { RunSummary } from "./storage";

export interface RunSignals {
  attention_required: boolean;
  failure_reason_summary: string;
  next_actions: string[];
  locality: string;
  capability: string;
}

export type RunWithSignals<
  T extends {
    status: BootstrapRun["status"];
    first_failed_phase?: string;
    error_code?: string;
    expected_version?: string;
    observed_version?: string;
  },
> = T & RunSignals;

function summarizeFailureReason(run: {
  status: BootstrapRun["status"];
  first_failed_phase?: string;
  error_code?: string;
  expected_version?: string;
  observed_version?: string;
}): string {
  if (run.status === "success") return "Run completed successfully.";
  if (
    run.expected_version &&
    run.observed_version &&
    run.expected_version !== run.observed_version
  ) {
    return "Installed version did not match the version this run expected.";
  }
  if (run.first_failed_phase) {
    return `Run stopped during ${run.first_failed_phase.replaceAll("_", " ")}.`;
  }
  if (run.error_code) {
    return "Run failed with an internal bootstrap error.";
  }
  if (run.status === "partial") {
    return "Run completed with partial success and needs follow-up.";
  }
  return "Run failed and needs investigation.";
}

function inferNextActions(run: {
  status: BootstrapRun["status"];
  first_failed_phase?: string;
  error_code?: string;
  expected_version?: string;
  observed_version?: string;
}): string[] {
  if (run.status === "success") {
    return ["No action required"];
  }

  const actions: string[] = [];
  if (run.first_failed_phase) actions.push("Inspect failed phase logs");
  if (run.error_code) actions.push("Verify bootstrap prerequisites");
  if (
    run.expected_version &&
    run.observed_version &&
    run.expected_version !== run.observed_version
  ) {
    actions.push("Verify version mismatch");
    actions.push("Retry bootstrap");
  }
  if (actions.length === 0) actions.push("Inspect run details");
  return actions;
}

function inferLocality(firstFailedPhase?: string): string {
  if (!firstFailedPhase) return "bootstrap/unknown";
  if (firstFailedPhase.includes("worker")) return "bootstrap/worker";
  if (firstFailedPhase.includes("package")) return "bootstrap/package";
  if (firstFailedPhase.includes("plugin")) return "bootstrap/plugin";
  return `bootstrap/${firstFailedPhase}`;
}

function inferCapability(firstFailedPhase?: string): string {
  if (!firstFailedPhase) return "bootstrap.lifecycle";
  if (firstFailedPhase.includes("fetch")) return "artifact.fetch";
  if (firstFailedPhase.includes("version")) return "version.validation";
  if (firstFailedPhase.includes("material")) return "adapter.materialization";
  return `bootstrap.${firstFailedPhase}`;
}

export function deriveRunSignals(run: {
  status: BootstrapRun["status"];
  first_failed_phase?: string;
  error_code?: string;
  expected_version?: string;
  observed_version?: string;
}): RunSignals {
  return {
    attention_required: run.status !== "success",
    failure_reason_summary: summarizeFailureReason(run),
    next_actions: inferNextActions(run),
    locality: inferLocality(run.first_failed_phase),
    capability: inferCapability(run.first_failed_phase),
  };
}

export function withRunSignals<T extends RunSummary | BootstrapRun>(
  run: T,
): RunWithSignals<T> {
  const signals = deriveRunSignals(run);
  return {
    ...run,
    attention_required: signals.attention_required,
    failure_reason_summary: signals.failure_reason_summary,
    next_actions: signals.next_actions,
    locality: signals.locality,
    capability: signals.capability,
  };
}
