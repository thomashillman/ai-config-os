// Tests for runtime/lib/kv-persistence.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KvPersistence, normaliseSlug, generateShortCode } from '../../../runtime/lib/kv-persistence.mjs';

// Minimal mock KV binding (Map-backed, sync returns via Promise)
function makeMockKv() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
  };
}

// --- normaliseSlug ---

test('normaliseSlug lowercases and strips non-alphanumeric', () => {
  assert.equal(normaliseSlug('Hello World!'), 'helloworld');
});

test('normaliseSlug strips hyphens and spaces', () => {
  assert.equal(normaliseSlug('review-my-code'), 'reviewmycode');
});

test('normaliseSlug truncates to 32 chars', () => {
  const long = 'a'.repeat(50);
  const result = normaliseSlug(long);
  assert.ok(result.length <= 32);
});

test('normaliseSlug handles empty/falsy input', () => {
  assert.equal(normaliseSlug(''), '');
  assert.equal(normaliseSlug(null), '');
  assert.equal(normaliseSlug(undefined), '');
});

// --- generateShortCode ---

test('generateShortCode uses 4-char prefix + count', () => {
  assert.equal(generateShortCode('review', 3), 'revi3');
});

test('generateShortCode uses "task" prefix when name normalises to empty', () => {
  assert.equal(generateShortCode('!!!', 1), 'task1');
});

// --- KvPersistence key builders ---

test('_taskKey returns correct format', () => {
  const kv = new KvPersistence(makeMockKv());
  assert.equal(kv._taskKey('abc'), 'task:abc');
});

test('_logKey returns correct format', () => {
  const kv = new KvPersistence(makeMockKv());
  assert.equal(kv._logKey('abc'), 'task:abc:log');
});

test('_eventsKey returns correct format', () => {
  const kv = new KvPersistence(makeMockKv());
  assert.equal(kv._eventsKey('abc'), 'task:abc:events');
});

test('_snapshotsKey returns correct format', () => {
  const kv = new KvPersistence(makeMockKv());
  assert.equal(kv._snapshotsKey('abc'), 'task:abc:snapshots');
});

test('_indexKey returns fixed key', () => {
  const kv = new KvPersistence(makeMockKv());
  assert.equal(kv._indexKey(), 'task:index');
});

// --- Low-level KV helpers ---

test('_get returns null for missing key', async () => {
  const kv = new KvPersistence(makeMockKv());
  assert.equal(await kv._get('nonexistent'), null);
});

test('_put serializes value to JSON; _get deserializes', async () => {
  const mockKv = makeMockKv();
  const kv = new KvPersistence(mockKv);
  await kv._put('mykey', { hello: 'world' });
  assert.equal(mockKv.store.get('mykey'), JSON.stringify({ hello: 'world' }));
  const result = await kv._get('mykey');
  assert.deepEqual(result, { hello: 'world' });
});

test('_append creates array if key missing, then appends', async () => {
  const kv = new KvPersistence(makeMockKv());
  await kv._append('mylist', 'first');
  await kv._append('mylist', 'second');
  const result = await kv._get('mylist');
  assert.deepEqual(result, ['first', 'second']);
});

// --- Index management ---

test('_updateIndex upserts and sorts by updated_at desc', async () => {
  const kv = new KvPersistence(makeMockKv());
  await kv._updateIndex('t1', { updated_at: '2024-01-01T00:00:00Z' });
  await kv._updateIndex('t2', { updated_at: '2024-06-01T00:00:00Z' });
  await kv._flushIndex();
  const index = await kv._get(kv._indexKey());
  assert.equal(index[0].task_id, 't2');  // most recent first
  assert.equal(index[1].task_id, 't1');
});

test('_updateIndex updates existing entry', async () => {
  const kv = new KvPersistence(makeMockKv());
  await kv._updateIndex('t1', { state: 'active', updated_at: '2024-01-01T00:00:00Z' });
  await kv._updateIndex('t1', { state: 'complete', updated_at: '2024-02-01T00:00:00Z' });
  await kv._flushIndex();
  const index = await kv._get(kv._indexKey());
  assert.equal(index.length, 1);
  assert.equal(index[0].state, 'complete');
});

test('_flushIndex writes only when dirty', async () => {
  const mockKv = makeMockKv();
  let putCallCount = 0;
  const trackedKv = {
    async get(key) { return mockKv.get(key); },
    async put(key, value) { putCallCount++; return mockKv.put(key, value); },
  };
  const kv = new KvPersistence(trackedKv);
  // Flush without any update — should not write
  await kv._flushIndex();
  assert.equal(putCallCount, 0, 'flush without changes should not call put');
  // Update and flush — should write once
  await kv._updateIndex('t1', { updated_at: '2024-01-01T00:00:00Z' });
  await kv._flushIndex();
  assert.equal(putCallCount, 1, 'flush after update should call put once');
  // Second flush without changes — should not write again
  await kv._flushIndex();
  assert.equal(putCallCount, 1, 'second flush without changes should not call put again');
});
