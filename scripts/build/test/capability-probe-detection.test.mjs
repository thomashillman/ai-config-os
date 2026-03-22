/**
 * capability-probe-detection.test.mjs
 *
 * Tests that ops/capability-probe.sh correctly detects platform and surface
 * from environment variable signals for new surfaces added in v0.9.0.
 *
 * Shell-based test — skipped on non-POSIX platforms (Windows).
 * See CLAUDE.md CI pitfall #2: don't test bash scripts in multi-platform CI.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const PROBE_SCRIPT = join(REPO_ROOT, 'ops', 'capability-probe.sh');

// Skip all tests on Windows (bash not available)
const IS_WINDOWS = process.platform === 'win32';

// Minimal env: strip all platform signals from the parent environment
// so tests are isolated from the session's actual surface.
const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    !['CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_REMOTE', 'CLAUDE_CODE',
      'CODEX_SURFACE', 'CODEX_CLI', 'CURSOR_SESSION',
      'GITHUB_ACTIONS', 'GITLAB_CI', 'CI',
      'VSCODE_INJECTION', 'VSCODE_IPC_HOOK_CLI',
      'IDEA_HOME', 'JETBRAINS_TOOLBOX_TOOL_NAME',
      'SSH_CONNECTION',
    ].includes(k)
  )
);

/**
 * Run probe with given extra env vars; parse JSON output.
 * Strips progress lines (lines not starting with '{') before parsing.
 */
function probeWith(extraEnv) {
  const output = execFileSync(
    'bash',
    [PROBE_SCRIPT, '--quiet'],
    { env: { ...BASE_ENV, HOME: process.env.HOME || '/tmp', ...extraEnv }, encoding: 'utf8' }
  );
  // Find the JSON object (last line that starts with '{' or the whole block)
  const jsonStart = output.indexOf('{');
  assert.ok(jsonStart >= 0, 'probe must output JSON');
  return JSON.parse(output.slice(jsonStart));
}

