// Intent Proposal Promotion — gated promotion logic for intent definitions.
// Pure module: loads proposal, runs evals, updates definitions on success.

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { runIntentProposalEvals } from "./run-intent-evals.mjs";

/**
 * Promote an intent proposal through eval gate.
 *
 * @param {object} deps
 * @param {object} deps.proposal - Intent proposal to promote
 * @param {string} deps.definitionsFilePath - Path to definitions file to update
 * @returns {Promise<object>} Promotion result with success flag, eval result, updated proposal
 */
export async function promoteIntentProposal({
  proposal,
  definitionsFilePath,
} = {}) {
  if (!proposal) {
    throw new Error("proposal is required");
  }
  if (!definitionsFilePath) {
    throw new Error("definitionsFilePath is required");
  }

  const promotedAt = new Date().toISOString();

  // Run evals on the proposal
  const evalResult = await runIntentProposalEvals(proposal);

  if (!evalResult.success) {
    // Evals failed — do not promote
    return {
      success: false,
      eval_result: evalResult,
      proposed_status: "eval_failed",
      updated_proposal: {
        ...proposal,
        status: "eval_failed",
        eval_run_at: promotedAt,
        eval_errors: evalResult.errors,
      },
      message: `Intent proposal evaluation failed: ${evalResult.errors.join("; ")}`,
      promoted_at: promotedAt,
    };
  }

  // Evals passed — update or create definitions file
  try {
    const { phrases, taskType } = proposal.proposed;

    // Load existing definitions or start with empty array
    let definitions = [];
    if (existsSync(definitionsFilePath)) {
      const content = readFileSync(definitionsFilePath, "utf8");
      try {
        definitions = JSON.parse(content);
        if (!Array.isArray(definitions)) {
          definitions = [];
        }
      } catch {
        definitions = [];
      }
    }

    // Append new intent definition
    const newDefinition = {
      taskType,
      phrases,
      addedAt: promotedAt,
      proposalId: proposal.id,
      confidence: proposal.confidence,
    };

    definitions.push(newDefinition);

    // Write updated definitions
    writeFileSync(
      definitionsFilePath,
      JSON.stringify(definitions, null, 2),
      "utf8",
    );
  } catch (err) {
    // File write failed
    return {
      success: false,
      eval_result: evalResult,
      proposed_status: "write_failed",
      updated_proposal: {
        ...proposal,
        status: "write_failed",
        eval_run_at: promotedAt,
        error: err.message,
      },
      message: `Failed to write definitions file: ${err.message}`,
      promoted_at: promotedAt,
    };
  }

  // Success — update proposal status
  const updatedProposal = {
    ...proposal,
    status: "promoted",
    promoted_at: promotedAt,
    eval_run_at: promotedAt,
    eval_result: evalResult,
  };

  return {
    success: true,
    eval_result: evalResult,
    proposed_status: "promoted",
    updated_proposal: updatedProposal,
    message: `Intent proposal promoted successfully to ${definitionsFilePath}`,
    promoted_at: promotedAt,
  };
}
