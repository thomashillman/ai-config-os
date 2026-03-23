/**
 * Tool usage observation source: loads metrics from .claude/metrics.jsonl
 *
 * Reads project-level tool invocation metrics (successful and failed executions)
 * and normalizes them into canonical observation format.
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * Load tool usage observations from project metrics file
 *
 * @param {Object} options
 * @param {string} options.projectDir - project root directory
 * @param {number} [options.limit=1000] - maximum number of events to return
 * @returns {Promise<Array>}
 */
export async function loadToolUsageObservations(options = {}) {
  const { projectDir = process.cwd(), limit = 1000 } = options;
  const metricsFile = join(projectDir, '.claude', 'metrics.jsonl');

  const events = [];

  try {
    const content = readFileSync(metricsFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    for (const line of lines) {
      if (events.length >= limit) break;

      try {
        const parsed = JSON.parse(line);
        const event = normalizeEvent(parsed);
        events.push(event);
      } catch (err) {
        // Skip malformed lines
      }
    }
  } catch (err) {
    // Metrics file doesn't exist or is unreadable — return empty array
  }

  return events;
}

/**
 * Normalize raw tool usage metric into standard event format
 * @private
 */
function normalizeEvent(raw) {
  return {
    type: 'tool_usage',
    timestamp: raw.timestamp,
    tool_name: raw.tool,
    status: raw.status, // 'success' or 'error'
    duration_ms: raw.duration_ms,
    error_code: raw.error_code || null,
  };
}
