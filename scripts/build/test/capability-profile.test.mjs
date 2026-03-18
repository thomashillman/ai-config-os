import { test } from 'node:test';
import assert from 'node:assert/strict';

const ENV_KEYS = [
  'AI_CONFIG_OS_RUNTIME_MODE',
  'AI_CONFIG_OS_REMOTE_EXECUTOR_URL',
  'AI_CONFIG_OS_REMOTE_EXECUTOR_PROBE',
  'AI_CONFIG_OS_REMOTE_EXECUTOR_TIMEOUT_MS',
  'CLAUDE_CODE_ENTRYPOINT',
];

function withEnv(overrides, fn) {
  const snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === null) {
      delete process.env[k];
    } else {
      process.env[k] = String(v);
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of ENV_KEYS) {
        const value = snapshot[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test('buildCapabilityProfile reports local-cli mode by default', async () => {
  const { buildCapabilityProfile } = await import('../../../runtime/lib/capability-profile.mjs');
  await withEnv(
    {
      AI_CONFIG_OS_RUNTIME_MODE: null,
      AI_CONFIG_OS_REMOTE_EXECUTOR_URL: null,
      AI_CONFIG_OS_REMOTE_EXECUTOR_PROBE: null,
      CLAUDE_CODE_ENTRYPOINT: null,
    },
    async () => {
      const profile = await buildCapabilityProfile();
      assert.equal(profile.mode, 'local-cli');
      assert.equal(profile.capabilities.network_http, true);
      assert.equal(profile.remote_executor_probe.configured, false);
    }
  );
});

test('buildCapabilityProfile reports connector mode and disables local capabilities', async () => {
  const { buildCapabilityProfile } = await import('../../../runtime/lib/capability-profile.mjs');
  await withEnv(
    {
      AI_CONFIG_OS_RUNTIME_MODE: 'connector',
      AI_CONFIG_OS_REMOTE_EXECUTOR_URL: 'https://example.invalid/exec',
      AI_CONFIG_OS_REMOTE_EXECUTOR_PROBE: '0',
    },
    async () => {
      const profile = await buildCapabilityProfile();
      assert.equal(profile.mode, 'connector');
      assert.equal(profile.capabilities.local_fs, false);
      assert.equal(profile.capabilities.local_shell, false);
      assert.equal(profile.capabilities.local_repo, false);
      assert.equal(profile.capabilities.remote_executor, true);
      assert.equal(profile.remote_executor_probe.checked, false);
    }
  );
});

test('attachCapabilityProfile adds capability profile to response metadata', async () => {
  const { attachCapabilityProfile } = await import('../../../runtime/lib/capability-profile.mjs');

  const response = { content: [{ type: 'text', text: 'ok' }] };
  const profile = { mode: 'local-cli' };

  const out = attachCapabilityProfile(response, profile);
  assert.equal(out.meta.capability_profile.mode, 'local-cli');
});
