import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { safeImport } from '../lib/windows-safe-import.mjs';

const { resolveProviderContext } = await safeImport('../../../adapters/bootstrap/provider-context.mjs', import.meta.url);
const { executeBootstrap } = await safeImport('../../../adapters/bootstrap/core.mjs', import.meta.url);

function createRunner(resultsByPhase) {
  return (command) => {
    const phase = Object.entries(resultsByPhase).find(([, matcher]) => command.join(' ').includes(matcher.match));
    if (!phase) {
      return { ok: true, code: 0, stdout: '', stderr: '' };
    }

    return phase[1].result;
  };
}

describe('bootstrap provider context', () => {
  test('maps Claude remote to a fully-capable adapter context', () => {
    const context = resolveProviderContext({
      cwd: '/repo',
      home: '/home/tester',
      env: {
        HOME: '/home/tester',
        CLAUDE_CODE_REMOTE: 'true',
        CLAUDE_PROJECT_DIR: '/repo',
        AI_CONFIG_WORKER: 'https://example.invalid',
        AI_CONFIG_TOKEN: 'token',
      },
    });

    assert.equal(context.provider, 'claude');
    assert.equal(context.startup.shouldInstallOnStart, true);
    assert.equal(context.capabilities.can_fetch_bundle, true);
    assert.equal(context.capabilities.can_validate, true);
    assert.match(context.commands.remote_install.join(' '), /materialise\.sh bootstrap/);
  });

  test('maps Codex and Cursor profiles without startup-blocking behavior', () => {
    const codex = resolveProviderContext({
      cwd: '/repo',
      home: '/home/tester',
      env: { HOME: '/home/tester', CODEX_CLI: '1' },
    });
    const cursor = resolveProviderContext({
      cwd: '/repo',
      home: '/home/tester',
      env: { HOME: '/home/tester', CURSOR_SESSION: '1' },
    });

    assert.equal(codex.provider, 'codex');
    assert.equal(codex.startup.shouldInstallOnStart, false);
    assert.equal(cursor.provider, 'cursor');
    assert.equal(cursor.capabilities.can_materialize_skills, false);
  });

  test('maps unknown environments to a safe no-op context', () => {
    const context = resolveProviderContext({
      cwd: '/repo',
      home: '/home/tester',
      env: { HOME: '/home/tester' },
    });

    assert.equal(context.provider, 'unknown');
    assert.equal(context.startup.shouldInstallOnStart, false);
    assert.equal(context.capabilities.can_write_target, false);
  });
});

