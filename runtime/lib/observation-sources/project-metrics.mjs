/**
 * Observation Source: Project Metrics
 *
 * Reads .claude/metrics.jsonl and converts raw metric lines into canonical observation events.
 * Each line in the JSONL file is parsed as a separate event. Malformed lines are silently skipped.
 * If the file does not exist, returns an empty array.
 */

import fs from "node:fs";

/**
 * Read project metrics events from a JSONL file.
 *
 * @param {object} options
 * @param {string} options.metricsPath - Path to the metrics.jsonl file
 * @returns {Array} Array of metric events (parsed JSON objects)
 */
export function readProjectMetricsEvents({ metricsPath } = {}) {
  if (!metricsPath || typeof metricsPath !== "string") {
    throw new Error("metricsPath is required and must be a string");
  }

  // Return empty array if file doesn't exist
  if (!fs.existsSync(metricsPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(metricsPath, "utf8");
    const lines = content.split("\n");
    const events = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        continue;
      }

      // Try to parse JSON; skip malformed lines
      try {
        const event = JSON.parse(trimmed);
        events.push(event);
      } catch {
        // Silently skip malformed JSON lines
      }
    }

    return events;
  } catch (err) {
    // If file can't be read (permissions, etc.), return empty array
    return [];
  }
}
