// Template Proposal Promotion — gated promotion logic with eval-based gate.
// Pure module: loads proposal, runs evals, writes template on success.

import { writeFileSync } from 'node:fs';
import { runTemplateProposalEvals } from './run-template-evals.mjs';

/**
 * Promote a template proposal through eval gate.
 *
 * @param {object} deps
 * @param {object} deps.proposal - Template proposal to promote
 * @param {string} deps.templateFilePath - Path to template file to update
 * @returns {Promise<object>} Promotion result with success flag, eval result, updated proposal
 */
export async function promoteTemplateProposal({ proposal, templateFilePath } = {}) {
  if (!proposal) {
    throw new Error('proposal is required');
  }
  if (!templateFilePath) {
    throw new Error('templateFilePath is required');
  }

  const promotedAt = new Date().toISOString();

  // Run evals on the proposal
  const evalResult = await runTemplateProposalEvals(proposal);

  if (!evalResult.success) {
    // Evals failed — do not promote
    return {
      success: false,
      eval_result: evalResult,
      proposed_status: 'eval_failed',
      updated_proposal: {
        ...proposal,
        status: 'eval_failed',
        eval_run_at: promotedAt,
        eval_errors: evalResult.errors,
      },
      message: `Template proposal evaluation failed: ${evalResult.errors.join('; ')}`,
      promoted_at: promotedAt,
    };
  }

  // Evals passed — write the template file
  try {
    writeFileSync(templateFilePath, evalResult.output, 'utf8');
  } catch (err) {
    // File write failed
    return {
      success: false,
      eval_result: evalResult,
      proposed_status: 'write_failed',
      updated_proposal: {
        ...proposal,
        status: 'write_failed',
        eval_run_at: promotedAt,
        error: err.message,
      },
      message: `Failed to write template file: ${err.message}`,
      promoted_at: promotedAt,
    };
  }

  // Success — update proposal status
  const updatedProposal = {
    ...proposal,
    status: 'promoted',
    promoted_at: promotedAt,
    eval_run_at: promotedAt,
    eval_result: evalResult,
  };

  return {
    success: true,
    eval_result: evalResult,
    proposed_status: 'promoted',
    updated_proposal: updatedProposal,
    message: `Template proposal promoted successfully to ${templateFilePath}`,
    promoted_at: promotedAt,
  };
}
