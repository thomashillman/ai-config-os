import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConcurrencyForPlatform, resolveTestConcurrency } from './lib/test-runner-config.mjs';

describe('test-runner concurrency defaults', () => {
  test('windows default is sequential to avoid process contention', () => {
    assert.equal(defaultConcurrencyForPlatform('win32', 16), 1);
    assert.equal(defaultConcurrencyForPlatform('win32', 2), 1);
  });

  test('non-windows default preserves prior behavior (min(cpu, 4))', () => {
    assert.equal(defaultConcurrencyForPlatform('linux', 1), 1);
    assert.equal(defaultConcurrencyForPlatform('linux', 8), 4);
    assert.equal(defaultConcurrencyForPlatform('darwin', 6), 4);
  });

  test('explicit TEST_CONCURRENCY always wins', () => {
    assert.equal(resolveTestConcurrency({
      platform: 'win32',
      cpuCount: 16,
      env: { TEST_CONCURRENCY: '3' },
    }), 3);
  });

  test('invalid TEST_CONCURRENCY falls back to platform default', () => {
    assert.equal(resolveTestConcurrency({
      platform: 'linux',
      cpuCount: 8,
      env: { TEST_CONCURRENCY: 'NaN' },
    }), 4);
  });
});
