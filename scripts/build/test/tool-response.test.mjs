import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toToolResponse, toolError } from '../../../runtime/mcp/tool-response.mjs';

function parseEnvelope(res) {
  return JSON.parse(res.content[0].text);
}

describe('toToolResponse envelope', () => {
  test('success response uses envelope with output and capability flags', () => {
    const res = toToolResponse({ success: true, output: 'Done.' }, null, null, 'sync_tools');
    const env = parseEnvelope(res);
    assert.equal(env.contract_version, '1.0.0');
    assert.equal(env.resource, 'sync_tools');
    assert.equal(env.data.success, true);
    assert.equal(env.data.output, 'Done.');
    assert.equal(typeof env.summary, 'string');
    assert.equal(Array.isArray(env.suggested_actions), true);
    assert.equal(env.capability.local_only, true);
    assert.equal(env.capability.worker_backed, false);
    assert.equal(res.isError, undefined);
    assert.deepEqual(res.structuredContent, env);
  });

  test('failure response uses envelope error fields and preserves stderr/stdout', () => {
    const res = toToolResponse({ success: false, error: 'err', output: 'out' }, null, null, 'validate_all');
    const env = parseEnvelope(res);
    assert.equal(res.isError, true);
    assert.equal(env.data.success, false);
    assert.match(env.data.output, /err/);
    assert.match(env.data.output, /out/);
    assert.equal(env.error.code, 'tool_execution_failed');
    assert.equal(typeof env.error.message, 'string');
    assert.equal(typeof env.error.hint, 'string');
  });

  test('success includes meta.effective_outcome_contract when provided', () => {
    const contract = { outcomeId: 'runtime.sync-tools' };
    const res = toToolResponse({ success: true, output: 'ok' }, contract, null, 'sync_tools');
    const env = parseEnvelope(res);
    assert.deepEqual(env.meta.effective_outcome_contract, contract);
  });

  test('failure includes meta.effective_outcome_contract when provided', () => {
    const contract = { outcomeId: 'runtime.validate-all' };
    const res = toToolResponse({ success: false, error: 'boom' }, contract, null, 'validate_all');
    const env = parseEnvelope(res);
    assert.deepEqual(env.meta.effective_outcome_contract, contract);
  });

  test('omits envelope meta when effective outcome contract is absent', () => {
    const res = toToolResponse({ success: true, output: 'ok' }, null, null, 'sync_tools');
    const env = parseEnvelope(res);
    assert.equal('meta' in env, false);
  });

  test('capability profile attachment coexists with envelope meta', () => {
    const contract = { outcomeId: 'runtime.sync-tools' };
    const profile = { mode: 'local-cli' };
    const res = toToolResponse({ success: true, output: 'ok' }, contract, profile, 'sync_tools');
    const env = parseEnvelope(res);
    assert.deepEqual(env.meta.effective_outcome_contract, contract);
    assert.deepEqual(res.meta.capability_profile, profile);
  });
});

describe('toolError envelope', () => {
  test('returns envelope error with defaults', () => {
    const res = toolError('Invalid argument');
    const env = parseEnvelope(res);
    assert.equal(res.isError, true);
    assert.equal(env.error.code, 'invalid_request');
    assert.equal(env.error.message, 'Invalid argument');
    assert.equal(typeof env.error.hint, 'string');
    assert.equal(env.data, null);
  });

  test('supports meta.effective_outcome_contract via options.meta', () => {
    const contract = { outcomeId: 'runtime.context-cost' };
    const res = toolError('bad input', null, {
      resource: 'context_cost',
      code: 'invalid_arguments',
      meta: { effective_outcome_contract: contract },
    });
    const env = parseEnvelope(res);
    assert.deepEqual(env.meta.effective_outcome_contract, contract);
    assert.equal(env.resource, 'context_cost');
    assert.equal(env.error.code, 'invalid_arguments');
  });
});
