#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolveProviderContext } from './provider-context.mjs';
import { createTelemetrySink } from './telemetry.mjs';

const providerArgIndex = process.argv.indexOf('--provider');
const providerArg = providerArgIndex > -1 ? process.argv[providerArgIndex + 1] : null;
const context = resolveProviderContext({ env: process.env, cwd: process.cwd() });
const telemetry = createTelemetrySink({
  env: process.env,
  home: process.env.HOME || process.env.USERPROFILE || process.cwd(),
  provider: context.provider,
});

if (providerArg && providerArg !== context.provider) {
  process.exit(0);
}

for (const job of context.commands.deferred || []) {
  if (job.required_capability && !context.capabilities?.[job.required_capability]) {
    telemetry.emit({
      phase: job.phase,
      provider: context.provider,
      duration_ms: 0,
      result: 'skipped',
      error_code: null,
      deferred: true,
    });
    continue;
  }

  const started = Date.now();
  const [cmd, ...args] = job.command;
  const result = spawnSync(cmd, args, {
    cwd: context.paths.repo_root,
    env: process.env,
    encoding: 'utf8',
  });

  telemetry.emit({
    phase: job.phase,
    provider: context.provider,
    duration_ms: Date.now() - started,
    result: result.status === 0 ? 'ok' : 'error',
    error_code: result.status === 0 ? null : `${job.phase.toUpperCase()}_FAILED`,
    deferred: true,
  });
}
