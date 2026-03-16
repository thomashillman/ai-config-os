import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWranglerConfig, validateWorkerSecrets, validateExecutorEnv } from '../validate-config.mjs';

test('validateWranglerConfig - passes with all required fields', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    vars: {
      ENVIRONMENT: 'staging',
      EXECUTOR_PROXY_URL: 'https://executor.example.com',
      EXECUTOR_TIMEOUT_MS: '10000'
    },
    kv_namespaces: [
      { binding: 'MANIFEST_KV', id: 'placeholder-id' }
    ],
    r2_buckets: [
      { binding: 'ARTEFACTS_R2', bucket_name: 'ai-config-os-artefacts' }
    ],
    env: {
      staging: {
        vars: {
          ENVIRONMENT: 'staging',
          EXECUTOR_PROXY_URL: 'https://executor.example.com',
          EXECUTOR_TIMEOUT_MS: '10000'
        }
      }
    }
  };

  const result = validateWranglerConfig(config);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('validateWranglerConfig - fails when EXECUTOR_PROXY_URL is missing', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    vars: {
      ENVIRONMENT: 'staging',
      EXECUTOR_TIMEOUT_MS: '10000'
    }
  };

  const result = validateWranglerConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('EXECUTOR_PROXY_URL')));
});

test('validateWranglerConfig - fails when EXECUTOR_TIMEOUT_MS is not a number', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    vars: {
      ENVIRONMENT: 'staging',
      EXECUTOR_PROXY_URL: 'https://executor.example.com',
      EXECUTOR_TIMEOUT_MS: 'not-a-number'
    }
  };

  const result = validateWranglerConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('EXECUTOR_TIMEOUT_MS') && e.includes('number')));
});

test('validateWranglerConfig - allows optional ENVIRONMENT field', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    vars: {
      EXECUTOR_PROXY_URL: 'https://executor.example.com',
      EXECUTOR_TIMEOUT_MS: '10000'
    },
    kv_namespaces: [
      { binding: 'MANIFEST_KV', id: 'placeholder-id' }
    ],
    r2_buckets: [
      { binding: 'ARTEFACTS_R2', bucket_name: 'ai-config-os-artefacts' }
    ]
  };

  const result = validateWranglerConfig(config);
  assert.equal(result.valid, true);
});

test('validateWorkerSecrets - fails when AUTH_TOKEN is missing', () => {
  const secrets = {};
  const result = validateWorkerSecrets(secrets);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('AUTH_TOKEN')));
});

test('validateWorkerSecrets - fails when EXECUTOR_SHARED_SECRET is missing', () => {
  const secrets = { AUTH_TOKEN: 'token123' };
  const result = validateWorkerSecrets(secrets);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('EXECUTOR_SHARED_SECRET')));
});

test('validateWorkerSecrets - passes with required secrets', () => {
  const secrets = {
    AUTH_TOKEN: 'token123',
    EXECUTOR_SHARED_SECRET: 'secret123'
  };
  const result = validateWorkerSecrets(secrets);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('validateWorkerSecrets - allows optional AUTH_TOKEN_NEXT', () => {
  const secrets = {
    AUTH_TOKEN: 'token123',
    EXECUTOR_SHARED_SECRET: 'secret123'
  };
  const result = validateWorkerSecrets(secrets);

  assert.equal(result.valid, true);
});

test('validateExecutorEnv - fails when REMOTE_EXECUTOR_SHARED_SECRET is missing', () => {
  const env = {
    REMOTE_EXECUTOR_PORT: '8788',
    REMOTE_EXECUTOR_TIMEOUT_MS: '15000'
  };
  const result = validateExecutorEnv(env);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('REMOTE_EXECUTOR_SHARED_SECRET')));
});

test('validateExecutorEnv - passes with required vars', () => {
  const env = {
    REMOTE_EXECUTOR_SHARED_SECRET: 'secret123',
    REMOTE_EXECUTOR_PORT: '8788'
  };
  const result = validateExecutorEnv(env);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('validateExecutorEnv - fails when REMOTE_EXECUTOR_PORT is not a valid port number', () => {
  const env = {
    REMOTE_EXECUTOR_SHARED_SECRET: 'secret123',
    REMOTE_EXECUTOR_PORT: 'not-a-port'
  };
  const result = validateExecutorEnv(env);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('REMOTE_EXECUTOR_PORT') && e.includes('number')));
});

test('validateExecutorEnv - allows optional REMOTE_EXECUTOR_SIGNATURE_PUBLIC_KEY_PEM', () => {
  const env = {
    REMOTE_EXECUTOR_SHARED_SECRET: 'secret123',
    REMOTE_EXECUTOR_PORT: '8788'
  };
  const result = validateExecutorEnv(env);

  assert.equal(result.valid, true);
});
