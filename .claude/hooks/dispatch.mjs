#!/usr/bin/env node

/**
 * Hook Dispatcher
 *
 * Main entry point for Claude Code hook events.
 * Reads JSON from stdin, validates, and dispatches to rule modules.
 *
 * Usage:
 *   echo '{"type":"PreToolUse",...}' | node dispatch.mjs
 *
 * Exit codes:
 *   0: Success (allow or block decision made, JSON on stdout if blocked)
 *   1: Error (invalid input, validation failure, etc.)
 */

import { validateHookEvent, normalizeFilePath } from './lib/contracts/hook-event.mjs';
import { RuleExecutor } from './lib/rule-executor.mjs';

// Import the rule registry (populated as rules are implemented)
import { rules } from './lib/rules/index.mjs';

/**
 * Main dispatcher logic
 */
async function main() {
  try {
    // 1. Read stdin
    const rawInput = await readStdin();

    // 2. Parse JSON
    let event;
    try {
      event = JSON.parse(rawInput);
    } catch (err) {
      console.error(`Failed to parse JSON: ${err.message}`);
      process.exit(0); // Allow if parsing fails (graceful degradation)
    }

    // 3. Inject missing fields from environment
    event = enrichEventWithContext(event);

    // 4. Validate event
    try {
      event = validateHookEvent(event);
    } catch (err) {
      console.error(`Event validation failed: ${err.message}`);
      process.exit(0); // Allow if validation fails
    }

    // 5. Normalize file paths
    if (event.file_path && (event.type === 'PreToolUse' || event.type === 'PostToolUse')) {
      event.file_path = normalizeFilePath(event.file_path, process.env.CLAUDE_PROJECT_DIR || process.cwd());
    }

    // 6. Create executor and dispatch
    const executor = new RuleExecutor(rules);
    const results = await executor.dispatch(event);

    // 7. Check for blocking decision
    const blockingResult = RuleExecutor.getBlockingResult(results);
    if (blockingResult) {
      // Output block decision as JSON to stdout
      console.log(JSON.stringify({
        decision: 'block',
        reason: blockingResult.reason || 'Hook guard triggered'
      }));
    }

    // Exit cleanly (success)
    process.exit(0);
  } catch (err) {
    console.error('Dispatcher error:', err.message);
    process.exit(0); // Graceful: allow on unexpected errors
  }
}

/**
 * Enriches the event with context from environment variables.
 */
function enrichEventWithContext(event) {
  if (!event.session_id) {
    event.session_id = process.env.CLAUDE_SESSION_ID || `pid-${process.pid}-${Date.now()}`;
  }

  if (!event.timestamp) {
    event.timestamp = new Date().toISOString();
  }

  return event;
}

/**
 * Reads all data from stdin.
 */
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', reject);
  });
}

// Run main
main().catch(err => {
  console.error('Uncaught error:', err.message);
  process.exit(0);
});
