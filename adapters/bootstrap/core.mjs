import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveProviderContext } from './provider-context.mjs';
import { createTelemetrySink } from './telemetry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFERRED_RUNNER = join(__dirname, 'run-deferred.mjs');

function defaultRunCommand(command, { cwd, env, deferred = false } = {}) {
  const [cmd, ...args] = command;
  const runner = deferred ? spawn : spawnSync;

  if (deferred) {
    const child = runner(cmd, args, {
      cwd,
      env,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { ok: true, code: 0, stdout: '', stderr: '' };
  }

  const result = runner(cmd, args, {
    cwd,
    env,
    encoding: 'utf8',
  });

  return {
    ok: result.status === 0,
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function createError(code, message, detail = undefined) {
  return detail ? { code, message, detail } : { code, message };
}

function emitPhaseEvent({ eventSink, provider, phase, durationMs, result, errorCode = null, deferred = false }) {
  eventSink({
    phase,
    provider,
    duration_ms: durationMs,
    result,
    error_code: errorCode,
    deferred,
  });
}

function isCapabilityEnabled(context, capabilityName) {
  if (!capabilityName) {
    return true;
  }

  return Boolean(context.capabilities?.[capabilityName]);
}

function runPhase({ phase, provider, command, cwd, env, runCommand, eventSink, deferred = false }) {
  const started = Date.now();
  const result = runCommand(command, { cwd, env, deferred });
  const durationMs = Date.now() - started;

  emitPhaseEvent({
    eventSink,
    provider,
    phase,
    durationMs,
    result: result.ok ? 'ok' : 'error',
    errorCode: result.ok ? null : `${phase.toUpperCase()}_FAILED`,
    deferred,
  });

  return { ...result, durationMs };
}

function maybeAcquireLocalBundle({ context, runCommand, env, eventSink, result }) {
  const localBundle = context.paths.local_bundle;
  const command = context.commands.acquire_local_bundle;

  if (!command || !localBundle || existsSync(localBundle)) {
    return true;
  }

  const acquire = runPhase({
    phase: 'acquire_local_bundle',
    provider: context.provider,
    command,
    cwd: context.paths.repo_root,
    env,
    runCommand,
    eventSink,
  });
  result.durations.acquire_local_bundle = acquire.durationMs;

  if (!acquire.ok) {
    result.errors.push(createError('LOCAL_BUNDLE_ACQUIRE_FAILED', 'Failed to acquire local bundle.', acquire.stderr || acquire.stdout));
    return false;
  }

  return true;
}

function installFromLocal({ context, runCommand, env, eventSink, result }) {
  if (!maybeAcquireLocalBundle({ context, runCommand, env, eventSink, result })) {
    return false;
  }

  if (context.capabilities.can_materialize_skills && context.commands.materialize_local) {
    const materialize = runPhase({
      phase: 'materialize_local',
      provider: context.provider,
      command: context.commands.materialize_local,
      cwd: context.paths.repo_root,
      env,
      runCommand,
      eventSink,
    });
    result.durations.materialize_local = materialize.durationMs;

    if (!materialize.ok) {
      result.errors.push(createError('LOCAL_MATERIALIZE_FAILED', 'Failed to materialize local bundle.', materialize.stderr || materialize.stdout));
      return false;
    }
  }

  if (context.capabilities.can_write_target && context.commands.install_target) {
    const install = runPhase({
      phase: 'install_target',
      provider: context.provider,
      command: context.commands.install_target,
      cwd: context.paths.repo_root,
      env,
      runCommand,
      eventSink,
    });
    result.durations.install_target = install.durationMs;

    if (!install.ok) {
      result.errors.push(createError('INSTALL_TARGET_FAILED', 'Failed to install target artifacts.', install.stderr || install.stdout));
      return false;
    }
  }

  result.installed = true;
  result.source = 'local';
  return true;
}

function startDeferredWork({ context, env, strictMode, runCommand, eventSink, spawnDeferred }) {
  const runnableJobs = [];
  const deferredJobs = [];

  for (const job of context.commands.deferred || []) {
    if (!isCapabilityEnabled(context, job.required_capability)) {
      emitPhaseEvent({
        eventSink,
        provider: context.provider,
        phase: job.phase,
        durationMs: 0,
        result: 'skipped',
        deferred: !strictMode,
      });
      continue;
    }

    runnableJobs.push(job);
    deferredJobs.push(job.phase);
  }

  if (deferredJobs.length === 0) {
    return deferredJobs;
  }

  if (strictMode) {
    for (const job of runnableJobs) {
      runPhase({
        phase: job.phase,
        provider: context.provider,
        command: job.command,
        cwd: context.paths.repo_root,
        env,
        runCommand,
        eventSink,
      });
    }
    return [];
  }

  spawnDeferred({ context, env, eventSink, deferredJobs });
  return deferredJobs;
}

function defaultSpawnDeferred({ context, env, eventSink }) {
  const started = Date.now();
  const child = spawn(process.execPath, [DEFERRED_RUNNER, '--provider', context.provider], {
    cwd: context.paths.repo_root,
    env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  emitPhaseEvent({
    eventSink,
    provider: context.provider,
    phase: 'deferred_dispatch',
    durationMs: Date.now() - started,
    result: 'ok',
    deferred: true,
  });
}

export function executeBootstrap({
  env = process.env,
  cwd = process.cwd(),
  context = resolveProviderContext({ env, cwd }),
  runCommand = defaultRunCommand,
  eventSink,
  spawnDeferred = defaultSpawnDeferred,
} = {}) {
  const telemetry = eventSink
    ? { emit: eventSink, telemetryPath: null }
    : createTelemetrySink({
        env,
        home: env.HOME || env.USERPROFILE || cwd,
        provider: context.provider,
      });
  const strictMode = env.AI_CONFIG_STRICT_BOOTSTRAP === '1';
  const result = {
    ok: true,
    provider: context.provider,
    installed: false,
    source: 'noop',
    fallback_used: false,
    durations: {},
    deferred_jobs: [],
    errors: [],
    telemetry_path: telemetry.telemetryPath,
  };

  emitPhaseEvent({
    eventSink: telemetry.emit,
    provider: context.provider,
    phase: 'resolve_provider',
    durationMs: 0,
    result: 'ok',
  });

  if (!context.startup.shouldInstallOnStart) {
    emitPhaseEvent({
      eventSink: telemetry.emit,
      provider: context.provider,
      phase: 'startup_scope',
      durationMs: 0,
      result: 'skipped',
    });
    return { result, exitCode: 0 };
  }

  const canAttemptRemote =
    context.capabilities.can_fetch_bundle &&
    context.capabilities.can_auth_bundle_source &&
    Array.isArray(context.commands.remote_install);

  if (canAttemptRemote) {
    const remote = runPhase({
      phase: 'acquire_remote_bundle',
      provider: context.provider,
      command: context.commands.remote_install,
      cwd: context.paths.repo_root,
      env,
      runCommand,
      eventSink: telemetry.emit,
    });
    result.durations.acquire_remote_bundle = remote.durationMs;

    if (remote.ok) {
      result.installed = true;
      result.source = 'remote';
    } else {
      result.errors.push(createError('REMOTE_BUNDLE_FAILED', 'Remote bundle install failed.', remote.stderr || remote.stdout));
      result.fallback_used = true;
    }
  }

  if (!result.installed) {
    const localOk = installFromLocal({
      context,
      runCommand,
      env,
      eventSink: telemetry.emit,
      result,
    });

    if (!localOk) {
      result.ok = false;
      emitPhaseEvent({
        eventSink: telemetry.emit,
        provider: context.provider,
        phase: 'bootstrap_result',
        durationMs: 0,
        result: 'error',
        errorCode: result.errors.at(-1)?.code || 'BOOTSTRAP_FAILED',
      });
      return { result, exitCode: 1 };
    }
  }

  result.deferred_jobs = startDeferredWork({
    context,
    env,
    strictMode,
    runCommand,
    eventSink: telemetry.emit,
    spawnDeferred,
  });

  emitPhaseEvent({
    eventSink: telemetry.emit,
    provider: context.provider,
    phase: 'bootstrap_result',
    durationMs: 0,
    result: 'ok',
  });

  return { result, exitCode: 0 };
}

export function formatBootstrapResult({ result, exitCode }) {
  return JSON.stringify({
    ...result,
    exit_code: exitCode,
  });
}
