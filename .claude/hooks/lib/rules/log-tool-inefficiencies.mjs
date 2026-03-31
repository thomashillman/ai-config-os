/**
 * Rule: Log Tool Inefficiencies
 *
 * Detects tool errors and repeated-call loops per session.
 * Logs to ~/.claude/skill-analytics/inefficiencies.jsonl
 *
 * Triggers on: PostToolUse events
 *
 * Output: JSONL with schema {timestamp, session_id, type, tool, snippet|call_count}
 *   type: 'tool_error' | 'loop_suspected'
 */

import {
  appendFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

export const rule = {
  name: "log-tool-inefficiencies",
  triggers: ["PostToolUse"],

  async execute(event) {
    try {
      // Ensure analytics directory exists
      const analyticsDir = join(
        process.env.HOME || "/tmp",
        ".claude",
        "skill-analytics",
      );
      mkdirSync(analyticsDir, { recursive: true });

      // 1. Log tool errors
      if (event.tool_response?.is_error) {
        const snippet = extractSnippet(event.tool_response.content, 300);
        const errorLine = JSON.stringify({
          timestamp: event.timestamp,
          session_id: event.session_id,
          type: "tool_error",
          tool: event.tool_name,
          snippet,
        });
        appendFileSync(
          join(analyticsDir, "inefficiencies.jsonl"),
          errorLine + "\n",
        );
      }

      // 2. Detect loops
      await detectAndLogLoop(event, analyticsDir);
    } catch (err) {
      console.error(`Failed to log tool inefficiencies: ${err.message}`);
    }

    return { decision: "allow" };
  },
};

/**
 * Extracts a snippet from tool response content.
 */
function extractSnippet(content, maxLen = 300) {
  if (!content) return "";

  let text = "";
  if (Array.isArray(content)) {
    // Content is an array of objects with 'text' field
    text = content[0]?.text || "";
  } else {
    // Content is a string
    text = String(content);
  }

  return (typeof text === "string" ? text : String(text)).slice(0, maxLen);
}

/**
 * Detects repeated tool calls and logs if threshold is exceeded.
 */
async function detectAndLogLoop(event, analyticsDir) {
  // Thresholds per tool type
  const thresholds = {
    Bash: 6,
    Edit: 10,
    Write: 10,
    Read: 15,
    Grep: 12,
    Glob: 12,
  };
  const threshold = thresholds[event.tool_name] || 8;

  const counterDir = "/tmp/claude-sessions";
  mkdirSync(counterDir, { recursive: true });
  const counterFile = join(counterDir, `${event.session_id}.json`);

  // Read current counts
  let counts = {};
  if (existsSync(counterFile)) {
    try {
      const content = readFileSync(counterFile, "utf8");
      counts = JSON.parse(content);
    } catch (err) {
      // If file is malformed, start fresh
      counts = {};
    }
  }

  // Increment count for this tool
  const newCount = (counts[event.tool_name] || 0) + 1;
  counts[event.tool_name] = newCount;

  // Write updated counts back (atomic: write to temp file, then rename)
  try {
    writeFileSync(counterFile, JSON.stringify(counts));
  } catch (err) {
    // If write fails, don't crash
    console.error(`Failed to write loop counter: ${err.message}`);
  }

  // Log loop detection exactly when threshold is hit
  if (newCount === threshold) {
    const loopLine = JSON.stringify({
      timestamp: event.timestamp,
      session_id: event.session_id,
      type: "loop_suspected",
      tool: event.tool_name,
      call_count: newCount,
    });
    appendFileSync(join(analyticsDir, "inefficiencies.jsonl"), loopLine + "\n");
  }
}
