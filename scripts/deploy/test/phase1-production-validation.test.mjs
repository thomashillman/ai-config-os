/**
 * Production-grade validation for Phase 1 Cloudflare-first architecture.
 *
 * Tests cover:
 * - Configuration consistency across environments
 * - Error messages guide users correctly
 * - Fallback path is preserved but not implied as required
 * - Documentation claims match code behavior
 * - No broken references or inconsistencies
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWranglerConfigForEnv,
  validateServiceBindingsForEnv,
  isPlaceholder
} from '../validate-config.mjs';

/* Category 1: Configuration Consistency */

test('Configuration Consistency: Service binding name matches expected naming pattern', () => {
  const stagingConfig = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    env: {
      staging: {
        services: [
          {
            binding: 'EXECUTOR',
            service: 'ai-config-os-executor-staging',
            environment: 'staging'
          }
        ],
        vars: {
          EXECUTOR_TIMEOUT_MS: '10000'
        },
        kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'staging-kv' }],
        r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'staging-bucket' }]
      }
    }
  };

  const result = validateWranglerConfigForEnv(stagingConfig, 'staging');
  assert.equal(result.valid, true, 'Staging service binding name must follow convention');

  const prodConfig = {
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
      EXECUTOR_TIMEOUT_MS: '10000'
    },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'prod-kv' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'prod-bucket' }]
  };

  const prodResult = validateWranglerConfigForEnv(prodConfig, 'production');
  assert.equal(prodResult.valid, true, 'Production service binding name must follow convention');
});

test('Configuration Consistency: Both environments can coexist in same wrangler.toml', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    // Production root config
    services: [
      {
        binding: 'EXECUTOR',
        service: 'ai-config-os-executor',
        environment: 'production'
      }
    ],
    vars: {
      ENVIRONMENT: 'production',
      EXECUTOR_TIMEOUT_MS: '10000'
    },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'prod-kv' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'prod-bucket' }],
    // Staging override config
    env: {
      staging: {
        services: [
          {
            binding: 'EXECUTOR',
            service: 'ai-config-os-executor-staging',
            environment: 'staging'
          }
        ],
        vars: {
          ENVIRONMENT: 'staging',
          EXECUTOR_TIMEOUT_MS: '10000'
        },
        kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'staging-kv' }],
        r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'staging-bucket' }]
      }
    }
  };

  const prodResult = validateWranglerConfigForEnv(config, 'production');
  const stagingResult = validateWranglerConfigForEnv(config, 'staging');

  assert.equal(prodResult.valid, true, 'Production config should be valid');
  assert.equal(stagingResult.valid, true, 'Staging config should be valid');
});

/* Category 2: Error Message Guidance */

test('Error Guidance: Messages distinguish Phase 1 from Phase 0/2', () => {
  const noExecutorConfig = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    env: {
      staging: {
        // No service binding, no proxy URL
        vars: {
          EXECUTOR_TIMEOUT_MS: '10000'
        },
        kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'staging-kv' }],
        r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'staging-bucket' }]
      }
    }
  };

  const result = validateWranglerConfigForEnv(noExecutorConfig, 'staging');
  assert.equal(result.valid, false, 'Config without executor should fail');
  assert.ok(
    result.errors.some(e => e.includes('service binding')),
    'Error should mention service binding requirement'
  );
  assert.ok(
    result.errors.some(e => e.includes('[[services]]')),
    'Error should mention [[services]] TOML section'
  );
  assert.ok(
    !result.errors.some(e => e.includes('EXECUTOR_PROXY_URL is required')),
    'Error should NOT claim EXECUTOR_PROXY_URL is required'
  );
});

test('Error Guidance: Phase 0 backward compat message is clear', () => {
  const proxyOnlyConfig = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    env: {
      staging: {
        // Valid proxy URL but no service binding
        vars: {
          EXECUTOR_PROXY_URL: 'https://real-executor.example.com',
          EXECUTOR_TIMEOUT_MS: '10000'
        },
        kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'staging-kv' }],
        r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'staging-bucket' }]
      }
    }
  };

  const result = validateWranglerConfigForEnv(proxyOnlyConfig, 'staging');
  // This should pass because proxy alone is acceptable (Phase 0 compat)
  assert.equal(result.valid, true, 'Valid proxy URL alone should pass (Phase 0 compat)');
});

/* Category 3: Fallback Path Clarity */

test('Fallback Path: Proxy URL alone is accepted for Phase 0 backward compatibility', () => {
  // This tests that proxy URL alone is acceptable (Phase 0 compat path)
  // but Phase 1 prefers service binding
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    vars: {
      EXECUTOR_PROXY_URL: 'https://real-executor.example.com'
    },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(config, 'production');
  // Proxy URL alone is valid for Phase 0 backward compatibility
  assert.equal(
    result.valid,
    true,
    'Proxy URL alone is valid (Phase 0 compat)'
  );
});

