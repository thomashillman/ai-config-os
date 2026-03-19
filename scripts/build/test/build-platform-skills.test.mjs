import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeImport } from '../lib/windows-safe-import.mjs';

const { buildPlatformSkillsAndCheckZeroEmit } = await safeImport(
  '../lib/build-platform-skills.mjs',
  import.meta.url
);

describe('buildPlatformSkillsAndCheckZeroEmit', () => {
  it('groups skills by platform when emit=true', () => {
    const skillA = { skillName: 'a', frontmatter: { status: 'stable' } };
    const skillB = { skillName: 'b', frontmatter: { status: 'stable' } };
    const skillById = new Map([['a', skillA], ['b', skillB]]);

    const compatMatrix = new Map([
      ['a', new Map([['claude-code', { status: 'supported', emit: true }], ['cursor', { status: 'excluded', emit: false }]])],
      ['b', new Map([['claude-code', { status: 'supported', emit: true }], ['cursor', { status: 'supported', emit: true }]])],
    ]);

    const { platformSkills, zeroEmitSkills } = buildPlatformSkillsAndCheckZeroEmit(compatMatrix, skillById);

    assert.deepEqual(platformSkills['claude-code'], [skillA, skillB]);
    assert.deepEqual(platformSkills['cursor'], [skillB]);
    assert.deepEqual(zeroEmitSkills, []);
  });

  it('detects zero-emit non-deprecated skills', () => {
    const skill = { skillName: 'orphan', frontmatter: { status: 'stable' } };
    const skillById = new Map([['orphan', skill]]);

    const compatMatrix = new Map([
      ['orphan', new Map([['claude-code', { status: 'excluded', emit: false }]])],
    ]);

    const { zeroEmitSkills } = buildPlatformSkillsAndCheckZeroEmit(compatMatrix, skillById);
    assert.deepEqual(zeroEmitSkills, ['orphan']);
  });

  it('allows zero-emit for deprecated skills', () => {
    const skill = { skillName: 'old', frontmatter: { status: 'deprecated' } };
    const skillById = new Map([['old', skill]]);

    const compatMatrix = new Map([
      ['old', new Map([['claude-code', { status: 'excluded', emit: false }]])],
    ]);

    const { zeroEmitSkills } = buildPlatformSkillsAndCheckZeroEmit(compatMatrix, skillById);
    assert.deepEqual(zeroEmitSkills, []);
  });

  it('produces log lines for each skill', () => {
    const skill = { skillName: 's', frontmatter: { status: 'stable' } };
    const skillById = new Map([['s', skill]]);

    const compatMatrix = new Map([
      ['s', new Map([['p1', { status: 'supported', emit: true }]])],
    ]);

    const { logLines } = buildPlatformSkillsAndCheckZeroEmit(compatMatrix, skillById);
    assert.equal(logLines.length, 1);
    assert.ok(logLines[0].includes('s: p1:supported'));
  });
});
