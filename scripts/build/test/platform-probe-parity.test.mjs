/**
 * platform-probe-parity.test.mjs
 *
 * Consistency gate for platform identity across three sources of truth:
 * 1. Runtime probe outputs (ops/capability-probe.sh)
 * 2. Platform YAML definitions (shared/targets/platforms/*.yaml)
 * 3. Emitted registry platform_definitions (dist/registry/index.json)
 *
 * Scope is intentionally narrow: this does not re-test every capability probe.
 * It only verifies that supported platform/surface identities stay in sync.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlatforms } from '../lib/load-platforms.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const PROBE_SCRIPT = join(REPO_ROOT, 'ops', 'capability-probe.sh');
const COMPILE_MJS = join(REPO_ROOT, 'scripts', 'build', 'compile.mjs');
const REGISTRY_INDEX = join(REPO_ROOT, 'dist', 'registry', 'index.json');
const IS_WINDOWS = process.platform === 'win32';

const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    ![
      'CLAUDE_CODE_ENTRYPOINT',
      'CLAUDE_CODE_REMOTE',
      'CLAUDE_CODE',
      'CODEX_SURFACE',
      'CODEX_CLI',
      'CURSOR_SESSION',
      'GITHUB_ACTIONS',
      'GITLAB_CI',
      'CI',
      'VSCODE_INJECTION',
      'VSCODE_IPC_HOOK_CLI',
      'IDEA_HOME',
      'JETBRAINS_TOOLBOX_TOOL_NAME',
      'SSH_CONNECTION',
      'CLAUDE_SURFACE',
    ].includes(key)
  )
);

const SUPPORTED_RUNTIME_PLATFORMS = [
  {
    id: 'ci-generic',
    selection: { type: 'runtime', env: { CI: 'true' } },
    expectedSurface: 'ci-pipeline',
  },
  {
    id: 'claude-code',
    selection: { type: 'runtime', env: { CLAUDE_CODE: '1' } },
    expectedSurface: 'desktop-cli',
  },
  {
    id: 'claude-code-remote',
    selection: { type: 'runtime', env: { CLAUDE_CODE_REMOTE: '1' } },
    expectedSurface: 'desktop-cli',
  },
  {
    id: 'claude-ios',
    selection: { type: 'runtime', env: { CLAUDE_CODE_ENTRYPOINT: 'remote_mobile' } },
    expectedSurface: 'mobile-app',
  },
  {
    id: 'claude-jetbrains',
    selection: { type: 'runtime', env: { IDEA_HOME: '/Applications/IntelliJ IDEA.app' } },
    expectedSurface: 'desktop-ide',
  },
  {
    id: 'claude-ssh',
    selection: { type: 'runtime', env: { SSH_CONNECTION: '10.0.0.1 12345 10.0.0.2 22' } },
    expectedSurface: 'remote-shell',
  },
  {
    id: 'claude-vscode',
    selection: { type: 'runtime', env: { VSCODE_INJECTION: '1' } },
    expectedSurface: 'desktop-ide',
  },
  {
    id: 'claude-web',
    selection: { type: 'runtime', env: { CLAUDE_CODE_ENTRYPOINT: 'web' } },
    expectedSurface: 'web-app',
  },
  {
    id: 'codex',
    selection: { type: 'runtime', env: { CODEX_SURFACE: 'cli' } },
    expectedSurface: 'cloud-sandbox',
  },
  {
    id: 'codex-desktop',
    selection: { type: 'runtime', env: { CODEX_SURFACE: 'desktop' } },
    expectedSurface: 'desktop-app',
  },
  {
    id: 'cursor',
    selection: { type: 'runtime', env: { CURSOR_SESSION: '1' } },
    expectedSurface: 'desktop-ide',
  },
  {
    id: 'github-actions',
    selection: { type: 'runtime', env: { GITHUB_ACTIONS: 'true' } },
    expectedSurface: 'ci-pipeline',
  },
  {
    id: 'gitlab-ci',
    selection: { type: 'runtime', env: { GITLAB_CI: 'true' } },
    expectedSurface: 'ci-pipeline',
  },
];

const COMPILE_TIME_ONLY_PLATFORMS = [
  {
    id: 'claude-desktop',
    selection: {
      type: 'compile-time',
      story: 'compile-time package selection only until Claude Desktop exposes a distinct runtime signal',
    },
    expectedSurface: 'desktop-app',
  },
];

let registryBuilt = false;

function ensureFreshRegistry() {
  if (registryBuilt) {
    return;
  }

  const result = spawnSync(process.execPath, [COMPILE_MJS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
  }
  assert.equal(result.status, 0, `compile.mjs must succeed before parity assertions`);
  registryBuilt = true;
}

function readRegistry() {
  ensureFreshRegistry();
  return JSON.parse(readFileSync(REGISTRY_INDEX, 'utf8'));
}

function probeWith(env) {
  const output = execFileSync('bash', [PROBE_SCRIPT, '--quiet'], {
    env: { ...BASE_ENV, HOME: process.env.HOME || '/tmp', ...env },
    encoding: 'utf8',
  });
  const jsonStart = output.indexOf('{');
  assert.ok(jsonStart >= 0, 'probe must output JSON');
  return JSON.parse(output.slice(jsonStart));
}

function sortIds(records) {
  return [...records].map(record => record.id).sort();
}

describe('platform/probe parity contract', () => {
  test('platform YAML coverage matches supported selection stories', async () => {
    const { platforms, errors } = await loadPlatforms(REPO_ROOT);
    assert.deepEqual(errors, [], 'platform YAMLs should load without errors');

    const yamlIds = [...platforms.keys()].sort();
    const canonicalIds = sortIds([
      ...SUPPORTED_RUNTIME_PLATFORMS,
      ...COMPILE_TIME_ONLY_PLATFORMS,
    ]);

    assert.deepEqual(
      yamlIds,
      canonicalIds,
      'every platform YAML must be representable by either a supported runtime signal or an explicit compile-time-only selection story'
    );
  });

  test('registry platform_definitions stays in lockstep with platform YAMLs', async () => {
    const { platforms, errors } = await loadPlatforms(REPO_ROOT);
    assert.deepEqual(errors, [], 'platform YAMLs should load without errors');

    const registry = readRegistry();
    const registryDefs = registry.platform_definitions || {};

    assert.deepEqual(
      Object.keys(registryDefs).sort(),
      [...platforms.keys()].sort(),
      'registry platform_definitions must mirror every platform YAML definition'
    );

    for (const [platformId, yamlDef] of platforms) {
      assert.equal(
        registryDefs[platformId]?.surface,
        yamlDef.surface,
        `registry surface for ${platformId} must match shared/targets/platforms/${platformId}.yaml`
      );
    }
  });

  test('runtime-detectable platforms resolve to YAML and registry definitions with matching surface hints', {
    skip: IS_WINDOWS ? 'bash not available on Windows' : false,
  }, async () => {
    const { platforms, errors } = await loadPlatforms(REPO_ROOT);
    assert.deepEqual(errors, [], 'platform YAMLs should load without errors');

    const registry = readRegistry();
    const registryDefs = registry.platform_definitions || {};

    for (const runtimePlatform of SUPPORTED_RUNTIME_PLATFORMS) {
      const probe = probeWith(runtimePlatform.selection.env);
      const yamlDef = platforms.get(runtimePlatform.id);
      const registryDef = registryDefs[runtimePlatform.id];

      assert.equal(
        probe.platform_hint,
        runtimePlatform.id,
        `probe must emit ${runtimePlatform.id} for its canonical runtime signal`
      );
      assert.ok(
        registryDef,
        `probe emitted ${runtimePlatform.id}, but dist/registry/index.json has no platform_definitions entry`
      );
      assert.ok(
        yamlDef,
        `probe emitted ${runtimePlatform.id}, but shared/targets/platforms/${runtimePlatform.id}.yaml is missing`
      );
      assert.equal(
        yamlDef.surface,
        runtimePlatform.expectedSurface,
        `${runtimePlatform.id} YAML surface must match the canonical runtime surface`
      );
      assert.equal(
        registryDef.surface,
        runtimePlatform.expectedSurface,
        `${runtimePlatform.id} registry surface must match the canonical runtime surface`
      );
      assert.equal(
        probe.surface_hint,
        runtimePlatform.expectedSurface,
        `${runtimePlatform.id} probe surface_hint must match the canonical runtime surface`
      );
      assert.equal(
        probe.surface_hint,
        yamlDef.surface,
        `${runtimePlatform.id} probe surface_hint must match the YAML surface field`
      );
      assert.equal(
        probe.surface_hint,
        registryDef.surface,
        `${runtimePlatform.id} probe surface_hint must match the emitted registry surface`
      );
    }
  });

  test('compile-time-only platforms still require registry parity', async () => {
    const { platforms, errors } = await loadPlatforms(REPO_ROOT);
    assert.deepEqual(errors, [], 'platform YAMLs should load without errors');

    const registry = readRegistry();
    const registryDefs = registry.platform_definitions || {};

    for (const compileTimePlatform of COMPILE_TIME_ONLY_PLATFORMS) {
      const yamlDef = platforms.get(compileTimePlatform.id);
      const registryDef = registryDefs[compileTimePlatform.id];

      assert.ok(
        compileTimePlatform.selection.story,
        `${compileTimePlatform.id} must declare its compile-time selection story`
      );
      assert.ok(
        yamlDef,
        `${compileTimePlatform.id} must keep a platform YAML even when selection is compile-time only`
      );
      assert.ok(
        registryDef,
        `${compileTimePlatform.id} must keep an emitted registry platform definition even when selection is compile-time only`
      );
      assert.equal(
        yamlDef.surface,
        compileTimePlatform.expectedSurface,
        `${compileTimePlatform.id} YAML surface must stay canonical`
      );
      assert.equal(
        registryDef.surface,
        yamlDef.surface,
        `${compileTimePlatform.id} registry surface must match YAML surface`
      );
    }
  });
});
