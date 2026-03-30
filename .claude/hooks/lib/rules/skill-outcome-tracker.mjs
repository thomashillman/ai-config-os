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

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export const rule = {
  name: 'skill-outcome-tracker',
  triggers: ['PreToolUse', 'PostToolUse'],

  async execute(event) {
    const { tool_name, tool_input, session_id, timestamp } = event;

    // Only track Skill, Edit, Write tools
    if (!['Skill', 'Edit', 'Write'].includes(tool_name)) {
      return { decision: 'allow' };
    }

    try {
      // Ensure directories exist
      const analyticsDir = join(process.env.HOME || '/tmp', '.claude', 'skill-analytics');
      mkdirSync(analyticsDir, { recursive: true });

      const counterDir = '/tmp/claude-sessions';
      mkdirSync(counterDir, { recursive: true });
      const pendingFile = join(counterDir, `${session_id}-skill-pending.json`);

      if (tool_name === 'Skill') {
        // New skill invocation
        const skillName = tool_input?.skill || tool_input?.name || 'unknown';

        // If there's a pending skill, mark it as replaced
        if (existsSync(pendingFile)) {
          const pending = readJSON(pendingFile);
          if (pending && pending.skill_name) {
            recordOutcome(pending.skill_name, 'output_replaced', session_id, timestamp, analyticsDir);
          }
        }

        // Record new pending skill
        writeJSON(pendingFile, {
          skill_name: skillName,
          invoked_at: timestamp
        });
      } else if (tool_name === 'Edit' || tool_name === 'Write') {
        // Edit or Write tool invoked
        if (existsSync(pendingFile)) {
          const pending = readJSON(pendingFile);
          if (pending && pending.skill_name && pending.invoked_at) {
            const invokedTime = new Date(pending.invoked_at);
            const currentTime = new Date(timestamp);
            const elapsedSeconds = (currentTime - invokedTime) / 1000;

            // Check if within 10 minutes
            if (elapsedSeconds <= 600) {
              recordOutcome(pending.skill_name, 'output_used', session_id, timestamp, analyticsDir);
            }

            // Clear pending (whether used or expired)
            rmSync(pendingFile, { force: true });
          }
        }
      }
    } catch (err) {
      console.error(`Failed to track skill outcome: ${err.message}`);
    }

    return { decision: 'allow' };
  }
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
      outcome
    });
    appendFileSync(join(analyticsDir, 'skill-outcomes.jsonl'), line + '\n');
  } catch (err) {
    console.error(`Failed to record skill outcome: ${err.message}`);
  }
}

/**
 * Safely reads JSON from a file.
 */
function readJSON(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
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
