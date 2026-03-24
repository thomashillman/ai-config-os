// Tests for runtime/mcp/tool-response.mjs
//
// Validates: MCP response shaping for success, failure, contract prefix,
// and capability profile attachment.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toToolResponse, toolError } from '../../../runtime/mcp/tool-response.mjs';

// ─── toToolResponse — success ─────────────────────────────────────────────────

describe('toToolResponse — success path', () => {
  test('returns text content and Full structuredContent', () => {
    const res = toToolResponse({ success: true, output: 'Done.' });
    assert.equal(res.content[0].type, 'text');
    assert.ok(res.content[0].text.includes('Done.'));
    assert.equal(res.structuredContent.status, 'Full');
    assert.equal(res.structuredContent.selectedRoute, 'local-runtime-script');
    assert.ok(!res.isError);
  });

  test('empty output produces empty text with Full contract', () => {
    const res = toToolResponse({ success: true, output: '' });
    assert.equal(res.content[0].text, '');
    assert.equal(res.structuredContent.status, 'Full');
  });

  test('undefined output defaults to empty string', () => {
    const res = toToolResponse({ success: true });
    assert.equal(res.content[0].text, '');
    assert.equal(res.structuredContent.output, '');
  });

  test('structuredContent.output matches result.output', () => {
    const res = toToolResponse({ success: true, output: 'hello' });
    assert.equal(res.structuredContent.output, 'hello');
  });
});

// ─── toToolResponse — failure ─────────────────────────────────────────────────

describe('toToolResponse — failure path', () => {
  test('sets isError=true and Degraded contract', () => {
    const res = toToolResponse({ success: false, error: 'Something failed', output: 'partial' });
    assert.equal(res.isError, true);
    assert.equal(res.structuredContent.status, 'Degraded');
  });

  test('combines error and output in content text', () => {
    const res = toToolResponse({ success: false, error: 'err msg', output: 'stdout content' });
    assert.ok(res.content[0].text.includes('err msg'));
    assert.ok(res.content[0].text.includes('stdout content'));
  });

  test('only error — output absent from text', () => {
    const res = toToolResponse({ success: false, error: 'Boom' });
    assert.ok(res.content[0].text.includes('Boom'));
    assert.ok(!res.content[0].text.includes('undefined'));
  });

  test('neither error nor output → Unknown error fallback', () => {
    const res = toToolResponse({ success: false });
    assert.ok(res.content[0].text.includes('Unknown error'));
  });

  test('degraded contract has required guidance fields', () => {
    const res = toToolResponse({ success: false, error: 'err' });
    const sc = res.structuredContent;
    assert.ok(Array.isArray(sc.missingCapabilities), 'missingCapabilities must be array');
    assert.ok(sc.missingCapabilities.length > 0);
    assert.ok(typeof sc.guidanceEquivalentRoute === 'string');
    assert.ok(typeof sc.guidanceFullWorkflowHigherCapabilityEnvironment === 'string');
    assert.ok(Array.isArray(sc.requiredUserInput));
    assert.ok(sc.requiredUserInput.length > 0);
  });
});

// ─── toToolResponse — effectiveOutcomeContract prefix ─────────────────────────

describe('toToolResponse — contract prefix', () => {
  test('prefixes content text with EffectiveOutcomeContract JSON', () => {
    const contract = { task_id: 't1', status: 'ok' };
    const res = toToolResponse({ success: true, output: 'result' }, contract);
    assert.ok(res.content[0].text.startsWith('EffectiveOutcomeContract:'));
    assert.ok(res.content[0].text.includes('"task_id": "t1"'));
    assert.ok(res.content[0].text.includes('result'));
  });

  test('no prefix when contract is null', () => {
    const res = toToolResponse({ success: true, output: 'hi' }, null);
    assert.equal(res.content[0].text, 'hi');
  });

  test('prefix also applied on failure path', () => {
    const contract = { step: 'diagnose' };
    const res = toToolResponse({ success: false, error: 'oops' }, contract);
    assert.ok(res.content[0].text.startsWith('EffectiveOutcomeContract:'));
    assert.ok(res.content[0].text.includes('"step": "diagnose"'));
    assert.ok(res.content[0].text.includes('oops'));
  });
});

// ─── toToolResponse — capabilityProfile attachment ────────────────────────────

describe('toToolResponse — capabilityProfile', () => {
  test('attaches profile under meta.capability_profile', () => {
    const profile = { mode: 'local-cli' };
    const res = toToolResponse({ success: true, output: '' }, null, profile);
    assert.deepEqual(res.meta.capability_profile, { mode: 'local-cli' });
  });

  test('no meta key when capabilityProfile is null', () => {
    const res = toToolResponse({ success: true, output: '' }, null, null);
    assert.ok(!('meta' in res));
  });

  test('profile also attached on failure path', () => {
    const profile = { mode: 'web' };
    const res = toToolResponse({ success: false, error: 'err' }, null, profile);
    assert.deepEqual(res.meta.capability_profile, { mode: 'web' });
  });
});

// ─── toolError ────────────────────────────────────────────────────────────────

describe('toolError', () => {
  test('returns isError=true with Degraded structuredContent', () => {
    const res = toolError('Invalid argument');
    assert.equal(res.isError, true);
    assert.equal(res.structuredContent.status, 'Degraded');
  });

  test('includes message in content text and structuredContent.output', () => {
    const res = toolError('bad input');
    assert.ok(res.content[0].text.includes('bad input'));
    assert.ok(res.structuredContent.output.includes('bad input'));
  });

  test('empty string falls back to Unknown error', () => {
    const res = toolError('');
    assert.ok(res.content[0].text.includes('Unknown error'));
  });

  test('structuredContent has required guidance fields', () => {
    const res = toolError('x');
    const sc = res.structuredContent;
    assert.ok(Array.isArray(sc.missingCapabilities));
    assert.ok(typeof sc.guidanceEquivalentRoute === 'string');
    assert.ok(Array.isArray(sc.requiredUserInput));
  });

  test('attaches capabilityProfile to meta when provided', () => {
    const profile = { mode: 'web' };
    const res = toolError('err', profile);
    assert.deepEqual(res.meta.capability_profile, { mode: 'web' });
  });

  test('no meta key when capabilityProfile is omitted', () => {
    const res = toolError('err');
    assert.ok(!('meta' in res));
  });
});
