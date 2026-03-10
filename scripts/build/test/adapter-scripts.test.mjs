import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveBashCommand } from './shell-test-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const BASH_COMMAND = resolveBashCommand();
const SHELL_TEST_OPTIONS = BASH_COMMAND
  ? {}
  : { skip: 'bash is unavailable for shell integration tests' };

function toPosixPath(path) {
  return path.replace(/\\/g, '/');
}

function runBash(scriptPath, { cwd, env = {}, args = [] } = {}) {
  if (!BASH_COMMAND) {
    throw new Error('bash is unavailable for shell integration tests');
  }

  return spawnSync(BASH_COMMAND, [toPosixPath(scriptPath), ...args.map(toPosixPath)], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function createClaudeDevTestFixture({ dependencyExit = 0, variantsExit = 0 } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'adapter-dev-test-'));
  mkdirSync(join(fixture, 'adapters', 'claude'), { recursive: true });
  mkdirSync(join(fixture, 'ops'), { recursive: true });
  mkdirSync(join(fixture, 'plugins', 'core-skills'), { recursive: true });

  copyFileSync(
    join(REPO_ROOT, 'adapters', 'claude', 'dev-test.sh'),
    join(fixture, 'adapters', 'claude', 'dev-test.sh')
  );

  writeFileSync(
    join(fixture, 'ops', 'validate-dependencies.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
exit ${dependencyExit}
`
  );
  writeFileSync(
    join(fixture, 'ops', 'validate-variants.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
exit ${variantsExit}
`
  );

  spawnSync('git', ['init', '-b', 'main'], { cwd: fixture, encoding: 'utf8' });
  return fixture;
}

function createClaudeWrapper({ captureDir, targetScript, claudeExit = 0 }) {
  const wrapperPath = join(captureDir, 'run-dev-test.sh');
  writeFileSync(
    wrapperPath,
    `#!/usr/bin/env bash
set -euo pipefail
claude() {
  pwd -W > "$CLAUDE_CWD_FILE"
  printf '%s\\n' "$@" > "$CLAUDE_ARGS_FILE"
  return ${claudeExit}
}
export -f claude
"${toPosixPath(targetScript)}"
`
  );
  return wrapperPath;
}

describe('adapter scripts: claude dev-test', () => {
  test('runs validation from the repository root even when invoked elsewhere', SHELL_TEST_OPTIONS, () => {
    const fixture = createClaudeDevTestFixture();
    const outsideDir = mkdtempSync(join(tmpdir(), 'adapter-dev-test-outside-'));
    const captureDir = mkdtempSync(join(tmpdir(), 'adapter-dev-test-capture-'));

    try {
      const wrapper = createClaudeWrapper({
        captureDir,
        targetScript: join(fixture, 'adapters', 'claude', 'dev-test.sh'),
      });

      const result = runBash(wrapper, {
        cwd: outsideDir,
        env: {
          CLAUDE_CWD_FILE: join(captureDir, 'claude.cwd'),
          CLAUDE_ARGS_FILE: join(captureDir, 'claude.args'),
        },
      });

      assert.equal(result.status, 0, `dev-test.sh failed:\n${result.stdout}\n${result.stderr}`);

      const claudeCwd = readFileSync(join(captureDir, 'claude.cwd'), 'utf8').trim();
      const claudeArgs = readFileSync(join(captureDir, 'claude.args'), 'utf8')
        .trim()
        .split(/\r?\n/);

      assert.equal(
        resolve(claudeCwd),
        resolve(fixture),
        'dev-test should validate from the repository root'
      );
      assert.deepEqual(
        claudeArgs.slice(0, 2),
        ['plugin', 'validate'],
        'dev-test should invoke claude plugin validation'
      );
      assert.notEqual(claudeArgs[2], '.', 'dev-test should not validate the caller directory');
      assert.equal(
        claudeArgs[2].split('/').filter(Boolean).at(-1),
        fixture.split(/[\\/]/).filter(Boolean).at(-1),
        'dev-test should validate the resolved repository path'
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
      rmSync(captureDir, { recursive: true, force: true });
    }
  });

  test('fails fast when prerequisite validators fail', SHELL_TEST_OPTIONS, () => {
    const fixture = createClaudeDevTestFixture({ dependencyExit: 17 });
    const outsideDir = mkdtempSync(join(tmpdir(), 'adapter-dev-test-outside-'));
    const captureDir = mkdtempSync(join(tmpdir(), 'adapter-dev-test-capture-'));

    try {
      const wrapper = createClaudeWrapper({
        captureDir,
        targetScript: join(fixture, 'adapters', 'claude', 'dev-test.sh'),
      });

      const result = runBash(wrapper, {
        cwd: outsideDir,
        env: {
          CLAUDE_CWD_FILE: join(captureDir, 'claude.cwd'),
          CLAUDE_ARGS_FILE: join(captureDir, 'claude.args'),
        },
      });

      assert.notEqual(result.status, 0, 'dev-test should fail when a validator fails');
      assert.equal(
        existsSync(join(captureDir, 'claude.args')),
        false,
        'claude validation should not run after a prerequisite failure'
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
      rmSync(captureDir, { recursive: true, force: true });
    }
  });
});

describe('adapter scripts: cursor installer', () => {
  test('replaces an existing managed block instead of leaving stale rules behind', SHELL_TEST_OPTIONS, () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'cursor-install-'));
    const cursorRules = join(targetDir, '.cursorrules');

    try {
      writeFileSync(
        cursorRules,
        [
          '# User rules',
          '',
          '# --- AI Config OS Configuration ---',
          'stale content',
          '',
        ].join('\n')
      );

      const installScript = join(REPO_ROOT, 'adapters', 'cursor', 'install.sh');

      const firstRun = runBash(installScript, {
        cwd: REPO_ROOT,
        env: { HOME: targetDir },
        args: [targetDir],
      });
      assert.equal(firstRun.status, 0, `cursor install failed:\n${firstRun.stdout}\n${firstRun.stderr}`);

      const secondRun = runBash(installScript, {
        cwd: REPO_ROOT,
        env: { HOME: targetDir },
        args: [targetDir],
      });
      assert.equal(secondRun.status, 0, `second cursor install failed:\n${secondRun.stdout}\n${secondRun.stderr}`);

      const content = readFileSync(cursorRules, 'utf8');
      const startMarker = '# --- AI Config OS Configuration (start) ---';
      const endMarker = '# --- AI Config OS Configuration (end) ---';

      assert.equal(
        (content.match(new RegExp(startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length,
        1,
        'installer should keep a single managed block after repeated runs'
      );
      assert.ok(content.includes(endMarker), 'installer should add an end marker for the managed block');
      assert.ok(content.includes('# Principles'), 'installer should refresh current principles content');
      assert.ok(content.includes('- **code-review**:'), 'installer should refresh current skill summary');
      assert.equal(content.includes('stale content'), false, 'installer should remove stale managed content');
      assert.ok(content.startsWith('# User rules'), 'installer should preserve unrelated user content');
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});
