import { readFileSync } from 'node:fs';

/**
 * Read skill outcomes from ~/.claude/skill-analytics/skill-outcomes.jsonl
 * Maps each line into a canonical observation event.
 *
 * @param {string} filePath - Path to skill-outcomes.jsonl
 * @returns {Array<Object>} Array of canonical events with type 'skill_outcome'
 */
export function readSkillOutcomes(filePath) {
  const events = [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        // Map to canonical event type
        const event = {
          type: 'skill_outcome',
          ...data,
        };
        events.push(event);
      } catch {
        // Skip malformed lines
        // In production, could log to debug but adapter just skips silently
      }
    }
  } catch {
    // File doesn't exist or can't be read — return empty array
    // This is normal when the file hasn't been created yet
  }

  return events;
}
