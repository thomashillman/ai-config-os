/**
 * worker-version-pointer-consistency-contract.test.mjs
 *
 * Contract gate: worker responses must source the published version pointer
 * from dist/registry/index.json (single source of truth), not hardcoded values.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function workerSource() {
  return readFileSync(join(REPO_ROOT, 'worker', 'src', 'index.ts'), 'utf8');
}

test('worker version-pointer contract: health endpoint points to registry version', () => {
  const src = workerSource();
  assert.match(src, /version:\s*\(REGISTRY_JSON as any\)\.version/);
});

test('worker version-pointer contract: client/skill payloads point to registry version', () => {
  const src = workerSource();
  assert.match(src, /const registry = REGISTRY_JSON as any/);
  assert.match(src, /version:\s*registry\.version/);
});
