#!/usr/bin/env node
/**
 * Publish all dashboard state snapshots to the Worker.
 *
 * Usage:
 *   node runtime/publish-dashboard-state.mjs
 *
 * Required env vars:
 *   AI_CONFIG_OS_WORKER_URL  (or WORKER_URL)    — Worker base URL
 *   AI_CONFIG_OS_WORKER_TOKEN (or AUTH_TOKEN)   — Bearer token
 *
 * Optional env vars:
 *   AI_CONFIG_OS_REPO_ID     — Repo identifier for KV scope (defaults to git remote)
 *   AI_CONFIG_OS_MACHINE_ID  — Machine identifier for KV scope (defaults to hostname)
 */

import { execSync } from 'node:child_process';
import os from 'node:os';
import { publishAll } from './lib/dashboard-state-publisher.mjs';

const workerUrl = (process.env.AI_CONFIG_OS_WORKER_URL || process.env.WORKER_URL || '').replace(/\/+$/, '');
const token = process.env.AI_CONFIG_OS_WORKER_TOKEN || process.env.AUTH_TOKEN || '';

if (!workerUrl) {
  console.error('[publish] Error: AI_CONFIG_OS_WORKER_URL (or WORKER_URL) is required');
  process.exit(1);
}
if (!token) {
  console.error('[publish] Error: AI_CONFIG_OS_WORKER_TOKEN (or AUTH_TOKEN) is required');
  process.exit(1);
}

function resolveRepoId() {
  if (process.env.AI_CONFIG_OS_REPO_ID) return process.env.AI_CONFIG_OS_REPO_ID;
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf8', timeout: 5000 }).trim();
    const match = remote.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

const scope = {
  repo_id: resolveRepoId(),
  machine_id: process.env.AI_CONFIG_OS_MACHINE_ID || os.hostname() || 'unknown',
};

console.error(`[publish] Worker: ${workerUrl}`);
console.error(`[publish] Scope: ${scope.repo_id} / ${scope.machine_id}`);

const results = await publishAll({ workerUrl, token, scope });

let failures = 0;
for (const r of results) {
  const status = r.ok ? 'ok' : 'fail';
  const detail = r.ok ? `HTTP ${r.status}` : (r.error ?? `HTTP ${r.status}`);
  console.error(`[publish] ${status.padEnd(4)} ${r.resource.padEnd(40)} ${detail}`);
  if (!r.ok) failures++;
}

if (failures > 0) {
  console.error(`[publish] ${failures} resource(s) failed`);
  process.exit(1);
}

console.error('[publish] All resources published successfully');
