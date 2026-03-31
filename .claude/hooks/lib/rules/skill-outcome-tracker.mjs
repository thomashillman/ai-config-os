/**
 * Rule: Skill Outcome Tracker
 *
 * Tracks whether skill outputs are acted upon:
 *   - 'output_used': Skill output followed by Edit/Write within 10 minutes
 *   - 'output_replaced': Another Skill invoked before any edit/write
 *
 * Triggers on: PreToolUse and PostToolUse events
 *
 * Output: JSONL with schema {timestamp, session_id, skill, outcome}
 * State: Pending skill tracked in /tmp/claude-sessions/{session_id}-skill-pending.json
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";

export const rule = {
  name: "skill-outcome-tracker",
  triggers: ["PreToolUse", "PostToolUse"],

  async execute(event) {
    // Route to phase-specific handlers for clarity
    if (event.type === "PreToolUse") {
      return this.handlePreToolUse(event);
    } else if (event.type === "PostToolUse") {
      return this.handlePostToolUse(event);
    }
    return { decision: "allow" };
  },

  /**
   * Handle PreToolUse events: track new skill invocations and replacements.
   * Only processes Skill tool events.
   */
  async handlePreToolUse(event) {
    const { tool_name, tool_input, session_id, timestamp } = event;

    // Only care about Skill invocations on PreToolUse
    if (tool_name !== "Skill") {
      return { decision: "allow" };
    }

    try {
      const analyticsDir = join(
        process.env.HOME || "/tmp",
        ".claude",
        "skill-analytics",
      );
      mkdirSync(analyticsDir, { recursive: true });

      const counterDir = "/tmp/claude-sessions";
      mkdirSync(counterDir, { recursive: true });
      const pendingFile = join(counterDir, `${session_id}-skill-pending.json`);

      // Extract skill name from tool input
      const skillName = tool_input?.skill || tool_input?.name || "unknown";

      // If there's a pending skill from a previous invocation, mark it as replaced
      if (existsSync(pendingFile)) {
        const pending = readJSON(pendingFile);
        if (pending && pending.skill_name) {
          recordOutcome(
            pending.skill_name,
            "output_replaced",
            session_id,
            timestamp,
            analyticsDir,
          );
        }
      }

      // Record new pending skill for potential outcome tracking
      writeJSON(pendingFile, {
        skill_name: skillName,
        invoked_at: timestamp,
      });
    } catch (err) {
      console.error(
        `[skill-outcome-tracker] PreToolUse handler failed: ${err.message}`,
      );
    }

    return { decision: "allow" };
  },

  /**
   * Handle PostToolUse events: track whether pending skill output was used.
   * Only processes Edit and Write tool events.
   */
  async handlePostToolUse(event) {
    const { tool_name, session_id, timestamp } = event;

    // Only care about Edit/Write on PostToolUse (indicating code was modified)
    if (tool_name !== "Edit" && tool_name !== "Write") {
      return { decision: "allow" };
    }

    try {
      const analyticsDir = join(
        process.env.HOME || "/tmp",
        ".claude",
        "skill-analytics",
      );
      mkdirSync(analyticsDir, { recursive: true });

      const counterDir = "/tmp/claude-sessions";
      mkdirSync(counterDir, { recursive: true });
      const pendingFile = join(counterDir, `${session_id}-skill-pending.json`);

      // Check if there's a pending skill from a previous invocation
      if (existsSync(pendingFile)) {
        const pending = readJSON(pendingFile);
        if (pending && pending.skill_name && pending.invoked_at) {
          const invokedTime = new Date(pending.invoked_at);
          const currentTime = new Date(timestamp);
          const elapsedSeconds = (currentTime - invokedTime) / 1000;

          // Record outcome based on timing (10 minute threshold)
          if (elapsedSeconds <= 600) {
            recordOutcome(
              pending.skill_name,
              "output_used",
              session_id,
              timestamp,
              analyticsDir,
            );
          }
          // If expired (>10 minutes), no outcome recorded; treat as unused

          // Always clear pending after first Edit/Write following Skill
          rmSync(pendingFile, { force: true });
        }
      }
    } catch (err) {
      console.error(
        `[skill-outcome-tracker] PostToolUse handler failed: ${err.message}`,
      );
    }

    return { decision: "allow" };
  },
};

/**
 * Records a skill outcome to the outcomes JSONL file.
 */
function recordOutcome(skill, outcome, sessionId, timestamp, analyticsDir) {
  try {
    const line = JSON.stringify({
      timestamp,
      session_id: sessionId,
      skill,
      outcome,
    });
    appendFileSync(join(analyticsDir, "skill-outcomes.jsonl"), line + "\n");
  } catch (err) {
    console.error(`Failed to record skill outcome: ${err.message}`);
  }
}

/**
 * Safely reads JSON from a file.
 */
function readJSON(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

/**
 * Safely writes JSON to a file.
 */
function writeJSON(filePath, data) {
  try {
    writeFileSync(filePath, JSON.stringify(data));
  } catch (err) {
    console.error(`Failed to write JSON: ${err.message}`);
  }
}
