import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Test suite for service binding configuration validation
 *
 * Phase 1: Validates that Wrangler config has service binding for executor Worker
 */

function validateServiceBindings(config) {
  const errors = [];
  const services = config.services || [];
  const executorService = services.find(s => s.binding === 'EXECUTOR');

  if (!executorService) {
    errors.push('Missing service binding: EXECUTOR (add [[services]] section for Phase 1 executor)');
  } else {
    if (!executorService.service) {
      errors.push('Service binding EXECUTOR missing "service" field');
    }
    if (!executorService.environment) {
      errors.push('Service binding EXECUTOR missing "environment" field');
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateServiceBindingsForEnv(config, environment = 'production') {
  const errors = [];
  const envConfig = environment === 'staging' ? (config.env?.staging || {}) : config;
  const services = envConfig.services || [];
  const executorService = services.find(s => s.binding === 'EXECUTOR');

  if (!executorService) {
    errors.push(`Missing EXECUTOR service binding for ${environment}`);
  } else {
    const expectedServiceName = environment === 'production'
      ? 'ai-config-os-executor'
      : 'ai-config-os-executor-staging';

    if (executorService.service !== expectedServiceName) {
      errors.push(`Service binding for ${environment} should point to ${expectedServiceName}, got ${executorService.service}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/* Service Binding Validation Tests */

test('validateServiceBinding: detects missing service binding', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    // No [[services]] section
  };

  const result = validateServiceBindings(config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.match(result.errors[0], /Missing service binding/i);
});

test('validateServiceBinding: detects missing service field', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    services: [
      {
        binding: 'EXECUTOR',
        environment: 'production'
        // Missing 'service' field
      }
    ]
  };

  const result = validateServiceBindings(config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('service')));
});

test('validateServiceBinding: detects missing environment field', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    services: [
      {
        binding: 'EXECUTOR',
        service: 'ai-config-os-executor'
        // Missing 'environment' field
      }
    ]
  };

  const result = validateServiceBindings(config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('environment')));
});

test('validateServiceBinding: accepts valid service binding', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    services: [
      {
        binding: 'EXECUTOR',
        service: 'ai-config-os-executor',
        environment: 'production'
      }
    ]
  };

  const result = validateServiceBindings(config);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('validateServiceBindingsForEnv: production environment validates executor service name', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    services: [
      {
        binding: 'EXECUTOR',
        service: 'ai-config-os-executor',
        environment: 'production'
      }
    ]
  };

  const result = validateServiceBindingsForEnv(config, 'production');

  assert.equal(result.valid, true);
});

test('validateServiceBindingsForEnv: rejects wrong service name for production', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    services: [
      {
        binding: 'EXECUTOR',
        service: 'wrong-executor-name',
        environment: 'production'
      }
    ]
  };

  const result = validateServiceBindingsForEnv(config, 'production');

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('ai-config-os-executor')));
});

test('validateServiceBindingsForEnv: staging environment validates staging service name', () => {
  const config = {
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
        ]
      }
    }
  };

  const result = validateServiceBindingsForEnv(config, 'staging');

  assert.equal(result.valid, true);
});

test('validateServiceBindingsForEnv: rejects wrong service name for staging', () => {
  const config = {
    name: 'ai-config-os',
    main: 'src/index.ts',
    env: {
      staging: {
        services: [
          {
            binding: 'EXECUTOR',
            service: 'ai-config-os-executor',  // Should be -staging
            environment: 'staging'
          }
        ]
      }
    }
  };

  const result = validateServiceBindingsForEnv(config, 'staging');

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('ai-config-os-executor-staging')));
});
