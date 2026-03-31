/**
 * momentum-view.mjs
 *
 * Pure function: task + execution contract → MomentumView.
 * No I/O, no side effects. Deterministic.
 */

import { validateContract } from "../../shared/contracts/validate.mjs";
import { workTitleForTaskType } from "./intent-lexicon.mjs";
import { getStrengthLabel } from "./strength-labels.mjs";

/**
 * Builds a user-facing MomentumView from task state and execution contract.
 *
 * @param {object} params
 * @param {object} params.task - PortableTaskObject
 * @param {object} params.effectiveExecutionContract - EffectiveExecutionContract
 * @param {Function} [params.resolveIntentFn] - override for resolveIntent (testing)
 * @param {Function} [params.getStrengthLabelFn] - override for getStrengthLabel (testing)
 * @returns {object} validated MomentumView
 */
export function buildMomentumView({
  task,
  effectiveExecutionContract,
  workTitleFn = workTitleForTaskType,
  getStrengthLabelFn = getStrengthLabel,
} = {}) {
  if (!task || typeof task !== "object") {
    throw new Error("buildMomentumView requires task");
  }
  if (
    !effectiveExecutionContract ||
    typeof effectiveExecutionContract !== "object"
  ) {
    throw new Error("buildMomentumView requires effectiveExecutionContract");
  }

  // work_title: task type → work title (direct lookup, not phrase resolution)
  const workTitle = workTitleFn(task.task_type);

  // progress_summary
  const completed = task.progress?.completed_steps ?? 0;
  const total = task.progress?.total_steps ?? 0;
  const findingCount = (task.findings || []).length;
  const progressSummary = `${completed} of ${total} steps complete, ${findingCount} findings recorded`;

  // top_findings: extract summary + confidence + verification_status
  const topFindings = (task.findings || []).map((f) => {
    const entry = {};
    entry.summary = f.summary;
    if (f.provenance?.confidence) {
      entry.confidence = f.provenance.confidence;
    }
    if (f.verification_status) {
      entry.verification_status = f.verification_status;
    }
    return entry;
  });

  // current_strength: from strength-labels using task's current_route
  const strengthEntry = getStrengthLabelFn(task.current_route);
  const currentStrength = {
    level: strengthEntry.level,
    label: strengthEntry.label,
    description: strengthEntry.description,
  };

  // best_next_action
  const bestNextAction = task.next_action || "";

  // upgrade_opportunity: present when contract has upgrade_explanation
  const upgradeExplanation = effectiveExecutionContract.upgrade_explanation;
  let upgradeOpportunity;
  if (upgradeExplanation) {
    const target = upgradeExplanation.stronger_route_id
      ? getStrengthLabelFn(upgradeExplanation.stronger_route_id)
      : null;
    upgradeOpportunity = {
      ...(target ? { target_label: target.label } : {}),
      unlocks: upgradeExplanation.unlocks,
    };
  }

  const view = {
    schema_version: "1.0.0",
    task_id: task.task_id,
    work_title: workTitle,
    progress_summary: progressSummary,
    top_findings: topFindings,
    current_strength: currentStrength,
    best_next_action: bestNextAction,
    ...(upgradeOpportunity ? { upgrade_opportunity: upgradeOpportunity } : {}),
  };

  return validateContract("momentumView", view);
}
