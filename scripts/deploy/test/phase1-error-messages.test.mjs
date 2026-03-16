/**
 * Error message quality tests for Phase 1 architecture.
 * Ensures error messages guide users toward Phase 1 (service binding)
 * and do not mislead them toward Phase 0 or missing configuration.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWranglerConfigForEnv, validateServiceBindingsForEnv } from '../validate-config.mjs';

test('Error Message Quality: Service binding error mentions [[services]] section', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    env: {
      staging: {
        // No services section
        vars: { EXECUTOR_TIMEOUT_MS: '10000' },
        kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
        r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
      }
    }
  };

  const result = validateWranglerConfigForEnv(config, 'staging');
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(e => e.includes('[[services]]')),
    'Error message should mention [[services]] TOML section'
  );
});

test('Error Message Quality: Missing executor config mentions Phase 1 requirement', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    env: {
      staging: {
        vars: { EXECUTOR_TIMEOUT_MS: '10000' },
        kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
        r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
        // No services, no EXECUTOR_PROXY_URL
      }
    }
  };

  const result = validateWranglerConfigForEnv(config, 'staging');
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(e => e.includes('Phase 1')),
    'Error message should explicitly mention Phase 1'
  );
});

test('Error Message Quality: Placeholder URL error explains Phase 1 vs Phase 0', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    env: {
      staging: {
        vars: {
          EXECUTOR_PROXY_URL: 'https://executor-staging.example.com' // Placeholder
        },
        kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
        r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
      }
    }
  };

  const result = validateWranglerConfigForEnv(config, 'staging');
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(e => e.includes('service binding [[services]]')),
    'Error should direct user toward service binding (Phase 1)'
  );
  assert.ok(
    result.errors.some(e => e.includes('backward compat')),
    'Error should mention backward compatibility for context'
  );
});

test('Error Message Quality: KV missing error mentions correct binding name', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    services: [
      {
        binding: 'EXECUTOR',
        service: 'ai-config-os-executor',
        environment: 'production'
      }
    ],
    vars: { EXECUTOR_TIMEOUT_MS: '10000' },
    kv_namespaces: [],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(config, 'production');
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(e => e.includes('MANIFEST_KV')),
    'Error should mention the correct binding name MANIFEST_KV'
  );
});

test('Error Message Quality: Service binding name validation mentions EXECUTOR binding', () => {
  const result = validateServiceBindingsForEnv({
    env: {
      staging: {
        services: [
          {
            binding: 'WRONG_BINDING',
            service: 'ai-config-os-executor-staging',
            environment: 'staging'
          }
        ]
      }
    }
  }, 'staging');

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(e => e.includes('EXECUTOR')),
    'Error should mention that binding must be named EXECUTOR'
  );
});

test('Error Message Quality: Invalid timeout error is specific', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    services: [
      {
        binding: 'EXECUTOR',
        service: 'ai-config-os-executor',
        environment: 'production'
      }
    ],
    vars: {
      EXECUTOR_TIMEOUT_MS: 'garbage'
    },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(config, 'production');
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(e => e.includes('EXECUTOR_TIMEOUT_MS') && e.includes('number')),
    'Error should be specific about the invalid field and what is expected'
  );
});

test('Success Message Clarity: No false claims when validation passes', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    services: [
      {
        binding: 'EXECUTOR',
        service: 'ai-config-os-executor',
        environment: 'production'
      }
    ],
    vars: { EXECUTOR_TIMEOUT_MS: '10000' },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(config, 'production');
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0, 'Valid config should have no errors');
});
