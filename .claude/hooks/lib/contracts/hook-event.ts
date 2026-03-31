/**
 * Hook Event Contract
 *
 * Canonical event shapes for all Claude Code hook lifecycle events.
 * These types represent the normalized event shape after parsing and validation,
 * before rule processing.
 */

export interface ToolInputMetadata {
  skill?: string; // For Skill tool invocations
  name?: string; // Alternative skill name field (fallback)
  args?: string | Record<string, unknown>;
}

export interface ToolResponseMetadata {
  is_error: boolean;
  content?: Array<{ text: string }> | string;
}

export interface PreToolUseEvent {
  type: "PreToolUse";
  tool_name: string;
  file_path?: string;
  tool_input?: ToolInputMetadata;
  session_id: string;
  timestamp: string; // ISO 8601 format
}

export interface PostToolUseEvent {
  type: "PostToolUse";
  tool_name: string;
  file_path?: string;
  tool_input?: ToolInputMetadata;
  tool_response?: ToolResponseMetadata;
  session_id: string;
  timestamp: string; // ISO 8601 format
}

export interface SessionStartEvent {
  type: "SessionStart";
  session_id: string;
  project_dir: string;
  home_dir: string;
  timestamp: string; // ISO 8601 format
}

export type HookEvent = PreToolUseEvent | PostToolUseEvent | SessionStartEvent;

export interface RuleResult {
  decision: "allow" | "block";
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Validates that a parsed event conforms to the canonical contract.
 * Throws TypeError if validation fails.
 */
export function validateHookEvent(event: unknown): HookEvent {
  if (!event || typeof event !== "object") {
    throw new TypeError("Event must be a non-null object");
  }

  const e = event as Record<string, unknown>;
  const type = e.type as string;

  // Check event type
  if (!["PreToolUse", "PostToolUse", "SessionStart"].includes(type)) {
    throw new TypeError(
      `Invalid event type: "${type}". Must be PreToolUse, PostToolUse, or SessionStart.`,
    );
  }

  // Check timestamp format (ISO 8601)
  if (typeof e.timestamp !== "string" || !isValidISO8601(e.timestamp)) {
    throw new TypeError(
      `Event timestamp must be ISO 8601 format (got: ${e.timestamp})`,
    );
  }

  // Check session_id
  if (typeof e.session_id !== "string" || !e.session_id.trim()) {
    throw new TypeError(
      "Event session_id is required and must be a non-empty string",
    );
  }

  // Type-specific validations
  if (type === "SessionStart") {
    if (typeof e.project_dir !== "string" || !e.project_dir.trim()) {
      throw new TypeError("SessionStartEvent requires project_dir");
    }
    if (typeof e.home_dir !== "string" || !e.home_dir.trim()) {
      throw new TypeError("SessionStartEvent requires home_dir");
    }
  } else if (type === "PreToolUse" || type === "PostToolUse") {
    if (typeof e.tool_name !== "string" || !e.tool_name.trim()) {
      throw new TypeError(`${type} requires tool_name`);
    }
  }

  return e as HookEvent;
}

/**
 * Checks if a string is in valid ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ).
 */
function isValidISO8601(timestamp: string): boolean {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  return iso8601Regex.test(timestamp);
}

/**
 * Normalizes file paths: converts relative paths to absolute.
 *
 * @param filePath - The file path (absolute or relative)
 * @param projectDir - Project root directory (used for relative paths)
 * @returns Absolute file path
 */
export function normalizeFilePath(
  filePath: string,
  projectDir: string,
): string {
  if (!filePath || filePath.startsWith("/")) {
    return filePath;
  }
  // Relative path: resolve relative to project directory
  return `${projectDir}/${filePath}`;
}
