/**
 * PreToolUse Guard Rule Tests
 *
 * Tests the guard rule that blocks direct edits to /plugins/core-skills/skills/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from '../rules/pre-tool-use-guard.mjs';

test('pre-tool-use-guard - allows Edit to shared/skills', async () => {
  const event = {
    type: 'PreToolUse',
    tool_name: 'Edit',
    file_path: '/home/user/project/shared/skills/my-skill/SKILL.md',
    session_id: 'test-session',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await rule.execute(event);
  assert.equal(result.decision, 'allow', 'Should allow edits to shared/skills');
});

test('pre-tool-use-guard - blocks Edit to plugins/core-skills/skills', async () => {
  const event = {
    type: 'PreToolUse',
    tool_name: 'Edit',
    file_path: '/home/user/project/plugins/core-skills/skills/my-skill/SKILL.md',
    session_id: 'test-session',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await rule.execute(event);
  assert.equal(result.decision, 'block', 'Should block edits to plugins/core-skills/skills');
  assert.ok(result.reason, 'Should provide reason for block');
});

test('pre-tool-use-guard - blocks Write to plugins/core-skills/skills', async () => {
  const event = {
    type: 'PreToolUse',
    tool_name: 'Write',
    file_path: '/home/user/project/plugins/core-skills/skills/test/index.js',
    session_id: 'test-session',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await rule.execute(event);
  assert.equal(result.decision, 'block');
});

test('pre-tool-use-guard - blocks NotebookEdit to plugins/core-skills/skills', async () => {
  const event = {
    type: 'PreToolUse',
    tool_name: 'NotebookEdit',
    file_path: '/home/user/project/plugins/core-skills/skills/demo.ipynb',
    session_id: 'test-session',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await rule.execute(event);
  assert.equal(result.decision, 'block');
});

test('pre-tool-use-guard - allows other tools on protected path', async () => {
  const event = {
    type: 'PreToolUse',
    tool_name: 'Read',
    file_path: '/home/user/project/plugins/core-skills/skills/my-skill/SKILL.md',
    session_id: 'test-session',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await rule.execute(event);
  assert.equal(result.decision, 'allow', 'Should allow Read even on protected path');
});

test('pre-tool-use-guard - allows Skill tool', async () => {
  const event = {
    type: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'debug' },
    session_id: 'test-session',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await rule.execute(event);
  assert.equal(result.decision, 'allow', 'Should allow Skill tool');
});

test('pre-tool-use-guard - handles missing file_path gracefully', async () => {
  const event = {
    type: 'PreToolUse',
    tool_name: 'Edit',
    session_id: 'test-session',
    timestamp: '2026-03-30T10:00:00Z'
  };

  const result = await rule.execute(event);
  assert.equal(result.decision, 'allow', 'Should allow when file_path is missing');
});

test('pre-tool-use-guard - trigger config only includes PreToolUse', () => {
  // The rule's triggers config controls when it's invoked
  assert.ok(
    rule.triggers.includes('PreToolUse'),
    'Guard should be configured to trigger on PreToolUse'
  );
  assert.ok(
    !rule.triggers.includes('PostToolUse'),
    'Guard should not trigger on PostToolUse'
  );
});
