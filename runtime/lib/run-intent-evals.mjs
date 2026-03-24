// Intent Proposal Eval Harness — minimal validation of proposed intent definitions.
// Pure function: checks phrase validity and taskType presence.

/**
 * Run evals on an intent proposal.
 *
 * @param {object} proposal - Intent proposal with id, proposed containing { phrases, taskType }
 * @returns {Promise<object>} Eval result with success, errors, phrases_checked, task_type
 */
export async function runIntentProposalEvals(proposal) {
  if (!proposal) {
    throw new Error('proposal is required');
  }
  if (!proposal.id) {
    throw new Error('proposal.id is required');
  }

  const errors = [];
  let success = true;
  let phrasesChecked = 0;
  let taskType = null;

  try {
    // Check that proposed is an object
    if (!proposal.proposed || typeof proposal.proposed !== 'object' || Array.isArray(proposal.proposed)) {
      errors.push('proposed must be an object with phrases and taskType');
      success = false;
      return {
        success,
        errors,
        phrases_checked: 0,
        task_type: null,
        proposal_id: proposal.id,
        evaluated_at: new Date().toISOString(),
      };
    }

    const { phrases, taskType: pt } = proposal.proposed;

    // Check taskType
    if (!pt || typeof pt !== 'string' || pt.trim().length === 0) {
      errors.push('proposed.taskType is required and must be a non-empty string');
      success = false;
    } else {
      taskType = pt;
    }

    // Check phrases
    if (!Array.isArray(phrases)) {
      errors.push('proposed.phrases must be an array');
      success = false;
    } else if (phrases.length === 0) {
      errors.push('proposed.phrases cannot be empty');
      success = false;
    } else {
      // Validate each phrase
      for (let i = 0; i < phrases.length; i += 1) {
        const phrase = phrases[i];
        if (typeof phrase !== 'string') {
          errors.push(`proposed.phrases[${i}] must be a string, got ${typeof phrase}`);
          success = false;
        } else if (phrase.trim().length === 0) {
          errors.push(`proposed.phrases[${i}] cannot be empty`);
          success = false;
        } else {
          phrasesChecked += 1;
        }
      }
    }
  } catch (err) {
    errors.push(`Evaluation error: ${err.message}`);
    success = false;
  }

  return {
    success,
    errors,
    phrases_checked: phrasesChecked,
    task_type: taskType,
    proposal_id: proposal.id,
    evaluated_at: new Date().toISOString(),
  };
}