describe('capability-probe surface detection', { skip: IS_WINDOWS ? 'bash not available on Windows' : false }, () => {
  test('probe script exists', () => {
    assert.ok(existsSync(PROBE_SCRIPT), `probe script must exist at ${PROBE_SCRIPT}`);
  });

  test('CODEX_SURFACE=desktop → codex-desktop / desktop-app', () => {
    const result = probeWith({ CODEX_SURFACE: 'desktop' });
    assert.equal(result.platform_hint, 'codex-desktop');
    assert.equal(result.surface_hint, 'desktop-app');
  });

  test('CODEX_SURFACE=cli → codex / cloud-sandbox', () => {
    const result = probeWith({ CODEX_SURFACE: 'cli' });
    assert.equal(result.platform_hint, 'codex');
    assert.equal(result.surface_hint, 'cloud-sandbox');
  });

  test('GITHUB_ACTIONS=true → github-actions / ci-pipeline', () => {
    const result = probeWith({ GITHUB_ACTIONS: 'true' });
    assert.equal(result.platform_hint, 'github-actions');
    assert.equal(result.surface_hint, 'ci-pipeline');
  });

  test('GITLAB_CI=true → gitlab-ci / ci-pipeline', () => {
    const result = probeWith({ GITLAB_CI: 'true' });
    assert.equal(result.platform_hint, 'gitlab-ci');
    assert.equal(result.surface_hint, 'ci-pipeline');
  });

  test('VSCODE_INJECTION set → claude-vscode / desktop-ide', () => {
    const result = probeWith({ VSCODE_INJECTION: '1' });
    assert.equal(result.platform_hint, 'claude-vscode');
    assert.equal(result.surface_hint, 'desktop-ide');
  });

  test('VSCODE_IPC_HOOK_CLI set → claude-vscode / desktop-ide', () => {
    const result = probeWith({ VSCODE_IPC_HOOK_CLI: '/tmp/vscode-ipc' });
    assert.equal(result.platform_hint, 'claude-vscode');
    assert.equal(result.surface_hint, 'desktop-ide');
  });

  test('CI=true (generic) → ci-generic / ci-pipeline', () => {
    const result = probeWith({ CI: 'true' });
    assert.equal(result.platform_hint, 'ci-generic');
    assert.equal(result.surface_hint, 'ci-pipeline');
  });

  test('IDEA_HOME set → claude-jetbrains / desktop-ide', () => {
    const result = probeWith({ IDEA_HOME: '/Applications/IDEA' });
    assert.equal(result.platform_hint, 'claude-jetbrains');
    assert.equal(result.surface_hint, 'desktop-ide');
  });

  test('SSH_CONNECTION set without CLAUDE_CODE_REMOTE → claude-ssh / remote-shell', () => {
    const result = probeWith({ SSH_CONNECTION: '1 2 3 4' });
    assert.equal(result.platform_hint, 'claude-ssh');
    assert.equal(result.surface_hint, 'remote-shell');
  });

  test('CLAUDE_CODE_REMOTE set → claude-code-remote / desktop-cli', () => {
    const result = probeWith({ CLAUDE_CODE_REMOTE: '1' });
    assert.equal(result.platform_hint, 'claude-code-remote');
    assert.equal(result.surface_hint, 'desktop-cli');
  });

  test('GITHUB_ACTIONS=true + CI=true → github-actions', () => {
    const result = probeWith({ GITHUB_ACTIONS: 'true', CI: 'true' });
    assert.equal(result.platform_hint, 'github-actions');
    assert.equal(result.surface_hint, 'ci-pipeline');
  });

  test('GITLAB_CI=true + CI=true → gitlab-ci', () => {
    const result = probeWith({ GITLAB_CI: 'true', CI: 'true' });
    assert.equal(result.platform_hint, 'gitlab-ci');
    assert.equal(result.surface_hint, 'ci-pipeline');
  });

  test('CODEX_SURFACE=desktop + GITHUB_ACTIONS=true → codex-desktop', () => {
    const result = probeWith({ CODEX_SURFACE: 'desktop', GITHUB_ACTIONS: 'true' });
    assert.equal(result.platform_hint, 'codex-desktop');
    assert.equal(result.surface_hint, 'desktop-app');
  });

  test('CLAUDE_CODE_ENTRYPOINT=remote_mobile + GITHUB_ACTIONS=true → claude-ios', () => {
    const result = probeWith({ CLAUDE_CODE_ENTRYPOINT: 'remote_mobile', GITHUB_ACTIONS: 'true' });
    assert.equal(result.platform_hint, 'claude-ios');
    assert.equal(result.surface_hint, 'mobile-app');
  });

  test('VSCODE_INJECTION=1 + SSH_CONNECTION=... → claude-vscode', () => {
    const result = probeWith({ VSCODE_INJECTION: '1', SSH_CONNECTION: '1.2.3.4 1234 5.6.7.8 22' });
    assert.equal(result.platform_hint, 'claude-vscode');
    assert.equal(result.surface_hint, 'desktop-ide');
  });

  test('SSH_CONNECTION=... + CLAUDE_CODE_REMOTE=1 → claude-code-remote', () => {
    const result = probeWith({ SSH_CONNECTION: '1.2.3.4 1234 5.6.7.8 22', CLAUDE_CODE_REMOTE: '1' });
    assert.equal(result.platform_hint, 'claude-code-remote');
    assert.equal(result.surface_hint, 'desktop-cli');
  });

  test('unset signals do not accidentally classify as CI or IDE', () => {
    const result = probeWith({});
    assert.notEqual(result.platform_hint, 'github-actions');
    assert.notEqual(result.platform_hint, 'gitlab-ci');
    assert.notEqual(result.platform_hint, 'ci-generic');
    assert.notEqual(result.platform_hint, 'claude-vscode');
    assert.notEqual(result.platform_hint, 'claude-jetbrains');
    assert.notEqual(result.surface_hint, 'ci-pipeline');
    assert.notEqual(result.surface_hint, 'desktop-ide');
  });

  test('unknown CODEX_SURFACE values fall through safely', () => {
    // An unrecognised CODEX_SURFACE value must not trigger Codex-specific
    // classification.  The probe should fall through to lower-precedence
    // signals (e.g. `command -v claude` when the binary is on PATH), so we
    // cannot assert a single expected final value — only that the Codex
    // platforms were NOT incorrectly selected.
    const result = probeWith({ CODEX_SURFACE: 'spaceship' });
    assert.notEqual(result.platform_hint, 'codex-desktop',
      'unknown CODEX_SURFACE must not map to codex-desktop');
    assert.notEqual(result.platform_hint, 'codex',
      'unknown CODEX_SURFACE must not map to codex');
    assert.notEqual(result.surface_hint, 'desktop-app',
      'unknown CODEX_SURFACE must not produce codex-desktop surface hint');
    assert.notEqual(result.surface_hint, 'cloud-sandbox',
      'unknown CODEX_SURFACE must not produce codex surface hint');
  });

  test('probe output has required fields', () => {
    const result = probeWith({ GITHUB_ACTIONS: 'true' });
    assert.ok(result.probe_version, 'must have probe_version');
    assert.ok(result.probed_at, 'must have probed_at');
    assert.ok(result.platform_hint, 'must have platform_hint');
    assert.ok(result.surface_hint, 'must have surface_hint');
    assert.ok(result.results, 'must have results');
  });
});
