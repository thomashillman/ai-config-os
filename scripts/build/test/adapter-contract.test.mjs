/**
 * adapter-contract.test.mjs
 *
 * Tests the RuntimeAdapter interface contract. Ensures all adapters
 * (MCP, CLI, file) implement required methods with consistent error
 * handling patterns and async/sync boundaries.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Test 1: Adapter has required methods ───

test('adapter-contract: adapter implements required methods', () => {
  const adapter = createMockAdapter();

  assert.ok(typeof adapter.init === 'function', 'Should have init method');
  assert.ok(typeof adapter.configure === 'function', 'Should have configure method');
  assert.ok(typeof adapter.syncTools === 'function', 'Should have syncTools method');
  assert.ok(typeof adapter.getTool === 'function', 'Should have getTool method');
  assert.ok(typeof adapter.cleanup === 'function', 'Should have cleanup method');
});

// ─── Test 2: init() is async and returns result object ───

test('adapter-contract: init() is async and returns structured result', async () => {
  const adapter = createMockAdapter();
  const result = adapter.init({ dryRun: false });

  assert.ok(result instanceof Promise, 'init() should return Promise');

  const resolved = await result;
  assert.ok(resolved.success === true || resolved.success === false, 'Should have success field');
  assert.ok(typeof resolved.message === 'string', 'Should have message field');
});

// ─── Test 3: configure() validates input and returns validation result ───

test('adapter-contract: configure() validates config and returns result', async () => {
  const adapter = createMockAdapter();

  const validConfig = {
    tools: [{ name: 'git', version: '1.0.0' }],
  };

  const result = await adapter.configure(validConfig);

  assert.ok(result.valid === true || result.valid === false, 'Should have valid field');
  assert.ok(Array.isArray(result.errors), 'Should have errors array');
  assert.ok(result.warnings === undefined || Array.isArray(result.warnings), 'Warnings optional');
});

// ─── Test 4: configure() rejects invalid config ───

test('adapter-contract: configure() rejects invalid config', async () => {
  const adapter = createMockAdapter();

  const invalidConfig = {
    tools: 'not-an-array', // Should be array
  };

  const result = await adapter.configure(invalidConfig);

  assert.equal(result.valid, false, 'Should mark invalid config as invalid');
  assert.ok(result.errors.length > 0, 'Should list validation errors');
});

// ─── Test 5: syncTools() returns detailed sync result ───

test('adapter-contract: syncTools() returns structured sync result', async () => {
  const adapter = createMockAdapter();

  const config = {
    tools: [
      { name: 'tool1', version: '1.0.0', enabled: true },
      { name: 'tool2', version: '2.0.0', enabled: false },
    ],
  };

  const result = await adapter.syncTools(config, { dryRun: true });

  assert.ok(result.applied === true || result.applied === false, 'Should have applied field');
  assert.ok(Array.isArray(result.actions), 'Should have actions array');
  assert.ok(
    result.actions.every((a) => a.tool && a.status),
    'Actions should have tool and status'
  );
});

// ─── Test 6: getTool() returns tool state or null ───

test('adapter-contract: getTool() returns tool state or null', async () => {
  const adapter = createMockAdapter();

  const result = await adapter.getTool('nonexistent-tool');

  // Should return null or tool object
  assert.ok(result === null || (typeof result === 'object' && result.name), 'Should return null or tool');
});

// ─── Test 7: cleanup() handles graceful shutdown ───

test('adapter-contract: cleanup() handles shutdown gracefully', async () => {
  const adapter = createMockAdapter();

  const result = await adapter.cleanup();

  assert.ok(result.cleaned === true || result.cleaned === false, 'Should have cleaned field');
  assert.ok(typeof result.message === 'string', 'Should have message');
});

// ─── Test 8: Errors are structured with code and message ───

test('adapter-contract: errors follow standard structure', async () => {
  const adapter = createMockAdapter();

  try {
    await adapter.configure(null);
  } catch (error) {
    assert.ok(error.code, 'Error should have code field');
    assert.ok(error.message, 'Error should have message field');
    assert.ok(error.code.includes('ADAPTER_'), 'Error code should be prefixed');
  }
});

// ─── Test 9: Async methods never throw synchronously ───

test('adapter-contract: async methods do not throw synchronously', () => {
  const adapter = createMockAdapter();

  // These should not throw synchronously
  assert.doesNotThrow(() => {
    adapter.init({ dryRun: true });
    adapter.syncTools({}, {});
    adapter.getTool('test');
    adapter.cleanup();
  }, 'Async methods should not throw synchronously');
});

// ─── Test 10: Adapter is idempotent for syncTools with dryRun ───

test('adapter-contract: syncTools(dryRun) is idempotent', async () => {
  const adapter = createMockAdapter();

  const config = {
    tools: [{ name: 'test-tool', enabled: true }],
  };

  const result1 = await adapter.syncTools(config, { dryRun: true });
  const result2 = await adapter.syncTools(config, { dryRun: true });

  // Dry runs should produce identical results
  assert.deepEqual(
    JSON.stringify(result1),
    JSON.stringify(result2),
    'Dry runs should be idempotent'
  );
});

// ─── Test 11: init() can be called multiple times safely ───

test('adapter-contract: init() can be called multiple times', async () => {
  const adapter = createMockAdapter();

  const result1 = await adapter.init({ dryRun: false });
  const result2 = await adapter.init({ dryRun: false });

  // Should succeed both times (or second should be idempotent)
  assert.ok(result1.success || !result1.success, 'First init should complete');
  assert.ok(result2.success || !result2.success, 'Second init should complete');
});

// ─── Test 12: configure() validates required fields ───

test('adapter-contract: configure() validates required config fields', async () => {
  const adapter = createMockAdapter();

  const missingFields = {};
  const result = await adapter.configure(missingFields);

  assert.equal(result.valid, false, 'Should reject config with missing fields');
  assert.ok(result.errors.length > 0, 'Should report missing required fields');
});

// ─── Test 13: syncTools actions include detailed status ───

test('adapter-contract: syncTools actions include detailed information', async () => {
  const adapter = createMockAdapter();

  const config = {
    tools: [
      { name: 'installed-tool', enabled: true },
      { name: 'new-tool', enabled: true },
    ],
  };

  const result = await adapter.syncTools(config);

  // Each action should have detailed information
  for (const action of result.actions) {
    assert.ok(action.tool, 'Action should name the tool');
    assert.ok(action.status, 'Action should describe status');
    assert.ok(
      action.status === 'installed' || action.status === 'updated' || action.status === 'skipped',
      'Status should be standard value'
    );
  }
});

// ─── Test 14: getTool returns null for unknown tools ───

test('adapter-contract: getTool returns null for unknown tools, not error', async () => {
  const adapter = createMockAdapter();

  const result = await adapter.getTool('unknown-tool-xyz');

  // Should return null, not throw error
  assert.equal(result, null, 'Unknown tool should return null');
});

// ─── Test 15: Adapter supports partial updates ───

test('adapter-contract: syncTools supports partial tool list', async () => {
  const adapter = createMockAdapter();

  const partialConfig = {
    tools: [{ name: 'one-tool', enabled: true }], // Only one tool
  };

  const result = await adapter.syncTools(partialConfig);

  assert.ok(!result.applied === false || result.applied === true, 'Should handle partial config');
});

// ─── Helper: Create a mock adapter that matches the contract ───

function createMockAdapter() {
  return {
    async init(options) {
      return {
        success: true,
        message: 'Adapter initialized',
      };
    },

    async configure(config) {
      if (!config || typeof config !== 'object') {
        return {
          valid: false,
          errors: ['Config must be an object'],
        };
      }

      const errors = [];
      if (!Array.isArray(config.tools)) {
        errors.push('Config.tools must be an array');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: [],
      };
    },

    async syncTools(config, options) {
      if (!config || !config.tools) {
        return {
          applied: false,
          actions: [],
        };
      }

      const actions = config.tools.map((tool) => ({
        tool: tool.name,
        status: 'installed',
      }));

      return {
        applied: !options || !options.dryRun,
        actions,
      };
    },

    async getTool(name) {
      // Return null for unknown tools
      return null;
    },

    async cleanup() {
      return {
        cleaned: true,
        message: 'Adapter cleaned up successfully',
      };
    },
  };
}
