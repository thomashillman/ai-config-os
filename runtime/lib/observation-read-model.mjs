/**
 * Observation read model: unified loader for observations from all sources
 *
 * Loads and aggregates observations (bootstrap telemetry, tool usage, skill outcomes, etc.)
 * from the .ai-config-os logs directory, applies filtering/limits, and returns a snapshot
 * with events and summary counts.
 */

import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * Load observation snapshot from all available sources
 *
 * @param {Object} options
 * @param {string} options.home - home directory to search in
 * @param {number} [options.limit=1000] - maximum number of events to return
 * @returns {Promise<{events: Array, summary: Object}>}
 */
export async function loadObservationSnapshot(options = {}) {
  const { home = process.env.HOME || '/root', limit = 1000 } = options;
  const logsDir = join(home, '.ai-config-os', 'logs');

  const events = [];
  const summary = {
    total_events: 0,
    tool_usage_count: 0,
    tool_error_count: 0,
    skill_outcome_count: 0,
    bootstrap_success_count: 0,
    bootstrap_error_count: 0,
    loop_suspected_count: 0,
  };

  try {
    const logFiles = readdirSync(logsDir);

    for (const file of logFiles) {
      if (!file.endsWith('.jsonl')) continue;

      const filePath = join(logsDir, file);
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (events.length >= limit) break;

        try {
          const parsed = JSON.parse(line);
          const event = normalizeEvent(parsed, file);
          events.push(event);
          updateSummary(summary, event);
        } catch (err) {
          // Skip malformed lines
        }
      }

      if (events.length >= limit) break;
    }
  } catch (err) {
    // Logs directory doesn't exist or is unreadable — return empty snapshot
  }

  summary.total_events = events.length;
  return { events, summary };
}

/**
 * Normalize raw event data into standard event format
 * @private
 */
function normalizeEvent(raw, fileName) {
  // Bootstrap telemetry events
  if (fileName.startsWith('bootstrap-')) {
    return {
      type: 'bootstrap_phase',
      phase: raw.phase,
      provider: raw.provider,
      duration_ms: raw.duration_ms,
      result: raw.result,
      error_code: raw.error_code,
      deferred: raw.deferred,
    };
  }

  // Default: pass through as-is
  return raw;
}

/**
 * Update summary counts based on event type/content
 * @private
 */
function updateSummary(summary, event) {
  if (event.type === 'bootstrap_phase') {
    if (event.result === 'ok') {
      summary.bootstrap_success_count++;
    } else if (event.result === 'error') {
      summary.bootstrap_error_count++;
    }
  }

  // Add other event type handling here as needed
}
