import { test } from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../../../worker/src/task-runtime.ts').catch(async () => {
  const ts = await import('typescript');
  const { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { fileURLToPath, pathToFileURL } = await import('node:url');

  const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const sourcePath = join(repoRoot, 'worker/src/task-runtime.ts');
  let src = readFileSync(sourcePath, 'utf8');

  src = src
    .replace("import { TaskConflictError, TaskNotFoundError, TaskStore } from '../../runtime/lib/task-store.mjs';", `import { TaskConflictError, TaskNotFoundError, TaskStore } from '${new URL('../../../runtime/lib/task-store.mjs', import.meta.url).href}';`)
    .replace("import { createTaskControlPlaneService } from '../../runtime/lib/task-control-plane-service.mjs';", `import { createTaskControlPlaneService } from '${new URL('../../../runtime/lib/task-control-plane-service.mjs', import.meta.url).href}';`)
    .replace("import { createHandoffTokenService } from '../../runtime/lib/handoff-token-service.mjs';", `import { createHandoffTokenService } from '${new URL('../../../runtime/lib/handoff-token-service.mjs', import.meta.url).href}';`)
    .replace("import { jsonResponse } from './http';", "const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });")
    .replace("import type { Env } from './types';\n", '');

  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const temp = mkdtempSync(join(tmpdir(), 'worker-task-runtime-'));
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ type: 'module' }));
  mkdirSync(join(temp, 'src'), { recursive: true });
  writeFileSync(join(temp, 'src', 'task-runtime.js'), out);
  const loaded = await import(pathToFileURL(join(temp, 'src', 'task-runtime.js')).href);
  rmSync(temp, { recursive: true, force: true });
  return loaded;
});

const { setContinuationFingerprint, getContinuationFingerprint } = mod;

test('setContinuationFingerprint enforces bounded cache size by evicting oldest entries', () => {
  for (let i = 0; i < 5005; i += 1) {
    setContinuationFingerprint(`token_${i}`, `fp_${i}`);
  }

  assert.equal(getContinuationFingerprint('token_0'), undefined);
  assert.equal(getContinuationFingerprint('token_1'), undefined);
  assert.equal(getContinuationFingerprint('token_5'), 'fp_5');
  assert.equal(getContinuationFingerprint('token_5004'), 'fp_5004');
});

test('setContinuationFingerprint updates existing entry in place', () => {
  setContinuationFingerprint('token_mutable', 'v1');
  setContinuationFingerprint('token_mutable', 'v2');
  assert.equal(getContinuationFingerprint('token_mutable'), 'v2');
});
