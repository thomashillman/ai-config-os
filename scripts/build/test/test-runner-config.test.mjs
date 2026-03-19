import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpus } from 'node:os';

/**
 * Tests for the test runner concurrency logic.
 * We replicate the computation from run-tests.mjs rather than importing it
 * (it's a script with side effects, not a module).
 */
function computeParallelism(envValue) {
  const envConcurrency = parseInt(envValue, 10);
  return Math.max(1, envConcurrency > 0 ? envConcurrency : Math.min(cpus().length, 4));
}

describe('test runner concurrency config', () => {
  it('defaults to min(cpus, 4) when TEST_CONCURRENCY is not set', () => {
    const result = computeParallelism(undefined);
    assert.equal(result, Math.min(cpus().length, 4));
  });

  it('respects TEST_CONCURRENCY=8', () => {
    const result = computeParallelism('8');
    assert.equal(result, 8);
  });

  it('respects TEST_CONCURRENCY=1', () => {
    const result = computeParallelism('1');
    assert.equal(result, 1);
  });

  it('falls back to default for TEST_CONCURRENCY=0', () => {
    const result = computeParallelism('0');
    assert.equal(result, Math.min(cpus().length, 4));
  });

  it('falls back to default for invalid TEST_CONCURRENCY', () => {
    const result = computeParallelism('abc');
    assert.equal(result, Math.min(cpus().length, 4));
  });

  it('clamps negative values to 1 via default path', () => {
    const result = computeParallelism('-2');
    // -2 > 0 is false, so falls back to min(cpus, 4), which is >= 1
    assert.ok(result >= 1);
  });
});