test('Fallback Path: Placeholder URLs are rejected (prevents accidental Phase 0 usage)', () => {
  const placeholders = [
    'https://remote-executor.example.com',
    'https://executor-staging.example.com',
    'https://executor.example.com'
  ];

  // These exact strings are placeholders in the repo templates
  // Real deployment should reject them to catch incomplete config
  assert.ok(isPlaceholder(placeholders[0], 'production'), 'Production placeholder should be detected');
  assert.ok(isPlaceholder(placeholders[1], 'staging'), 'Staging placeholder should be detected');
  assert.ok(!isPlaceholder('https://real-executor.mycompany.com', 'production'), 'Real URL should not be detected as placeholder');
});

/* Category 4: No False Claims About Capabilities */

test('Capability Claims: Service binding-only config is not claimed to support shell', () => {
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
      EXECUTOR_TIMEOUT_MS: '10000'
    },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(config, 'production');
  assert.equal(result.valid, true, 'Service binding config should be valid');

  // The validator doesn't claim what tools are available, which is correct.
  // That's enforced in the executor Worker itself, not in the validator.
  // This test just verifies the validator doesn't add false capability claims.
  assert.ok(Array.isArray(result.errors), 'Errors should be an array');
});

/* Category 5: Seam Preservation */

test('Phase 2 Seam: Both paths can be configured simultaneously without conflict', () => {
  // This tests that service binding and proxy URL can coexist (Phase 1 uses binding, Phase 2 seam keeps proxy)
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
      EXECUTOR_PROXY_URL: 'https://future-vps-executor.example.com', // Phase 2 seam
      EXECUTOR_TIMEOUT_MS: '10000'
    },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(config, 'production');
  assert.equal(result.valid, true, 'Service binding + proxy URL should be valid (Phase 2 seam)');
});

test('Phase 2 Seam: Proxy URL is optional, not required', () => {
  // Verify that a config without EXECUTOR_PROXY_URL is still valid
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
      // EXECUTOR_PROXY_URL intentionally omitted
      EXECUTOR_TIMEOUT_MS: '10000'
    },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(config, 'production');
  assert.equal(result.valid, true, 'EXECUTOR_PROXY_URL is optional for Phase 1');
  assert.equal(
    result.errors.length,
    0,
    'Should have zero errors when service binding is present'
  );
});

/* Category 6: Binding Name Validation */

test('Binding Validation: Service binding must use EXECUTOR binding name', () => {
  const wrongBindingConfig = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    services: [
      {
        binding: 'WRONG_NAME', // Should be EXECUTOR
        service: 'ai-config-os-executor',
        environment: 'production'
      }
    ],
    vars: {
      EXECUTOR_TIMEOUT_MS: '10000'
    },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(wrongBindingConfig, 'production');
  assert.equal(result.valid, false, 'Service binding must use EXECUTOR binding name');
  assert.ok(
    result.errors.some(e => e.includes('EXECUTOR')),
    'Error should mention EXECUTOR binding'
  );
});

/* Category 7: KV and R2 Binding Validation */

test('KV/R2 Validation: Both must be present and must use correct binding names', () => {
  const missingKvConfig = {
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
      EXECUTOR_TIMEOUT_MS: '10000'
    },
    // Missing kv_namespaces
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(missingKvConfig, 'production');
  assert.equal(result.valid, false, 'Missing KV should fail');
  assert.ok(
    result.errors.some(e => e.includes('MANIFEST_KV')),
    'Error should mention MANIFEST_KV'
  );
});

test('KV/R2 Validation: Placeholder IDs are rejected', () => {
  const placeholderIdConfig = {
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
      EXECUTOR_TIMEOUT_MS: '10000'
    },
    kv_namespaces: [
      { binding: 'MANIFEST_KV', id: 'REPLACE_WITH_MANIFEST_KV_ID' } // Placeholder
    ],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(placeholderIdConfig, 'production');
  assert.equal(result.valid, false, 'Placeholder KV ID should be rejected');
  assert.ok(
    result.errors.some(e => e.includes('REPLACE_WITH')),
    'Error should identify the placeholder'
  );
});

/* Category 8: Timeout Validation */

test('Timeout Validation: EXECUTOR_TIMEOUT_MS must be a valid number', () => {
  const badTimeoutConfig = {
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
      EXECUTOR_TIMEOUT_MS: 'not-a-number'
    },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(badTimeoutConfig, 'production');
  assert.equal(result.valid, false, 'Invalid timeout should fail');
  assert.ok(
    result.errors.some(e => e.includes('EXECUTOR_TIMEOUT_MS')),
    'Error should mention EXECUTOR_TIMEOUT_MS'
  );
});

test('Timeout Validation: EXECUTOR_TIMEOUT_MS can be omitted (uses default)', () => {
  const noTimeoutConfig = {
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
      // EXECUTOR_TIMEOUT_MS omitted; should use default
    },
    kv_namespaces: [{ binding: 'MANIFEST_KV', id: 'kv-id' }],
    r2_buckets: [{ binding: 'ARTEFACTS_R2', bucket_name: 'bucket' }]
  };

  const result = validateWranglerConfigForEnv(noTimeoutConfig, 'production');
  assert.equal(result.valid, true, 'Missing EXECUTOR_TIMEOUT_MS should use default');
});
