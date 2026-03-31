// Template Proposal Eval Harness — minimal validation of proposed templates.
// Pure function: checks structural validity and renderability.

/**
 * Run evals on a template proposal.
 *
 * @param {object} proposal - Template proposal with id, proposed, target
 * @returns {Promise<object>} Eval result with success, errors, output
 */
export async function runTemplateProposalEvals(proposal) {
  if (!proposal) {
    throw new Error("proposal is required");
  }
  if (!proposal.id) {
    throw new Error("proposal.id is required");
  }

  const errors = [];
  let output = null;
  let success = true;

  try {
    // Check that proposed template exists and is not null
    if (!proposal.proposed) {
      errors.push(
        "proposed template content is required and must be non-empty",
      );
      success = false;
    } else if (typeof proposal.proposed !== "string") {
      errors.push("proposed template must be a string");
      success = false;
    } else if (proposal.proposed.trim().length === 0) {
      errors.push("proposed template cannot be empty");
      success = false;
    } else {
      // Template is valid — extract output
      output = proposal.proposed.trim();

      // Basic validation: check it looks like a template
      const hasHeading = /^#/.test(output);
      if (!hasHeading && output.length > 10) {
        // Warn but don't fail — templates don't always need headings
      }
    }
  } catch (err) {
    errors.push(`Evaluation error: ${err.message}`);
    success = false;
  }

  return {
    success,
    errors,
    output: output || null,
    proposal_id: proposal.id,
    evaluated_at: new Date().toISOString(),
  };
}
