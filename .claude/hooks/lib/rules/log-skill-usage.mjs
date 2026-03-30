/**
 * Rule: Log Skill Usage
 *
 * Logs skill invocations to ~/.claude/skill-analytics/skill-usage.jsonl
 *
 * Triggers on: PreToolUse events where tool_name === 'Skill'
 *
 * Output: JSONL with schema {timestamp, session_id, skill, args}
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const rule = {
  name: 'log-skill-usage',
  triggers: ['PreToolUse'],

  async execute(event) {
    // Only log if tool is 'Skill'
    if (event.tool_name !== 'Skill') {
      return { decision: 'allow' };
    }

    try {
      // Get skill name from tool_input
      const skillName = event.tool_input?.skill || event.tool_input?.name || 'unknown';
      const args = event.tool_input?.args || '';

      // Ensure directory exists
      const analyticsDir = join(process.env.HOME || '/tmp', '.claude', 'skill-analytics');
      mkdirSync(analyticsDir, { recursive: true });

      // Format args as JSON string (handles both string and object)
      const argsString = typeof args === 'string' ? args : JSON.stringify(args);

      // Build JSONL line (matches observation-sources/tool-usage.mjs expectations)
      const line = JSON.stringify({
        timestamp: event.timestamp,
        session_id: event.session_id,
        skill: skillName,
        args: argsString
      });

      // Append to skill-usage.jsonl
      const outfile = join(analyticsDir, 'skill-usage.jsonl');
      appendFileSync(outfile, line + '\n');
    } catch (err) {
      // Log error to stderr, don't block tool execution
      console.error(`Failed to log skill usage: ${err.message}`);
    }

    return { decision: 'allow' };
  }
};
