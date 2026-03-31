// Eval Candidate Store — persists candidates as durable JSON files.

import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

/**
 * Generate a deterministic filename for a candidate.
 *
 * @param {object} deps
 * @param {object} deps.candidate - Candidate object
 * @param {number} [deps.index=0] - Collision avoidance index
 * @returns {string} Deterministic filename (candidate_xxx.json)
 */
export function determineCandidateFilename({ candidate, index = 0 } = {}) {
  if (!candidate) {
    throw new Error("candidate is required");
  }

  // Create deterministic hash from candidate key fields
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        signal_type: candidate.signal_type,
        severity: candidate.severity,
        count: candidate.count,
      }),
    )
    .digest("hex")
    .slice(0, 8);

  if (index > 0) {
    return `candidate_${candidate.signal_type}_${hash}_${String(index).padStart(2, "0")}.json`;
  }

  return `candidate_${candidate.signal_type}_${hash}.json`;
}

/**
 * Persist a candidate to disk as a JSON file.
 *
 * @param {object} deps
 * @param {object} deps.candidate - Candidate object to persist
 * @param {string} deps.outputDir - Directory to write to
 * @param {boolean} [deps.allowOverwrite=false] - Allow overwriting existing files
 * @returns {Promise<string>} Filename written (relative to outputDir)
 */
export async function persistCandidate({
  candidate,
  outputDir,
  allowOverwrite = false,
} = {}) {
  if (!candidate) {
    throw new Error("candidate is required");
  }
  if (!outputDir) {
    throw new Error("outputDir is required");
  }

  let filename = determineCandidateFilename({ candidate, index: 0 });
  let filepath = join(outputDir, filename);
  let index = 0;

  // If file exists and no overwrite, find next available index
  while (existsSync(filepath) && !allowOverwrite) {
    index += 1;
    filename = determineCandidateFilename({ candidate, index });
    filepath = join(outputDir, filename);
  }

  // Write pretty-printed JSON
  const content = JSON.stringify(candidate, null, 2);
  writeFileSync(filepath, content, "utf8");

  return filename;
}
