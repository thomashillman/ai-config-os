// Improvement Proposal Store — persists proposals as durable JSON files.

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Generate a deterministic filename for a proposal.
 *
 * @param {object} deps
 * @param {object} deps.proposal - Proposal object
 * @param {number} [deps.index=0] - Collision avoidance index
 * @returns {string} Deterministic filename (proposal_xxx.json)
 */
export function determineCandidateFilename({ proposal, index = 0 } = {}) {
  if (!proposal) {
    throw new Error('proposal is required');
  }

  // Create a deterministic hash from proposal key fields
  const hash = createHash('sha256')
    .update(JSON.stringify({
      type: proposal.type,
      target: proposal.target,
      insight_id: proposal.insight_id,
    }))
    .digest('hex')
    .slice(0, 8);

  if (index > 0) {
    return `proposal_${hash}_${String(index).padStart(2, '0')}.json`;
  }

  return `proposal_${hash}.json`;
}

/**
 * Persist a proposal to disk as a JSON file.
 *
 * @param {object} deps
 * @param {object} deps.proposal - Proposal object to persist
 * @param {string} deps.outputDir - Directory to write to
 * @param {boolean} [deps.allowOverwrite=false] - Allow overwriting existing files
 * @returns {Promise<string>} Filename written (relative to outputDir)
 */
export async function persistProposal({ proposal, outputDir, allowOverwrite = false } = {}) {
  if (!proposal) {
    throw new Error('proposal is required');
  }
  if (!outputDir) {
    throw new Error('outputDir is required');
  }

  let filename = determineCandidateFilename({ proposal, index: 0 });
  let filepath = join(outputDir, filename);
  let index = 0;

  // If file exists and no overwrite, find next available index
  while (existsSync(filepath) && !allowOverwrite) {
    index += 1;
    filename = determineCandidateFilename({ proposal, index });
    filepath = join(outputDir, filename);
  }

  // Write pretty-printed JSON
  const content = JSON.stringify(proposal, null, 2);
  writeFileSync(filepath, content, 'utf8');

  return filename;
}