describe('bootstrap core execution', () => {
  test('runs only install-critical work inline and defers non-critical work by default', () => {
    const events = [];
    const deferred = [];
    const context = {
      provider: 'claude',
      startup: { shouldInstallOnStart: true },
      capabilities: {
        can_fetch_bundle: true,
        can_auth_bundle_source: true,
        can_materialize_skills: true,
        can_write_target: true,
        can_validate: true,
        can_probe_runtime: true,
        can_sync_runtime: true,
      },
      paths: {
        repo_root: process.cwd(),
        local_bundle: '/nonexistent',
      },
      commands: {
        remote_install: ['bash', 'materialise.sh', 'bootstrap'],
        deferred: [
          { phase: 'probe_runtime', required_capability: 'can_probe_runtime', command: ['bash', 'probe.sh'] },
          { phase: 'validate', required_capability: 'can_validate', command: ['bash', 'validate.sh'] },
        ],
      },
    };

    const { result, exitCode } = executeBootstrap({
      env: {},
      cwd: process.cwd(),
      context,
      runCommand: () => ({ ok: true, code: 0, stdout: '', stderr: '' }),
      eventSink: (event) => events.push(event),
      spawnDeferred: ({ deferredJobs }) => deferred.push(...deferredJobs),
    });

    assert.equal(exitCode, 0);
    assert.equal(result.ok, true);
    assert.equal(result.installed, true);
    assert.equal(result.source, 'remote');
    assert.deepEqual(result.deferred_jobs, ['probe_runtime', 'validate']);
    assert.deepEqual(deferred, ['probe_runtime', 'validate']);
    assert.ok(events.some((event) => event.phase === 'acquire_remote_bundle' && event.result === 'ok'));
    assert.equal(events.some((event) => event.phase === 'validate' && event.deferred === false), false);
  });

  test('falls back to local materialization when remote install fails', () => {
    const events = [];
    const context = {
      provider: 'claude',
      startup: { shouldInstallOnStart: true },
      capabilities: {
        can_fetch_bundle: true,
        can_auth_bundle_source: true,
        can_materialize_skills: true,
        can_write_target: true,
        can_validate: true,
        can_probe_runtime: true,
        can_sync_runtime: true,
      },
      paths: {
        repo_root: process.cwd(),
        local_bundle: process.cwd(),
      },
      commands: {
        remote_install: ['bash', 'materialise.sh', 'bootstrap'],
        materialize_local: ['bash', 'materialise.sh', 'extract'],
        install_target: ['bash', 'materialise.sh', 'install'],
        deferred: [],
      },
    };

    const runner = createRunner({
      remote: {
        match: 'bootstrap',
        result: { ok: false, code: 1, stdout: '', stderr: 'remote failed' },
      },
      extract: {
        match: 'extract',
        result: { ok: true, code: 0, stdout: '', stderr: '' },
      },
      install: {
        match: 'install',
        result: { ok: true, code: 0, stdout: '', stderr: '' },
      },
    });

    const { result, exitCode } = executeBootstrap({
      env: {},
      cwd: process.cwd(),
      context,
      runCommand: runner,
      eventSink: (event) => events.push(event),
      spawnDeferred: () => {},
    });

    assert.equal(exitCode, 0);
    assert.equal(result.installed, true);
    assert.equal(result.source, 'local');
    assert.equal(result.fallback_used, true);
    assert.ok(result.errors.some((error) => error.code === 'REMOTE_BUNDLE_FAILED'));
    assert.ok(events.some((event) => event.phase === 'materialize_local' && event.result === 'ok'));
    assert.ok(events.some((event) => event.phase === 'install_target' && event.result === 'ok'));
  });

  test('returns non-zero only when the install path fails', () => {
    const context = {
      provider: 'claude',
      startup: { shouldInstallOnStart: true },
      capabilities: {
        can_fetch_bundle: false,
        can_auth_bundle_source: false,
        can_materialize_skills: true,
        can_write_target: true,
        can_validate: true,
        can_probe_runtime: true,
        can_sync_runtime: true,
      },
      paths: {
        repo_root: process.cwd(),
        local_bundle: process.cwd(),
      },
      commands: {
        materialize_local: ['bash', 'materialise.sh', 'extract'],
        install_target: ['bash', 'materialise.sh', 'install'],
        deferred: [],
      },
    };

    const runner = createRunner({
      extract: {
        match: 'extract',
        result: { ok: true, code: 0, stdout: '', stderr: '' },
      },
      install: {
        match: 'install',
        result: { ok: false, code: 1, stdout: '', stderr: 'permission denied' },
      },
    });

    const { result, exitCode } = executeBootstrap({
      env: {},
      cwd: process.cwd(),
      context,
      runCommand: runner,
      eventSink: () => {},
      spawnDeferred: () => {},
    });

    assert.equal(exitCode, 1);
    assert.equal(result.ok, false);
    assert.equal(result.installed, false);
    assert.ok(result.errors.some((error) => error.code === 'INSTALL_TARGET_FAILED'));
  });

  test('strict mode runs deferred phases inline and preserves schema invariants', () => {
    const events = [];
    const commands = [];
    const context = {
      provider: 'claude',
      startup: { shouldInstallOnStart: true },
      capabilities: {
        can_fetch_bundle: true,
        can_auth_bundle_source: true,
        can_materialize_skills: true,
        can_write_target: true,
        can_validate: true,
        can_probe_runtime: true,
        can_sync_runtime: true,
      },
      paths: {
        repo_root: process.cwd(),
        local_bundle: process.cwd(),
      },
      commands: {
        remote_install: ['bash', 'materialise.sh', 'bootstrap'],
        deferred: [
          { phase: 'probe_runtime', required_capability: 'can_probe_runtime', command: ['bash', 'probe.sh'] },
          { phase: 'sync_runtime', required_capability: 'can_sync_runtime', command: ['bash', 'sync.sh'] },
        ],
      },
    };

    const { result, exitCode } = executeBootstrap({
      env: { AI_CONFIG_STRICT_BOOTSTRAP: '1' },
      cwd: process.cwd(),
      context,
      runCommand: (command) => {
        commands.push(command.join(' '));
        return { ok: true, code: 0, stdout: '', stderr: '' };
      },
      eventSink: (event) => events.push(event),
      spawnDeferred: () => {
        throw new Error('strict mode should not dispatch background work');
      },
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(result.deferred_jobs, []);
    assert.ok(commands.some((command) => command.includes('probe.sh')));
    assert.ok(commands.some((command) => command.includes('sync.sh')));
    assert.ok(events.some((event) => event.phase === 'probe_runtime' && event.result === 'ok'));
    assert.equal(typeof result.ok, 'boolean');
    assert.equal(typeof result.provider, 'string');
    assert.equal(Array.isArray(result.errors), true);
    assert.equal(typeof result.durations, 'object');
  });

  test('skips deferred phases when their required capability is disabled', () => {
    const events = [];
    const context = {
      provider: 'claude',
      startup: { shouldInstallOnStart: true },
      capabilities: {
        can_fetch_bundle: true,
        can_auth_bundle_source: true,
        can_materialize_skills: true,
        can_write_target: true,
        can_validate: false,
        can_probe_runtime: true,
        can_sync_runtime: false,
      },
      paths: {
        repo_root: process.cwd(),
        local_bundle: process.cwd(),
      },
      commands: {
        remote_install: ['bash', 'materialise.sh', 'bootstrap'],
        deferred: [
          { phase: 'probe_runtime', required_capability: 'can_probe_runtime', command: ['bash', 'probe.sh'] },
          { phase: 'validate', required_capability: 'can_validate', command: ['bash', 'validate.sh'] },
        ],
      },
    };

    const { result } = executeBootstrap({
      env: {},
      cwd: process.cwd(),
      context,
      runCommand: () => ({ ok: true, code: 0, stdout: '', stderr: '' }),
      eventSink: (event) => events.push(event),
      spawnDeferred: () => {},
    });

    assert.deepEqual(result.deferred_jobs, ['probe_runtime']);
    assert.ok(events.some((event) => event.phase === 'validate' && event.result === 'skipped'));
  });

  test('writes telemetry events to the bootstrap JSONL log by default', () => {
    const telemetryHome = join(tmpdir(), `bootstrap-telemetry-${process.pid}`);
    const context = {
      provider: 'claude',
      startup: { shouldInstallOnStart: true },
      capabilities: {
        can_fetch_bundle: true,
        can_auth_bundle_source: true,
        can_materialize_skills: true,
        can_write_target: true,
        can_validate: false,
        can_probe_runtime: false,
        can_sync_runtime: false,
      },
      paths: {
        repo_root: process.cwd(),
        local_bundle: process.cwd(),
      },
      commands: {
        remote_install: ['bash', 'materialise.sh', 'bootstrap'],
        deferred: [],
      },
    };

    try {
      const { result, exitCode } = executeBootstrap({
        env: {
          HOME: telemetryHome,
          AI_CONFIG_BOOTSTRAP_STDOUT: '0',
        },
        cwd: process.cwd(),
        context,
        runCommand: () => ({ ok: true, code: 0, stdout: '', stderr: '' }),
        spawnDeferred: () => {},
      });

      assert.equal(exitCode, 0);
      assert.ok(result.telemetry_path, 'telemetry path should be reported in the result');
      assert.ok(existsSync(result.telemetry_path), 'telemetry log should be created');

      const lines = readFileSync(result.telemetry_path, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));

      assert.ok(lines.some((event) => event.phase === 'resolve_provider'));
      assert.ok(lines.some((event) => event.phase === 'bootstrap_result'));
      assert.ok(lines.every((event) => typeof event.duration_ms === 'number'));
    } finally {
      rmSync(telemetryHome, { recursive: true, force: true });
    }
  });
});
