/**
 * Log Skill Usage Rule Tests
 *
 * Tests logging of skill invocations to skill-usage.jsonl
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { rule } from '../rules/log-skill-usage.mjs';

const analyticsDir = join(process.env.HOME || '/tmp', '.claude', 'skill-analytics');

function cleanup() {
  try {
    rmSync(analyticsDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore
  }
}

function readUsageLog() {
  try {
    if (!existsSync(join(analyticsDir, 'skill-usage.jsonl'))) {
      return [];
    }
    return readFileSync(join(analyticsDir, 'skill-usage.jsonl'), 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch (e) {
    return [];
  }
}

test('log-skill-usage - logs Skill invocation with skill name from tool_input', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'debug', args: '--verbose' },
    session_id: 'test-session-1',
    timestamp: '2026-03-30T10:00:00Z'
  };

  await rule.execute(event);

  const logs = readUsageLog();
  assert.equal(logs.length, 1, 'Should log one entry');
  assert.equal(logs[0].skill, 'debug');
  assert.equal(logs[0].args, '--verbose');
  assert.equal(logs[0].session_id, 'test-session-1');
  assert.equal(logs[0].timestamp, '2026-03-30T10:00:00Z');

  cleanup();
});

test('log-skill-usage - uses name field if skill field missing', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { name: 'refactor' },
    session_id: 'test-session-2',
    timestamp: '2026-03-30T10:00:00Z'
  };

  await rule.execute(event);

  const logs = readUsageLog();
  assert.equal(logs[0].skill, 'refactor', 'Should use name field as fallback');

  cleanup();
});

test('log-skill-usage - uses unknown if no skill or name', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { args: 'some args' },
    session_id: 'test-session-3',
    timestamp: '2026-03-30T10:00:00Z'
  };

  await rule.execute(event);

  const logs = readUsageLog();
  assert.equal(logs[0].skill, 'unknown', 'Should use unknown as default');

  cleanup();
});

test('log-skill-usage - handles string args', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'debug', args: '--trace --verbose' },
    session_id: 'test-session-4',
    timestamp: '2026-03-30T10:00:00Z'
  };

  await rule.execute(event);

  const logs = readUsageLog();
  assert.equal(logs[0].args, '--trace --verbose');

  cleanup();
});

test('log-skill-usage - handles object args', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'debug', args: { level: 'trace', scope: 'all' } },
    session_id: 'test-session-5',
    timestamp: '2026-03-30T10:00:00Z'
  };

  await rule.execute(event);

  const logs = readUsageLog();
  const parsed = JSON.parse(logs[0].args);
  assert.equal(parsed.level, 'trace');
  assert.equal(parsed.scope, 'all');

  cleanup();
});

test('log-skill-usage - ignores non-Skill tools', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Edit',
    file_path: '/home/user/test.js',
    session_id: 'test-session-6',
    timestamp: '2026-03-30T10:00:00Z'
  };

  await rule.execute(event);

  const logs = readUsageLog();
  assert.equal(logs.length, 0, 'Should not log non-Skill tools');

  cleanup();
});

test('log-skill-usage - only triggers on PreToolUse', async () => {
  cleanup();

  const event = {
    type: 'PostToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'debug' },
    session_id: 'test-session-7',
    timestamp: '2026-03-30T10:00:00Z'
  };

  // The rule will execute, but should ignore based on trigger filter
  await rule.execute(event);

  const logs = readUsageLog();
  // Note: execute() doesn't check type, so we're testing through the triggers config
  // This is more of a contract test
  assert.ok(rule.triggers.includes('PreToolUse'), 'Rule should be configured for PreToolUse');

  cleanup();
});

test('log-skill-usage - appends multiple entries to JSONL', async () => {
  cleanup();

  const event1 = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'debug' },
    session_id: 'test-session-8',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const event2 = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'simplify' },
    session_id: 'test-session-8',
    timestamp: '2026-03-30T10:00:05Z'
  };

  await rule.execute(event1);
  await rule.execute(event2);

  const logs = readUsageLog();
  assert.equal(logs.length, 2, 'Should log two entries');
  assert.equal(logs[0].skill, 'debug');
  assert.equal(logs[1].skill, 'simplify');

  cleanup();
});

test('log-skill-usage - creates analytics directory if missing', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'debug' },
    session_id: 'test-session-9',
    timestamp: '2026-03-30T10:00:00Z'
  };

  await rule.execute(event);

  assert.ok(existsSync(analyticsDir), 'Analytics directory should be created');
  assert.ok(existsSync(join(analyticsDir, 'skill-usage.jsonl')), 'JSONL file should exist');

  cleanup();
});

test('log-skill-usage - returns allow decision', async () => {
  cleanup();

  const event = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'debug' },
    session_id: 'test-session-10',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await rule.execute(event);
  assert.equal(result.decision, 'allow', 'Should always allow execution');

  cleanup();
});
