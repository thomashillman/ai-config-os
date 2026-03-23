// Tool Inefficiencies Observation Source
// Reads ~/.claude/skill-analytics/inefficiencies.jsonl (tool errors and loop events)
// Maps to observation format with source_type preserved in metadata

import { readFileSync } from 'node:fs';

/**
 * Read tool inefficiencies from inefficiencies.jsonl
 * @param {object} options
 * @param {string} options.filePath - Path to inefficiencies.jsonl (default: ~/.claude/skill-analytics/inefficiencies.jsonl)
 * @returns {Promise<Array>} Array of observation objects with tool_inefficiencies source type
 */
export async function readToolInefficiencies({ filePath } = {}) {
  const defaultPath = `${process.env.HOME}/.claude/skill-analytics/inefficiencies.jsonl`;
  const path = filePath || defaultPath;

  const observations = [];

  try {
    const content = readFileSync(path, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        const observation = {
          timestamp: event.timestamp,
          type: event.type,
          tool_name: event.tool,
          metadata: {
            source_type: 'tool_inefficiencies',
            session_id: event.session_id,
          },
        };

        // Add type-specific metadata
        if (event.type === 'tool_error') {
          observation.metadata.snippet = event.snippet;
        } else if (event.type === 'loop_suspected') {
          observation.metadata.call_count = event.call_count;
        }

        observations.push(observation);
      } catch {
        // Silently skip malformed lines
      }
    }
  } catch {
    // File doesn't exist or unreadable — return empty
  }

  return observations;
}
