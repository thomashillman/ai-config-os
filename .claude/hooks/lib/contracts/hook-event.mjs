/**
 * Hook Event Contract (Compiled from hook-event.ts)
 *
 * Runtime-safe validation and types for Claude Code hook events.
 */

import path from 'path';

export function validateHookEvent(event) {
  if (!event || typeof event !== 'object') {
    throw new TypeError('Event must be a non-null object');
  }

  const type = event.type;

  // Check event type
  if (!['PreToolUse', 'PostToolUse', 'SessionStart'].includes(type)) {
    throw new TypeError(
      `Invalid event type: "${type}". Must be PreToolUse, PostToolUse, or SessionStart.`
    );
  }

  // Check timestamp format (ISO 8601)
  if (typeof event.timestamp !== 'string' || !isValidISO8601(event.timestamp)) {
    throw new TypeError(
      `Event timestamp must be ISO 8601 format (got: ${event.timestamp})`
    );
  }

  // Check session_id
  if (typeof event.session_id !== 'string' || !event.session_id.trim()) {
    throw new TypeError('Event session_id is required and must be a non-empty string');
  }

  // Type-specific validations
  if (type === 'SessionStart') {
    if (typeof event.project_dir !== 'string' || !event.project_dir.trim()) {
      throw new TypeError('SessionStartEvent requires project_dir');
    }
    if (typeof event.home_dir !== 'string' || !event.home_dir.trim()) {
      throw new TypeError('SessionStartEvent requires home_dir');
    }
  } else if (type === 'PreToolUse' || type === 'PostToolUse') {
    if (typeof event.tool_name !== 'string' || !event.tool_name.trim()) {
      throw new TypeError(`${type} requires tool_name`);
    }
  }

  return event;
}

/**
 * Checks if a string is in valid ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ).
 */
function isValidISO8601(timestamp) {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  return iso8601Regex.test(timestamp);
}

/**
 * Normalizes file paths: converts relative paths to absolute, with boundary checks.
 *
 * Prevents directory traversal attacks (e.g., ../../etc/passwd).
 * Returns the original path if traversal is detected.
 *
 * @param {string} filePath - The file path (absolute or relative)
 * @param {string} projectDir - Project root directory (used for relative paths)
 * @returns {string} Absolute file path (or original if traversal detected)
 */
export function normalizeFilePath(filePath, projectDir) {
  if (!filePath) return filePath;
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  // Resolve relative path safely
  const resolved = path.resolve(projectDir, filePath);
  const normalized = path.normalize(projectDir);

  // Ensure result is within project dir (prevent ../ escape)
  if (!resolved.startsWith(normalized)) {
    return filePath; // Return original if escape detected
  }

  return resolved;
}
