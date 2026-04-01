/**
 * Execution resource observation source (Atom 5): optional telemetry lines for resource policy.
 *
 * Reads JSONL from `~/.ai-config-os/logs/execution-resource.jsonl` (or `options.filePath`).
 * Each line is a JSON object; normalized events use `type: "execution_resource"` plus optional
 * fields aligned with `ExecutionObservationFields` in shared/contracts/resource-policy-types.mjs.
 */

import { join } from "node:path";
import { readFileSync } from "node:fs";

/** @type {ReadonlySet<string>} */
const ALLOWED_MODES = new Set(["subscription", "api_key", "hybrid"]);

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function normalizeExecutionResourceLine(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { type: "execution_resource" };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  /** @type {Record<string, unknown>} */
  const out = { type: "execution_resource" };
  if (typeof o.timestamp === "string") out.timestamp = o.timestamp;
  if (typeof o.user_mode === "string" && ALLOWED_MODES.has(o.user_mode)) {
    out.user_mode = o.user_mode;
  }
  for (const key of [
    "estimated_input_tokens",
    "estimated_output_tokens",
    "packed_context_tokens",
    "compacted_from_tokens",
    "estimated_cost_minor",
    "pressure_score",
    "model_tier_selected",
    "throttle_detected",
    "fallback_reason",
    "overflow_mode_used",
  ]) {
    if (o[key] !== undefined) out[key] = o[key];
  }
  return /** @type {typeof out & { type: string }} */ (out);
}

/**
 * Load execution resource observations from the standard log file (or override path).
 *
 * @param {object} [options]
 * @param {string} [options.home] - defaults to process.env.HOME or "/root"
 * @param {string} [options.filePath] - full path to JSONL (overrides default location)
 * @param {number} [options.limit=1000]
 * @returns {Array<Record<string, unknown>>}
 */
export function loadExecutionResourceObservations(options = {}) {
  const {
    home = process.env.HOME || "/root",
    filePath,
    limit = 1000,
  } = options;
  const path =
    typeof filePath === "string" && filePath.length > 0
      ? filePath
      : join(home, ".ai-config-os", "logs", "execution-resource.jsonl");

  const events = [];

  try {
    const content = readFileSync(path, "utf8");
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      if (events.length >= limit) break;

      try {
        const parsed = JSON.parse(line);
        events.push(normalizeExecutionResourceLine(parsed));
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Missing or unreadable file — empty
  }

  return events;
}
