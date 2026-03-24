// Tests for scripts/build/lib/validate-skill-policy.mjs

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSkillPolicy, validatePlatformPolicy } from '../lib/validate-skill-policy.mjs';

function makeSkillFrontmatter(overrides = {}) {
  return {
    skill: 'test-skill',
    description: 'A test skill',
    type: 'prompt',
    status: 'stable',
    ...overrides,
  };
}

describe('validateSkillPolicy — clean inputs', () => {
  test('clean prompt skill returns no errors or warnings', () => {
    const { errors, warnings } = validateSkillPolicy(makeSkillFrontmatter(), 'test-skill');
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  test('skill with valid capabilities object returns no errors', () => {
    const fm = makeSkillFrontmatter({
      capabilities: { required: ['fs.read'], optional: ['shell.exec'] },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill');
    assert.deepEqual(errors, []);
  });
});

describe('validateSkillPolicy — capabilities rules', () => {
  test('legacy flat capabilities array produces error', () => {
    const fm = makeSkillFrontmatter({ capabilities: ['fs.read', 'shell.exec'] });
    const { errors } = validateSkillPolicy(fm, 'test-skill');
    assert.ok(errors.some(e => /Legacy flat capabilities/.test(e)), `expected legacy error, got: ${errors}`);
  });

  test('overlapping required and optional capabilities produce error', () => {
    const fm = makeSkillFrontmatter({
      capabilities: { required: ['fs.read', 'git.read'], optional: ['git.read'] },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill');
    assert.ok(errors.some(e => /both required and optional/.test(e)));
    assert.ok(errors.some(e => /git\.read/.test(e)));
  });

  test('no overlap in required and optional — no error', () => {
    const fm = makeSkillFrontmatter({
      capabilities: { required: ['fs.read'], optional: ['shell.exec'] },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill');
    assert.deepEqual(errors, []);
  });
});

describe('validateSkillPolicy — platform rules', () => {
  test('unknown platform with knownPlatforms set produces error', () => {
    const fm = makeSkillFrontmatter({
      platforms: { 'mystery-platform': { mode: 'native' } },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill', new Set(['claude-code', 'cursor']));
    assert.ok(errors.some(e => /Unknown platform 'mystery-platform'/.test(e)));
  });

  test('known platform with knownPlatforms set produces no error', () => {
    const fm = makeSkillFrontmatter({
      platforms: { 'claude-code': { mode: 'native' } },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill', new Set(['claude-code', 'cursor']));
    assert.deepEqual(errors, []);
  });

  test('empty knownPlatforms skips unknown-platform check', () => {
    const fm = makeSkillFrontmatter({
      platforms: { 'anything-goes': { mode: 'native' } },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill', new Set());
    assert.deepEqual(errors, []);
  });

  test('mode=excluded with allow_unverified=true produces error', () => {
    const fm = makeSkillFrontmatter({
      platforms: { 'claude-web': { mode: 'excluded', allow_unverified: true } },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill', new Set(['claude-web']));
    assert.ok(errors.some(e => /mode=excluded cannot have allow_unverified=true/.test(e)));
  });

  test('mode=excluded without allow_unverified produces no error', () => {
    const fm = makeSkillFrontmatter({
      platforms: { 'claude-web': { mode: 'excluded' } },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill', new Set(['claude-web']));
    assert.deepEqual(errors, []);
  });
});

describe('validateSkillPolicy — hook type rules', () => {
  test('hook skill with no platforms block produces error', () => {
    const fm = makeSkillFrontmatter({ type: 'hook' });
    const { errors } = validateSkillPolicy(fm, 'test-skill');
    assert.ok(errors.some(e => /Hook skill must have explicit 'platforms' block/.test(e)));
  });

  test('hook skill missing exclusion for non-hook platforms produces errors', () => {
    const fm = makeSkillFrontmatter({
      type: 'hook',
      platforms: {
        'claude-web': { mode: 'excluded' },
        // missing claude-ios, cursor, codex
      },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill');
    assert.ok(errors.some(e => /claude-ios/.test(e)));
    assert.ok(errors.some(e => /cursor/.test(e)));
    assert.ok(errors.some(e => /codex/.test(e)));
  });

  test('hook skill with all non-hook platforms excluded produces no errors', () => {
    const fm = makeSkillFrontmatter({
      type: 'hook',
      platforms: {
        'claude-web': { mode: 'excluded' },
        'claude-ios': { mode: 'excluded' },
        'cursor': { mode: 'excluded' },
        'codex': { mode: 'excluded' },
      },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill');
    assert.deepEqual(errors, []);
  });
});

describe('validateSkillPolicy — tool dependency rules', () => {
  test('unknown tool dependency with registeredTools set produces error', () => {
    const fm = makeSkillFrontmatter({
      dependencies: { tools: ['sync_tools', 'nonexistent_tool'] },
    });
    const { errors } = validateSkillPolicy(
      fm, 'test-skill', new Set(), new Set(['sync_tools', 'list_tools'])
    );
    assert.ok(errors.some(e => /Unknown tool dependency 'nonexistent_tool'/.test(e)));
    assert.ok(!errors.some(e => /Unknown tool dependency 'sync_tools'/.test(e)), 'known tool should not produce error');
  });

  test('known tool dependencies produce no errors', () => {
    const fm = makeSkillFrontmatter({
      dependencies: { tools: ['sync_tools'] },
    });
    const { errors } = validateSkillPolicy(
      fm, 'test-skill', new Set(), new Set(['sync_tools'])
    );
    assert.deepEqual(errors, []);
  });

  test('empty registeredTools skips unknown-tool check', () => {
    const fm = makeSkillFrontmatter({
      dependencies: { tools: ['any_tool'] },
    });
    const { errors } = validateSkillPolicy(fm, 'test-skill', new Set(), new Set());
    assert.deepEqual(errors, []);
  });
});

describe('validatePlatformPolicy', () => {
  test('platform id matches filename — no errors', () => {
    const { errors } = validatePlatformPolicy({ id: 'claude-code' }, 'claude-code');
    assert.deepEqual(errors, []);
  });

  test('platform id mismatch — produces error', () => {
    const { errors } = validatePlatformPolicy({ id: 'claude-code' }, 'cursor');
    assert.ok(errors.some(e => /does not match filename/.test(e)));
  });

  test('missing id field — no errors', () => {
    const { errors } = validatePlatformPolicy({}, 'claude-code');
    assert.deepEqual(errors, []);
  });
});
