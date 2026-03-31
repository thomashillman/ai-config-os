import { readFileSync, statSync, openSync, readSync, closeSync } from "node:fs";

/**
 * Read skill outcomes from ~/.claude/skill-analytics/skill-outcomes.jsonl
 * Maps each line into a canonical observation event.
 *
 * @param {string} filePath - Path to skill-outcomes.jsonl
 * @param {Object} [options]
 * @param {number} [options.maxBytes] - If set and file exceeds this size, read only the last maxBytes bytes
 * @returns {Array<Object>} Array of canonical events with type 'skill_outcome'
 */
export function readSkillOutcomes(filePath, { maxBytes } = {}) {
  const events = [];

  try {
    let content;
    if (maxBytes) {
      const stat = statSync(filePath);
      if (stat.size > maxBytes) {
        const buf = Buffer.alloc(maxBytes);
        const fd = openSync(filePath, "r");
        try {
          readSync(fd, buf, 0, maxBytes, stat.size - maxBytes);
        } finally {
          closeSync(fd);
        }
        content = buf.toString("utf-8");
      } else {
        content = readFileSync(filePath, "utf-8");
      }
    } else {
      content = readFileSync(filePath, "utf-8");
    }
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        // Map to canonical event type
        const event = {
          type: "skill_outcome",
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
