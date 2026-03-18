/**
 * generate-commands.test.mjs
 *
 * TDD tests for adapters/claude/generate-commands.mjs
 *
 * Tests:
 *  1.  selectVariant: returns haiku when modelHint is haiku
 *  2.  selectVariant: returns sonnet when modelHint is sonnet
 *  3.  selectVariant: returns opus when modelHint is opus
 *  4.  selectVariant: follows fallback_chain when exact match not found
 *  5.  selectVariant: defaults to sonnet when no model hint and no variants
 *  6.  selectVariant: uses surface_hint to prefer haiku on limited surface
 *  7.  buildCommandContent: includes skill name as H1
 *  8.  buildCommandContent: includes description
 *  9.  buildCommandContent: includes body content
 *  10. buildCommandContent: embeds generated marker
 *  11. generateCommands: writes one file per available/degraded skill
 *  12. generateCommands: skips excluded and unavailable skills
 *  13. generateCommands: handles missing manifest gracefully (no crash)
 *  14. generateCommands: cleans stale generated commands on re-run
 *  15. generateCommands: is idempotent (no file changes on second run)
 *  16. generateCommands: selects correct variant based on probe surface
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATE_COMMANDS = resolve(__dirname, '../../../adapters/claude/generate-commands.mjs');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSkill(overrides = {}) {
  return {
    id: 'test-skill',
    description: 'A test skill for unit testing.',
    type: 'prompt',
    status: 'stable',
    capabilities: { required: [], optional: [], fallback_mode: 'prompt-only' },
    variants: {
      opus:   { prompt_file: 'prompts/detailed.md', description: 'Full analysis' },
      sonnet: { prompt_file: 'prompts/balanced.md', description: 'Balanced' },
      haiku:  { prompt_file: 'prompts/brief.md',    description: 'Quick' },
      fallback_chain: ['opus', 'sonnet', 'haiku'],
    },
    ...overrides,
  };
}

function makeProbeReport(overrides = {}) {
  return {
    surface_hint:  'desktop-cli',
    platform_hint: 'claude-code-remote',
    results: {
      'fs.read':    { status: 'supported' },
      'fs.write':   { status: 'supported' },
      'shell.exec': { status: 'supported' },
    },
    ...overrides,
  };
}

function makeManifest(skills) {
  return { version: '0.5.4', skills };
}

/** Create a temp directory tree with probe, manifest, and skill SKILL.md files. */
function makeTempEnv(skills = [], probeOverrides = {}, modelHint = '') {
  const tmp = join(tmpdir(), `gc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const cacheDir   = join(tmp, '.ai-config-os', 'cache', 'claude-code');
  const skillsDir  = join(cacheDir, 'skills');
  const commandsDir = join(tmp, '.claude', 'commands');
  const probeFile  = join(tmp, '.ai-config-os', 'probe-report.json');

  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(commandsDir, { recursive: true });
  mkdirSync(join(tmp, '.ai-config-os'), { recursive: true });

  // Write probe report
  writeFileSync(probeFile, JSON.stringify(makeProbeReport(probeOverrides)));

  // Write manifest
  writeFileSync(join(cacheDir, 'latest.json'), JSON.stringify(makeManifest(skills)));

  // Write skill SKILL.md files
  for (const skill of skills) {
    const dir = join(skillsDir, skill.id);
    mkdirSync(dir, { recursive: true });
    const frontmatter = `---\nskill: "${skill.id}"\ndescription: "${skill.description || ''}"\ntype: "${skill.type || 'prompt'}"\nstatus: "${skill.status || 'stable'}"\ncapabilities:\n  required: [${(skill.capabilities?.required || []).map(c => `"${c}"`).join(', ')}]\n  optional: []\n  fallback_mode: "${skill.capabilities?.fallback_mode || 'prompt-only'}"\nvariants:\n  sonnet:\n    prompt_file: prompts/balanced.md\n    description: Balanced\n  haiku:\n    prompt_file: prompts/brief.md\n    description: Quick\n  fallback_chain:\n    - sonnet\n    - haiku\n---\n`;
    writeFileSync(join(dir, 'SKILL.md'), frontmatter + `\n# ${skill.id}\n\nThis is the body of ${skill.id}.`);
  }

  return { tmp, cacheDir, skillsDir, commandsDir, probeFile, modelHint };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadModule() {
  const { selectVariant, buildCommandContent, generateCommands } = await import(GENERATE_COMMANDS);
  return { selectVariant, buildCommandContent, generateCommands };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('selectVariant', () => {
  test('1. returns haiku variant when modelHint is haiku', async () => {
    const { selectVariant } = await loadModule();
    const skill = makeSkill();
    const result = selectVariant(skill, 'haiku', 'desktop-cli');
    assert.equal(result, 'haiku');
  });

  test('2. returns sonnet variant when modelHint is sonnet', async () => {
    const { selectVariant } = await loadModule();
    const skill = makeSkill();
    const result = selectVariant(skill, 'sonnet', 'desktop-cli');
    assert.equal(result, 'sonnet');
  });

  test('3. returns opus variant when modelHint is opus', async () => {
    const { selectVariant } = await loadModule();
    const skill = makeSkill();
    const result = selectVariant(skill, 'opus', 'desktop-cli');
    assert.equal(result, 'opus');
  });

  test('4. follows fallback_chain when requested variant not available', async () => {
    const { selectVariant } = await loadModule();
    const skill = makeSkill({
      variants: {
        sonnet: { prompt_file: 'prompts/balanced.md', description: 'Balanced' },
        haiku:  { prompt_file: 'prompts/brief.md',    description: 'Quick' },
        fallback_chain: ['sonnet', 'haiku'],
        // opus is missing from variants
      },
    });
    // modelHint is opus but skill has no opus variant → should fall to sonnet (first in chain)
    const result = selectVariant(skill, 'opus', 'desktop-cli');
    assert.equal(result, 'sonnet');
  });

  test('5. defaults to sonnet when no model hint and no matching variant', async () => {
    const { selectVariant } = await loadModule();
    const skill = makeSkill({ variants: { sonnet: { prompt_file: 'p.md' }, fallback_chain: ['sonnet'] } });
    const result = selectVariant(skill, '', 'desktop-cli');
    assert.equal(result, 'sonnet');
  });

  test('6. prefers haiku on mobile/limited surface with no model hint', async () => {
    const { selectVariant } = await loadModule();
    const skill = makeSkill();
    // No model hint, mobile surface → prefer haiku
    const result = selectVariant(skill, '', 'mobile');
    assert.equal(result, 'haiku');
  });
});

describe('buildCommandContent', () => {
  test('7. includes skill name as H1', async () => {
    const { buildCommandContent } = await loadModule();
    const content = buildCommandContent('security-review', 'A security skill.', 'Body here.', 'sonnet');
    assert.ok(content.includes('# security-review'), 'Should have H1 with skill name');
  });

  test('8. includes description', async () => {
    const { buildCommandContent } = await loadModule();
    const content = buildCommandContent('security-review', 'OWASP security review.', 'Body here.', 'sonnet');
    assert.ok(content.includes('OWASP security review.'), 'Should include description');
  });

  test('9. includes body content', async () => {
    const { buildCommandContent } = await loadModule();
    const content = buildCommandContent('security-review', 'Desc.', 'Full instructions here.', 'sonnet');
    assert.ok(content.includes('Full instructions here.'), 'Should include body');
  });

  test('10. embeds generated marker comment', async () => {
    const { buildCommandContent } = await loadModule();
    const content = buildCommandContent('security-review', 'Desc.', 'Body.', 'sonnet');
    assert.ok(content.includes('generated by ai-config-os'), 'Should have generated marker');
  });
});

describe('generateCommands', () => {
  test('11. writes one file per available/degraded skill', async () => {
    const { generateCommands } = await loadModule();

    const skills = [
      makeSkill({ id: 'skill-a', capabilities: { required: [], optional: [], fallback_mode: 'prompt-only' } }),
      makeSkill({ id: 'skill-b', capabilities: { required: [], optional: ['fs.read'], fallback_mode: 'prompt-only' } }),
    ];

    const env = makeTempEnv(skills);

    await generateCommands({
      projectDir:   env.tmp,
      cacheDir:     env.cacheDir,
      probeFile:    env.probeFile,
      commandsDir:  env.commandsDir,
    });

    assert.ok(existsSync(join(env.commandsDir, 'skill-a.md')), 'skill-a.md should exist');
    assert.ok(existsSync(join(env.commandsDir, 'skill-b.md')), 'skill-b.md should exist');

    rmSync(env.tmp, { recursive: true, force: true });
  });

  test('12. skips excluded and unavailable skills', async () => {
    const { generateCommands } = await loadModule();

    const skills = [
      // available
      makeSkill({ id: 'skill-ok',       capabilities: { required: [], optional: [], fallback_mode: 'prompt-only' } }),
      // excluded: requires a missing capability, has fallback_mode
      makeSkill({ id: 'skill-excluded', capabilities: { required: ['mcp.client'], optional: [], fallback_mode: 'prompt-only' } }),
      // unavailable: requires missing cap, no fallback
      makeSkill({ id: 'skill-gone',     capabilities: { required: ['mcp.client'], optional: [] } }),
    ];

    const env = makeTempEnv(skills);

    await generateCommands({
      projectDir:  env.tmp,
      cacheDir:    env.cacheDir,
      probeFile:   env.probeFile,
      commandsDir: env.commandsDir,
    });

    assert.ok(existsSync(join(env.commandsDir, 'skill-ok.md')),        'available skill should be written');
    assert.ok(!existsSync(join(env.commandsDir, 'skill-excluded.md')), 'excluded skill should not be written');
    assert.ok(!existsSync(join(env.commandsDir, 'skill-gone.md')),     'unavailable skill should not be written');

    rmSync(env.tmp, { recursive: true, force: true });
  });

  test('13. handles missing manifest gracefully without throwing', async () => {
    const { generateCommands } = await loadModule();
    const tmp = join(tmpdir(), `gc-test-missing-${Date.now()}`);
    const commandsDir = join(tmp, '.claude', 'commands');
    mkdirSync(commandsDir, { recursive: true });

    await assert.doesNotReject(
      () => generateCommands({
        projectDir:  tmp,
        cacheDir:    join(tmp, 'nonexistent'),
        probeFile:   join(tmp, 'nonexistent-probe.json'),
        commandsDir,
      }),
      'Should not throw when manifest/probe are missing',
    );

    rmSync(tmp, { recursive: true, force: true });
  });

  test('14. cleans stale generated commands on re-run', async () => {
    const { generateCommands } = await loadModule();

    // First run: two skills
    const skillsFirst = [
      makeSkill({ id: 'skill-keep',  capabilities: { required: [], optional: [], fallback_mode: 'prompt-only' } }),
      makeSkill({ id: 'skill-stale', capabilities: { required: [], optional: [], fallback_mode: 'prompt-only' } }),
    ];
    const env = makeTempEnv(skillsFirst);

    await generateCommands({
      projectDir:  env.tmp,
      cacheDir:    env.cacheDir,
      probeFile:   env.probeFile,
      commandsDir: env.commandsDir,
    });

    assert.ok(existsSync(join(env.commandsDir, 'skill-keep.md')));
    assert.ok(existsSync(join(env.commandsDir, 'skill-stale.md')));

    // Second run: only one skill (stale removed from manifest)
    const skillsSecond = [
      makeSkill({ id: 'skill-keep', capabilities: { required: [], optional: [], fallback_mode: 'prompt-only' } }),
    ];
    writeFileSync(join(env.cacheDir, 'latest.json'), JSON.stringify(makeManifest(skillsSecond)));

    await generateCommands({
      projectDir:  env.tmp,
      cacheDir:    env.cacheDir,
      probeFile:   env.probeFile,
      commandsDir: env.commandsDir,
    });

    assert.ok(existsSync(join(env.commandsDir, 'skill-keep.md')),   'kept skill should still exist');
    assert.ok(!existsSync(join(env.commandsDir, 'skill-stale.md')), 'stale skill should be removed');

    rmSync(env.tmp, { recursive: true, force: true });
  });

  test('15. is idempotent: same file content on second run', async () => {
    const { generateCommands } = await loadModule();

    const skills = [
      makeSkill({ id: 'skill-x', capabilities: { required: [], optional: [], fallback_mode: 'prompt-only' } }),
    ];
    const env = makeTempEnv(skills);
    const opts = {
      projectDir:  env.tmp,
      cacheDir:    env.cacheDir,
      probeFile:   env.probeFile,
      commandsDir: env.commandsDir,
    };

    await generateCommands(opts);
    const first = readFileSync(join(env.commandsDir, 'skill-x.md'), 'utf8');

    await generateCommands(opts);
    const second = readFileSync(join(env.commandsDir, 'skill-x.md'), 'utf8');

    assert.equal(first, second, 'Output should be identical on second run');

    rmSync(env.tmp, { recursive: true, force: true });
  });

  test('16. selects haiku variant when probe surface is mobile', async () => {
    const { generateCommands } = await loadModule();

    const skills = [
      makeSkill({ id: 'skill-mobile', capabilities: { required: [], optional: [], fallback_mode: 'prompt-only' } }),
    ];
    const env = makeTempEnv(skills, { surface_hint: 'mobile' });

    await generateCommands({
      projectDir:  env.tmp,
      cacheDir:    env.cacheDir,
      probeFile:   env.probeFile,
      commandsDir: env.commandsDir,
    });

    const content = readFileSync(join(env.commandsDir, 'skill-mobile.md'), 'utf8');
    assert.ok(content.includes('variant: haiku'), 'Mobile surface should use haiku variant');

    rmSync(env.tmp, { recursive: true, force: true });
  });
});
