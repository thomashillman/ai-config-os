import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  transformSkillMdForCursor,
  CURSOR_STRIP_FRONTMATTER_KEYS,
} from '../lib/cursor-frontmatter.mjs';

test('strip list includes known Claude/repo keys', () => {
  assert.ok(CURSOR_STRIP_FRONTMATTER_KEYS.has('hooks'));
  assert.ok(CURSOR_STRIP_FRONTMATTER_KEYS.has('context'));
  assert.ok(CURSOR_STRIP_FRONTMATTER_KEYS.has('skill'));
});

test('transformSkillMdForCursor removes stripped keys and sets name', () => {
  const raw = `---
skill: my-skill
description: Does a thing
hooks:
  PreToolUse: []
context: fork
agent: Explore
---
Body here.
`;
  const skill = { skillName: 'my-skill', frontmatter: {} };
  const out = transformSkillMdForCursor(raw, skill, undefined);
  assert.ok(!out.includes('hooks:'), 'hooks should be stripped');
  assert.ok(!out.includes('context:'), 'context should be stripped');
  assert.ok(out.includes('name: my-skill'), 'name should match folder');
  assert.ok(out.includes('description: Does a thing'));
  assert.ok(out.includes('Body here.'));
});

test('transformSkillMdForCursor prepends limitation note when compat requires', () => {
  const raw = `---
skill: x
description: Test
---
Hello.
`;
  const skill = {
    skillName: 'x',
    frontmatter: { capabilities: { fallback_notes: 'Use paste.' } },
  };
  const compat = { status: 'supported', mode: 'degraded', notes: 'Partial bridge.' };
  const out = transformSkillMdForCursor(raw, skill, compat);
  assert.ok(out.includes('> **Note (Cursor):**'));
  assert.ok(out.includes('LIMITATION (supported/degraded):'));
  assert.ok(out.includes('Partial bridge.'));
  assert.ok(out.includes('> **Fallback:** Use paste.'));
});

test('transformSkillMdForCursor throws without description', () => {
  const raw = `---
skill: x
---
Body
`;
  assert.throws(
    () => transformSkillMdForCursor(raw, { skillName: 'x', frontmatter: {} }, undefined),
    /description required/
  );
});
