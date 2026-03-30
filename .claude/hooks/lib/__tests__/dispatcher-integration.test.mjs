/**
 * Dispatcher Integration Tests
 *
 * End-to-end tests that feed real hook events through dispatch.mjs
 * and verify the full pipeline (stdin → dispatch → rules → stdout/stderr).
 *
 * These tests prove the integration works, complementing unit tests of rules.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const dispatcherPath = join(process.cwd(), '.claude', 'hooks', 'dispatch.mjs');
const analyticsDir = join(process.env.HOME || '/tmp', '.claude', 'skill-analytics');
const sessionDir = '/tmp/claude-sessions';

function cleanup() {
  try {
    rmSync(analyticsDir, { recursive: true, force: true });
    rmSync(sessionDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore
  }
}

/**
 * Runs dispatch.mjs with input and captures stdout/stderr
 */
function runDispatcher(jsonInput, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [dispatcherPath], {
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: process.cwd(),
        ...env
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    child.on('error', reject);

    // Send JSON to dispatcher
    child.stdin.write(jsonInput);
    child.stdin.end();
  });
}

test('dispatcher-integration - valid PreToolUse blocks protected path edit', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Edit',
    file_path: '/home/user/project/plugins/core-skills/skills/test/index.js',
    session_id: 'test-session-1',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await runDispatcher(JSON.stringify(event));

  assert.equal(result.exitCode, 0, 'Should exit cleanly on blocked event');
  assert.ok(result.stdout.includes('block'), 'Should output block decision');
  assert.ok(
    result.stdout.includes('Author skills in shared/skills'),
    'Should include guard reason'
  );
});

test('dispatcher-integration - valid PreToolUse allows shared-skills edit', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Edit',
    file_path: '/home/user/project/shared/skills/my-skill/SKILL.md',
    session_id: 'test-session-2',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await runDispatcher(JSON.stringify(event));

  assert.equal(result.exitCode, 0, 'Should exit cleanly on allowed event');
  // Allow events don't output decision, only block does
  assert.ok(!result.stdout.includes('block'), 'Should not block shared-skills edit');
});

test('dispatcher-integration - valid PreToolUse Skill invocation logs and allows', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'debug', args: '--verbose' },
    session_id: 'test-session-3',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await runDispatcher(JSON.stringify(event));

  assert.equal(result.exitCode, 0, 'Should exit cleanly for skill invocation');
  assert.ok(!result.stdout.includes('block'), 'Should not block skill execution');
});

test('dispatcher-integration - valid PostToolUse edit triggers reminder for ops files', async () => {
  cleanup();

  const event = {
    type: 'PostToolUse',
    tool_name: 'Edit',
    file_path: '/home/user/project/ops/validate-all.sh',
    session_id: 'test-session-4',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await runDispatcher(JSON.stringify(event));

  assert.equal(result.exitCode, 0, 'Should exit cleanly on PostToolUse');
  // Reminder is printed to stdout
  assert.ok(result.stdout.includes('check-docs'), 'Should remind about check-docs.sh');
});

test('dispatcher-integration - malformed JSON fails gracefully', async () => {
  cleanup();

  const invalidJson = '{ invalid json }';

  const result = await runDispatcher(invalidJson);

  assert.equal(result.exitCode, 0, 'Should exit 0 on parse error (graceful degradation)');
  assert.ok(result.stderr.includes('Failed to parse'), 'Should log parse error to stderr');
});

test('dispatcher-integration - enriches missing session_id from environment', async () => {
  cleanup();

  // Missing session_id - dispatcher should inject it from environment or generate one
  const event = {
    type: 'PreToolUse',
    tool_name: 'Edit',
    file_path: '/home/user/test.js',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await runDispatcher(JSON.stringify(event));

  assert.equal(result.exitCode, 0, 'Should exit 0 gracefully');
  // Should NOT have stderr (enrichment succeeds)
  assert.ok(!result.stderr.includes('session_id'), 'Should not complain about missing session_id');
});

test('dispatcher-integration - invalid timestamp fails gracefully', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'debug' },
    session_id: 'test-session-5',
    timestamp: 'not-a-timestamp'
  };

  const result = await runDispatcher(JSON.stringify(event));

  assert.equal(result.exitCode, 0, 'Should exit 0 on timestamp validation error');
  assert.ok(result.stderr.length > 0, 'Should log error to stderr');
});

test('dispatcher-integration - invalid event type fails gracefully', async () => {
  cleanup();

  const event = {
    type: 'InvalidEventType',
    tool_name: 'Bash',
    session_id: 'test-session-6',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await runDispatcher(JSON.stringify(event));

  assert.equal(result.exitCode, 0, 'Should exit 0 on invalid event type');
  assert.ok(result.stderr.includes('Invalid event type'), 'Should log type error to stderr');
});

test('dispatcher-integration - tool error detection works', async () => {
  cleanup();

  const event = {
    type: 'PostToolUse',
    tool_name: 'Bash',
    tool_response: {
      is_error: true,
      content: 'Command not found: foo'
    },
    session_id: 'test-session-7',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await runDispatcher(JSON.stringify(event));

  assert.equal(result.exitCode, 0, 'Should exit cleanly even with tool error');
  assert.ok(!result.stdout.includes('block'), 'Should not block on tool error');
});

test('dispatcher-integration - protected path with different tool', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Write',
    file_path: '/home/user/project/plugins/core-skills/skills/test/config.yaml',
    session_id: 'test-session-8',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await runDispatcher(JSON.stringify(event));

  assert.equal(result.exitCode, 0, 'Should exit cleanly');
  assert.ok(result.stdout.includes('block'), 'Write to plugins should be blocked');
});

test('dispatcher-integration - null input is handled', async () => {
  cleanup();

  const result = await runDispatcher('null');

  assert.equal(result.exitCode, 0, 'Should exit gracefully on null input');
  assert.ok(result.stderr.length > 0, 'Should log error to stderr');
});

test('dispatcher-integration - empty object is rejected', async () => {
  cleanup();

  const result = await runDispatcher('{}');

  assert.equal(result.exitCode, 0, 'Should exit gracefully on empty object');
  assert.ok(result.stderr.length > 0, 'Should log validation errors');
});
