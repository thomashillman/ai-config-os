import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveBashCommand } from './shell-test-helpers.mjs';
import {
  loadSkillModels,
  validateDependencies,
  validateVariants,
} from '../lib/ops-skill-model.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const BASH_COMMAND = resolveBashCommand();

function writeSkill(repoPath, skillName, frontmatter) {
  const skillDir = join(repoPath, 'shared', 'skills', skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n# ${skillName}\n`);
}

function makeRepoFixture() {
  const fixture = mkdtempSync(join(tmpdir(), 'ops-root-fix-'));
  mkdirSync(join(fixture, 'shared', 'skills'), { recursive: true });
  return fixture;
}

describe('ops validation root-fix model', () => {
  test('validateDependencies catches missing dependencies across scalar and object list formats', () => {
    const repoPath = makeRepoFixture();
    try {
      writeSkill(
        repoPath,
        'alpha',
        [
          'skill: "alpha"',
          'description: "Alpha"',
          'type: "prompt"',
          'dependencies:',
          '  skills:',
          '    - "beta"',
          '    - name: "missing-skill"',
        ].join('\n')
      );
      writeSkill(
        repoPath,
        'beta',
        ['skill: "beta"', 'description: "Beta"', 'type: "prompt"', 'dependencies:', '  skills: []'].join(
          '\n'
        )
      );

      const { models } = loadSkillModels(repoPath);
      const errors = validateDependencies(models);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /missing-skill/);
      assert.match(errors[0], /alpha/);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  test('validateVariants fails when referenced prompt file does not exist', () => {
    const repoPath = makeRepoFixture();
    try {
      writeSkill(
        repoPath,
        'variant-test',
        [
          'skill: "variant-test"',
          'description: "Variant test"',
          'type: "prompt"',
          'variants:',
          '  sonnet:',
          '    prompt_file: "prompts/balanced.md"',
          '    description: "Default"',
          '    cost_factor: 1',
        ].join('\n')
      );

      const { models } = loadSkillModels(repoPath);
      const errors = validateVariants(models);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /variant-test/);
      assert.match(errors[0], /prompts\/balanced\.md/);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});

describe('ops generate-docs strict mode', () => {
  test('generate-docs fails when required metadata is missing', () => {
    const repoPath = makeRepoFixture();
    try {
      writeSkill(
        repoPath,
        'broken-docs',
        ['skill: "broken-docs"', 'type: "prompt"', 'dependencies:', '  skills: []'].join('\n')
      );

      const result = spawnSync(
        'node',
        [join(REPO_ROOT, 'scripts', 'build', 'generate-docs.mjs'), '--repo-root', repoPath],
        { encoding: 'utf8' }
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /missing required metadata/i);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  test('generate-docs succeeds and keeps multiline description content', () => {
    const repoPath = makeRepoFixture();
    try {
      writeSkill(
        repoPath,
        'docs-ok',
        [
          'skill: "docs-ok"',
          'description: |',
          '  First line.',
          '  Second line.',
          'type: "prompt"',
          'inputs:',
          '  - name: "query"',
          '    type: "string"',
          '    description: "Input query"',
          '    required: true',
          'outputs:',
          '  - name: "answer"',
          '    type: "string"',
          '    description: "Output response"',
          'dependencies:',
          '  skills: []',
          'variants:',
          '  sonnet:',
          '    prompt_file: "prompts/balanced.md"',
          '    description: "Default"',
          '    cost_factor: 1',
          '    latency_baseline_ms: 500',
        ].join('\n')
      );
      mkdirSync(join(repoPath, 'shared', 'skills', 'docs-ok', 'prompts'), { recursive: true });
      writeFileSync(join(repoPath, 'shared', 'skills', 'docs-ok', 'prompts', 'balanced.md'), 'prompt');

      const result = spawnSync(
        'node',
        [join(REPO_ROOT, 'scripts', 'build', 'generate-docs.mjs'), '--repo-root', repoPath],
        { encoding: 'utf8' }
      );
      assert.equal(result.status, 0, `generate-docs failed:\n${result.stdout}\n${result.stderr}`);

      const readme = readFileSync(join(repoPath, 'shared', 'skills', 'docs-ok', 'README.md'), 'utf8');
      assert.match(readme, /First line\./);
      assert.match(readme, /Second line\./);
      assert.match(readme, /## Inputs/);
      assert.match(readme, /## Variants/);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});

describe('full-integration-test aggregation behavior', () => {
  test(
    'full-integration-test reports complete summary even when multiple steps fail',
    { skip: !BASH_COMMAND && 'bash is unavailable for shell integration tests' },
    () => {
      const fixture = mkdtempSync(join(tmpdir(), 'ops-full-integration-'));
      try {
        mkdirSync(join(fixture, 'ops'), { recursive: true });
        mkdirSync(join(fixture, 'adapters', 'claude'), { recursive: true });
        mkdirSync(join(fixture, 'shared', 'skills'), { recursive: true });
        mkdirSync(join(fixture, 'shared', 'workflows'), { recursive: true });

        copyFileSync(
          join(REPO_ROOT, 'ops', 'full-integration-test.sh'),
          join(fixture, 'ops', 'full-integration-test.sh')
        );

        writeFileSync(
          join(fixture, 'ops', 'validate-dependencies.sh'),
          '#!/usr/bin/env bash\nset -euo pipefail\nexit 1\n'
        );
        writeFileSync(
          join(fixture, 'ops', 'validate-variants.sh'),
          '#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n'
        );
        writeFileSync(join(fixture, 'ops', 'test-skills.sh'), '#!/usr/bin/env bash\nset -euo pipefail\nexit 1\n');
        writeFileSync(
          join(fixture, 'ops', 'analytics-report.sh'),
          '#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n'
        );
        writeFileSync(
          join(fixture, 'adapters', 'claude', 'dev-test.sh'),
          '#!/usr/bin/env bash\nset -euo pipefail\necho "Validation failed"\nexit 1\n'
        );

        spawnSync('git', ['init', '-b', 'main'], { cwd: fixture, encoding: 'utf8' });

        const result = spawnSync(BASH_COMMAND, [join(fixture, 'ops', 'full-integration-test.sh')], {
          cwd: fixture,
          encoding: 'utf8',
        });
        assert.notEqual(result.status, 0, 'expected non-zero exit with failing checks');
        assert.match(result.stdout, /=== Test Summary ===/);
        assert.match(result.stdout, /Passed:\s+\d+/);
        assert.match(result.stdout, /Failed:\s+\d+/);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    }
  );
});
