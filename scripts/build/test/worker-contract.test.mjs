import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const WORKER_INDEX_TS = resolve(REPO_ROOT, 'worker/src/index.ts');
const TASK_STORE_FILE_URL = new URL('../../../runtime/lib/task-store-worker.mjs', import.meta.url).href;
const KV_TASK_STORE_FILE_URL = new URL('../../../runtime/lib/task-store-kv.mjs', import.meta.url).href;
const HANDOFF_SERVICE_FILE_URL = new URL('../../../runtime/lib/handoff-token-service-worker.mjs', import.meta.url).href;
const TASK_CONTROL_PLANE_SERVICE_FILE_URL = new URL('../../../runtime/lib/task-control-plane-service-worker.mjs', import.meta.url).href;
const REGISTRY_PATH = resolve(REPO_ROOT, 'dist/registry/index.json');
const PLUGIN_PATH = resolve(REPO_ROOT, 'dist/clients/claude-code/.claude-plugin/plugin.json');

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function loadWorkerWithFixtures(registryFixture, pluginFixture) {
  const source = readFileSync(WORKER_INDEX_TS, 'utf8');
  const ts = await import('typescript');

  const patchedIndex = source
    .replace(
      /import REGISTRY_JSON from '..\/..\/dist\/registry\/index.json';/,
      `const REGISTRY_JSON = ${JSON.stringify(registryFixture)} as const;`
    )
    .replace(
      /import CLAUDE_CODE_PLUGIN_JSON from '..\/..\/dist\/clients\/claude-code\/\.claude-plugin\/plugin.json';/,
      `const CLAUDE_CODE_PLUGIN_JSON = ${JSON.stringify(pluginFixture)} as const;`
    )
    .replace(
      /import \{ TaskStore, TaskConflictError, TaskNotFoundError \} from '..\/..\/runtime\/lib\/task-store.mjs';/,
      `import { TaskStore, TaskConflictError, TaskNotFoundError } from '${TASK_STORE_FILE_URL}';`
    )
    .replace(
      /import \{ createHandoffTokenService \} from '..\/..\/runtime\/lib\/handoff-token-service.mjs';/,
      `import { createHandoffTokenService } from '${HANDOFF_SERVICE_FILE_URL}';`
    )
    .replace(
      /import \{ createTaskControlPlaneService \} from '..\/..\/runtime\/lib\/task-control-plane-service-worker\.mjs';/,
      `import { createTaskControlPlaneService } from '${TASK_CONTROL_PLANE_SERVICE_FILE_URL}';`
    );

  const tempRoot = mkdtempSync(join(tmpdir(), 'worker-contract-'));
  const tempSrc = join(tempRoot, 'src');
  const sourceRoot = resolve(REPO_ROOT, 'worker/src');

  function transpileTree(current) {
    for (const entry of readdirSync(current)) {
      const absolute = join(current, entry);
      const relative = absolute.slice(sourceRoot.length + 1);
      const stat = statSync(absolute);

      if (stat.isDirectory()) {
        transpileTree(absolute);
        continue;
      }

      if (!relative.endsWith('.ts')) {
        continue;
      }

      let tsSource = relative === 'index.ts' ? patchedIndex : readFileSync(absolute, 'utf8');
      if (relative === 'task-runtime.ts') {
        tsSource = tsSource
          .replace("import { TaskConflictError, TaskNotFoundError, TaskStore } from '../../runtime/lib/task-store-worker.mjs';", `import { TaskStore, TaskConflictError, TaskNotFoundError } from '${TASK_STORE_FILE_URL}';`)
          .replace("import { KvTaskStore } from '../../runtime/lib/task-store-kv.mjs';", `import { KvTaskStore } from '${KV_TASK_STORE_FILE_URL}';`)
          .replace("import { createTaskControlPlaneService } from '../../runtime/lib/task-control-plane-service-worker.mjs';", `import { createTaskControlPlaneService } from '${TASK_CONTROL_PLANE_SERVICE_FILE_URL}';`)
          .replace("import { createHandoffTokenService } from '../../runtime/lib/handoff-token-service-worker.mjs';", `import { createHandoffTokenService } from '${HANDOFF_SERVICE_FILE_URL}';`);
      }
      const transpiled = ts.transpileModule(tsSource, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: relative,
      });

      const outputPath = join(tempSrc, relative.replace(/\.ts$/, '.js'));
      mkdirSync(dirname(outputPath), { recursive: true });
      const rewritten = transpiled.outputText.replace(
        /(from\s+['"])(\.\.?\/[^'".]+)(['"])/g,
        '$1$2.js$3'
      );
      writeFileSync(outputPath, rewritten);
    }
  }

  mkdirSync(tempSrc, { recursive: true });
  transpileTree(sourceRoot);
  writeFileSync(join(tempRoot, 'package.json'), JSON.stringify({ type: 'module' }));

  const moduleUrl = `${pathToFileURL(join(tempSrc, 'index.js')).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  rmSync(tempRoot, { recursive: true, force: true });
  return mod.default;
}

function makeAuthorizedRequest(pathname) {
  return new Request(`https://example.test${pathname}`, {
    method: 'GET',
    headers: { Authorization: 'Bearer test-token' },
  });
}

function makeAuthorizedJsonRequest(method, pathname, body) {
  return new Request(`https://example.test${pathname}`, {
    method,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function createTask(worker, task, requestEnv = env) {
  const response = await worker.fetch(makeAuthorizedJsonRequest('POST', '/v1/tasks', task), requestEnv);
  assert.equal(response.status, 201, `expected task ${task.task_id} to be created`);
  return response.json();
}

function createMockKv(initialData = {}) {
  const store = new Map(Object.entries(initialData).map(([key, value]) => [key, JSON.stringify(value)]));

  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

const env = { AUTH_TOKEN: 'test-token', ENVIRONMENT: 'test', HANDOFF_TOKEN_SIGNING_KEY: 'test-signing-key' };

async function makeSignedHandoffToken({ tokenId, taskId, issuedAt, expiresAt, replayNonce = 'nonce_1', signingKey = 'test-signing-key' }) {
  const token = {
    schema_version: '1.0.0',
    token_id: tokenId,
    task_id: taskId,
    issued_at: issuedAt,
    expires_at: expiresAt,
    signature: '',
    replay_nonce: replayNonce,
  };

  const { canonicalHandoffTokenPayload, signCanonicalHandoffTokenPayload } = await import(HANDOFF_SERVICE_FILE_URL);
  token.signature = signCanonicalHandoffTokenPayload({
    secret: signingKey,
    canonical: canonicalHandoffTokenPayload(token),
  });
  return token;
}

async function responseJson(worker, path) {
  const res = await worker.fetch(makeAuthorizedRequest(path), env);
  return {
    status: res.status,
    body: await res.json(),
  };
}

function makeStorageEnv(version, artefacts) {
  return {
    ...env,
    MANIFEST_KV: {
      async get(key) {
        if (key === 'latest') return version;
        return null;
      },
    },
    ARTEFACTS_R2: {
      async get(key) {
        if (!(key in artefacts)) return null;
        return {
          async text() {
            return JSON.stringify(artefacts[key]);
          },
        };
      },
    },
  };
}

async function responseJsonWithEnv(worker, path, overrideEnv) {
  const res = await worker.fetch(makeAuthorizedRequest(path), overrideEnv);
  return {
    status: res.status,
    body: await res.json(),
  };
}

function assertVersionParity(contract, expectedVersion) {
  const entries = Object.entries(contract);
  for (const [name, value] of entries) {
    assert.equal(
      value,
      expectedVersion,
      `[worker-contract] Version mismatch for ${name}: expected ${expectedVersion}, received ${value}`
    );
  }
}

describe('worker endpoint contract', () => {
  test('health/manifest/client/skill versions all match dist registry version', async () => {
    const registry = loadJson(REGISTRY_PATH);
    const plugin = loadJson(PLUGIN_PATH);
    const worker = await loadWorkerWithFixtures(registry, plugin);

    const health = await responseJson(worker, '/v1/health');
    const manifest = await responseJson(worker, '/v1/manifest/latest');
    const clientLatest = await responseJson(worker, '/v1/client/claude-code/latest');
    const skillId = registry.skills[0]?.id;
    assert.ok(skillId, 'registry must include at least one skill for /v1/skill/:id test');
    const skill = await responseJson(worker, `/v1/skill/${skillId}`);

    assert.equal(health.status, 200);
    assert.equal(manifest.status, 200);
    assert.equal(clientLatest.status, 200);
    assert.equal(skill.status, 200);

    assertVersionParity(
      {
        'health.version': health.body.version,
        'manifest.version': manifest.body.version,
        'client.latest.version': clientLatest.body.version,
        'skill.version': skill.body.version,
      },
      registry.version
    );
  });

  test('client payload artifact metadata aligns with registry skill entries', async () => {
    const registry = loadJson(REGISTRY_PATH);
    const plugin = loadJson(PLUGIN_PATH);
    const worker = await loadWorkerWithFixtures(registry, plugin);

    const clientLatest = await responseJson(worker, '/v1/client/claude-code/latest');
    assert.equal(clientLatest.status, 200);

    assert.deepEqual(clientLatest.body.plugin_json, plugin, 'client payload plugin_json must equal emitted plugin');

    const registrySkillsById = new Map(registry.skills.map(skill => [skill.id, skill]));
    for (const pluginSkill of clientLatest.body.plugin_json.skills) {
      const registrySkill = registrySkillsById.get(pluginSkill.name);
      assert.ok(registrySkill, `plugin skill '${pluginSkill.name}' must exist in registry.skills`);
      assert.equal(
        pluginSkill.version,
        registrySkill.version,
        `plugin skill '${pluginSkill.name}' version must match registry entry`
      );
      assert.equal(
        pluginSkill.path,
        `skills/${pluginSkill.name}/SKILL.md`,
        `plugin skill '${pluginSkill.name}' path should reference materialized artifact`
      );
    }
  });

  test('unknown route/client/skill errors stay structured and never expose version fields', async () => {
    const registry = loadJson(REGISTRY_PATH);
    const plugin = loadJson(PLUGIN_PATH);
    const worker = await loadWorkerWithFixtures(registry, plugin);

    const unknownRoute = await responseJson(worker, '/v1/unknown');
    const unknownClient = await responseJson(worker, '/v1/client/nope/latest');
    const unknownSkill = await responseJson(worker, '/v1/skill/nope');

    for (const sample of [unknownRoute, unknownClient, unknownSkill]) {
      assert.equal(sample.status, 404);
      assert.equal(sample.body.error, 'Not Found');
      assert.equal(typeof sample.body.message, 'string');
      assert.ok(sample.body.message.length > 0);
      assert.ok(!('version' in sample.body), 'error payload must not include version field');
    }
  });

  test('regression: actionable failure when registry/plugin fixture versions diverge', async () => {
    const registry = loadJson(REGISTRY_PATH);
    const plugin = loadJson(PLUGIN_PATH);
    const worker = await loadWorkerWithFixtures(registry, { ...plugin, version: '0.0.0-fixture-mismatch' });

    const health = await responseJson(worker, '/v1/health');
    const manifest = await responseJson(worker, '/v1/manifest/latest');
    const clientLatest = await responseJson(worker, '/v1/client/claude-code/latest');
    const firstSkillId = registry.skills[0].id;
    const skill = await responseJson(worker, `/v1/skill/${firstSkillId}`);

    assert.throws(
      () => {
        assertVersionParity(
          {
            'health.version': health.body.version,
            'manifest.version': manifest.body.version,
            'client.latest.version': clientLatest.body.plugin_json.version,
            'skill.version': skill.body.version,
          },
          registry.version
        );
      },
      /\[worker-contract\] Version mismatch for client.latest.version: expected .* received 0.0.0-fixture-mismatch/
    );
  });

  test('manifest/artifact endpoints resolve through version pointers when storage bindings exist', async () => {
    const registry = loadJson(REGISTRY_PATH);
    const plugin = loadJson(PLUGIN_PATH);
    const worker = await loadWorkerWithFixtures(registry, plugin);
    const version = '9.9.9-test';

    const envWithStorage = makeStorageEnv(version, {
      [`manifests/${version}/manifest.json`]: { version, kind: 'manifest' },
      [`manifests/${version}/outcomes.json`]: { version, kind: 'outcomes' },
      [`manifests/${version}/routes.json`]: { version, kind: 'routes' },
      [`manifests/${version}/tools.json`]: { version, kind: 'tools' },
    });

    const manifest = await responseJsonWithEnv(worker, '/v1/manifest/latest', envWithStorage);
    const outcomes = await responseJsonWithEnv(worker, '/v1/outcomes/latest', envWithStorage);
    const routes = await responseJsonWithEnv(worker, '/v1/routes/latest', envWithStorage);
    const tools = await responseJsonWithEnv(worker, '/v1/tools/latest', envWithStorage);

    assert.equal(manifest.status, 200);
    assert.equal(manifest.body.version, version);
    assert.equal(manifest.body.kind, 'manifest');

    for (const sample of [outcomes, routes, tools]) {
      assert.equal(sample.status, 200);
      assert.equal(sample.body.version, version);
    }
  });

  test('task control plane endpoints cover success and deterministic continuation replay', async () => {
    const registry = loadJson(REGISTRY_PATH);
    const plugin = loadJson(PLUGIN_PATH);
    const worker = await loadWorkerWithFixtures(registry, plugin);

    const task = {
      schema_version: '1.0.0',
      task_id: 'task_review_repository_001',
      task_type: 'review_repository',
      goal: 'Review repository changes for correctness and risk.',
      current_route: 'github_pr',
      state: 'pending',
      progress: { completed_steps: 0, total_steps: 3 },
      findings: [],
      unresolved_questions: [],
      approvals: [],
      route_history: [{ route: 'github_pr', selected_at: '2026-03-12T12:00:00.000Z' }],
      next_action: 'collect_more_context',
      version: 1,
      updated_at: '2026-03-12T12:00:00.000Z',
    };

    const createRes = await worker.fetch(makeAuthorizedJsonRequest('POST', '/v1/tasks', task), env);
    assert.equal(createRes.status, 201);
    const createBody = await createRes.json();
    assert.equal(createBody.task.task_id, task.task_id);

    const getRes = await worker.fetch(makeAuthorizedRequest(`/v1/tasks/${task.task_id}`), env);
    assert.equal(getRes.status, 200);

    const transitionRes = await worker.fetch(makeAuthorizedJsonRequest('PATCH', `/v1/tasks/${task.task_id}/state`, {
      expected_version: 1,
      next_state: 'active',
      next_action: 'collect_more_context',
      updated_at: '2026-03-12T12:01:00.000Z',
      progress: { completed_steps: 1, total_steps: 3 },
    }), env);
    assert.equal(transitionRes.status, 200);

    const routeSelectionRes = await worker.fetch(makeAuthorizedJsonRequest('POST', `/v1/tasks/${task.task_id}/route-selection`, {
      expected_version: 2,
      route_id: 'local_repo',
      selected_at: '2026-03-12T12:02:00.000Z',
    }), env);
    assert.equal(routeSelectionRes.status, 200);

    const answerRes = await worker.fetch(makeAuthorizedJsonRequest('POST', `/v1/tasks/${task.task_id}/questions/q-1/answer`, {
      expected_version: 3,
      answer: 'Use the local route for verification.',
      answered_by_route: 'hub',
      answered_at: '2026-03-12T12:02:30.000Z',
    }), env);
    assert.equal(answerRes.status, 201);

    const dismissRes = await worker.fetch(makeAuthorizedJsonRequest('POST', `/v1/tasks/${task.task_id}/questions/q-2/dismiss`, {
      expected_version: 4,
      reason: 'Already covered elsewhere.',
      dismissed_by_route: 'hub',
      dismissed_at: '2026-03-12T12:02:45.000Z',
    }), env);
    assert.equal(dismissRes.status, 201);

    const routesRes = await worker.fetch(makeAuthorizedRequest(`/v1/tasks/${task.task_id}/available-routes`), env);
    assert.equal(routesRes.status, 200);
    const routesBody = await routesRes.json();
    assert.equal(routesBody.best_next_route, 'local_repo');
    assert.equal(Array.isArray(routesBody.available_routes), true);

    const effectiveExecutionContract = {
      schema_version: '1.0.0',
      task_id: task.task_id,
      task_type: task.task_type,
      selected_route: {
        schema_version: '1.0.0',
        route_id: 'local_repo',
        equivalence_level: 'equal',
        required_capabilities: ['repo_local_read'],
        missing_capabilities: [],
      },
      equivalence_level: 'equal',
      missing_capabilities: [],
      required_inputs: ['repository_ref'],
      stronger_host_guidance: 'Use local route.',
      computed_at: '2026-03-12T12:03:00.000Z',
    };

    const handoffToken = await makeSignedHandoffToken({
      tokenId: 'handoff_001',
      taskId: task.task_id,
      issuedAt: '2026-03-12T12:03:00.000Z',
      expiresAt: '2099-03-12T12:10:00.000Z',
      replayNonce: 'nonce_1',
    });

    const continuationReqBody = {
      handoff_token: handoffToken,
      effective_execution_contract: effectiveExecutionContract,
      created_at: '2026-03-12T12:04:00.000Z',
    };

    const continuationRes1 = await worker.fetch(makeAuthorizedJsonRequest('POST', `/v1/tasks/${task.task_id}/continuation`, continuationReqBody), env);
    assert.equal(continuationRes1.status, 201);
    const continuationBody1 = await continuationRes1.json();
    assert.equal(continuationBody1.continuation_package.handoff_token_id, 'handoff_001');
    assert.equal(continuationBody1.continuation_package.created_at, '2026-03-12T12:04:00.000Z');

    const continuationRes2 = await worker.fetch(makeAuthorizedJsonRequest('POST', `/v1/tasks/${task.task_id}/continuation`, continuationReqBody), env);
    assert.equal(continuationRes2.status, 200);
    const continuationBody2 = await continuationRes2.json();
    assert.equal(
      continuationBody2.continuation_package.created_at,
      continuationBody1.continuation_package.created_at,
      'retry must be idempotent and keep canonical created_at',
    );

    const progressEventsRes = await worker.fetch(makeAuthorizedRequest(`/v1/tasks/${task.task_id}/progress-events`), env);
    assert.equal(progressEventsRes.status, 200);
    const progressEventsBody = await progressEventsRes.json();
    assert.ok(progressEventsBody.events.length >= 3);

    const readinessRes = await worker.fetch(makeAuthorizedRequest(`/v1/tasks/${task.task_id}/readiness`), env);
    assert.equal(readinessRes.status, 200);
    const readinessBody = await readinessRes.json();
    assert.equal(readinessBody.readiness.task_id, task.task_id);
    assert.equal(readinessBody.readiness.current_route, 'local_repo');
    assert.equal(readinessBody.readiness.progress_event_count >= 3, true);

    const snapshotsRes = await worker.fetch(makeAuthorizedRequest(`/v1/tasks/${task.task_id}/snapshots`), env);
    assert.equal(snapshotsRes.status, 200);
    const snapshotsBody = await snapshotsRes.json();
    assert.equal(snapshotsBody.snapshots.length, 5);

    const snapshotVersion2Res = await worker.fetch(makeAuthorizedRequest(`/v1/tasks/${task.task_id}/snapshots/2`), env);
    assert.equal(snapshotVersion2Res.status, 200);
    const snapshotVersion2Body = await snapshotVersion2Res.json();
    assert.equal(snapshotVersion2Body.snapshot.snapshot_version, 2);
  });


  test('task list endpoint rejects invalid query params and caps large limits', async () => {
    const registry = loadJson(REGISTRY_PATH);
    const plugin = loadJson(PLUGIN_PATH);
    const worker = await loadWorkerWithFixtures(registry, plugin);
    const envWithKv = { ...env, MANIFEST_KV: createMockKv() };

    for (let index = 0; index < 105; index += 1) {
      await createTask(worker, {
        schema_version: '1.0.0',
        task_id: `task_list_validation_${String(index).padStart(3, '0')}`,
        task_type: 'review_repository',
        goal: `Review repository changes for task ${index}.`,
        current_route: 'github_pr',
        state: 'pending',
        progress: { completed_steps: 0, total_steps: 3 },
        findings: [],
        unresolved_questions: [],
        approvals: [],
        route_history: [{ route: 'github_pr', selected_at: '2026-03-12T12:00:00.000Z' }],
        next_action: 'collect_more_context',
        version: 1,
        updated_at: `2026-03-12T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
      }, envWithKv);
    }

    for (const path of [
      '/v1/tasks?limit=abc',
      '/v1/tasks?limit=-1',
      '/v1/tasks?limit=0',
      '/v1/tasks?updated_within=abc',
    ]) {
      const response = await worker.fetch(makeAuthorizedRequest(path), envWithKv);
      assert.equal(response.status, 400, `expected ${path} to be rejected`);
      const body = await response.json();
      assert.equal(body.error.code, 'bad_request');
    }

    const cappedResponse = await worker.fetch(makeAuthorizedRequest('/v1/tasks?limit=500'), envWithKv);
    assert.equal(cappedResponse.status, 200);
    const cappedBody = await cappedResponse.json();
    assert.equal(cappedBody.tasks.length, 100);
  });

  test('task endpoint failures: malformed payloads, auth, not found, conflict and token errors', async () => {
    const registry = loadJson(REGISTRY_PATH);
    const plugin = loadJson(PLUGIN_PATH);
    const worker = await loadWorkerWithFixtures(registry, plugin);

    const unauthorized = await worker.fetch(new Request('https://example.test/v1/tasks', { method: 'POST' }), env);
    assert.equal(unauthorized.status, 401);


    const missingSigningKeyRes = await worker.fetch(makeAuthorizedJsonRequest('POST', '/v1/tasks/task_missing_key_001/continuation', {
      handoff_token: {
        schema_version: '1.0.0',
        token_id: 'handoff_missing_key',
        task_id: 'task_missing_key_001',
        issued_at: '2026-03-12T12:03:00.000Z',
        expires_at: '2099-03-12T12:10:00.000Z',
        signature: 'deadbeef',
        replay_nonce: 'nonce_missing_key',
      },
      effective_execution_contract: {
        schema_version: '1.0.0',
        task_id: 'task_missing_key_001',
        task_type: 'review_repository',
        selected_route: {
          schema_version: '1.0.0',
          route_id: 'github_pr',
          equivalence_level: 'equal',
          required_capabilities: ['network_http'],
          missing_capabilities: [],
        },
        equivalence_level: 'equal',
        missing_capabilities: [],
        required_inputs: ['pr_url'],
        computed_at: '2026-03-12T12:03:00.000Z',
      },
      created_at: '2026-03-12T12:04:00.000Z',
    }), { ...env, HANDOFF_TOKEN_SIGNING_KEY: '' });
    assert.equal(missingSigningKeyRes.status, 500);

    const malformed = await worker.fetch(makeAuthorizedJsonRequest('POST', '/v1/tasks/task_review_repository_001/route-selection', {
      expected_version: 'x',
      route_id: 'local_repo',
      selected_at: '2026-03-12T12:02:00.000Z',
    }), env);
    assert.equal(malformed.status, 400);

    const task = {
      schema_version: '1.0.0',
      task_id: 'task_review_repository_002',
      task_type: 'review_repository',
      goal: 'Review repository changes for correctness and risk.',
      current_route: 'github_pr',
      state: 'pending',
      progress: { completed_steps: 0, total_steps: 3 },
      findings: [],
      unresolved_questions: [],
      approvals: [],
      route_history: [{ route: 'github_pr', selected_at: '2026-03-12T12:00:00.000Z' }],
      next_action: 'collect_more_context',
      version: 1,
      updated_at: '2026-03-12T12:00:00.000Z',
    };

    const createRes = await worker.fetch(makeAuthorizedJsonRequest('POST', '/v1/tasks', task), env);
    assert.equal(createRes.status, 201);

    const duplicateCreateRes = await worker.fetch(makeAuthorizedJsonRequest('POST', '/v1/tasks', task), env);
    assert.equal(duplicateCreateRes.status, 409);

    const staleRouteSelection = await worker.fetch(makeAuthorizedJsonRequest('POST', `/v1/tasks/${task.task_id}/route-selection`, {
      expected_version: 0,
      route_id: 'local_repo',
      selected_at: '2026-03-12T12:02:00.000Z',
    }), env);
    assert.equal(staleRouteSelection.status, 409);

    const missingTask = await worker.fetch(makeAuthorizedRequest('/v1/tasks/missing_task_001'), env);
    assert.equal(missingTask.status, 404);

    const missingTaskReadiness = await worker.fetch(makeAuthorizedRequest('/v1/tasks/missing_task_001/readiness'), env);
    assert.equal(missingTaskReadiness.status, 404);

    const baseExecutionContract = {
      schema_version: '1.0.0',
      task_id: task.task_id,
      task_type: task.task_type,
      selected_route: {
        schema_version: '1.0.0',
        route_id: 'github_pr',
        equivalence_level: 'equal',
        required_capabilities: ['network_http'],
        missing_capabilities: [],
      },
      equivalence_level: 'equal',
      missing_capabilities: [],
      required_inputs: ['pr_url'],
      computed_at: '2026-03-12T12:03:00.000Z',
    };

    const invalidTokenRes = await worker.fetch(makeAuthorizedJsonRequest('POST', `/v1/tasks/${task.task_id}/continuation`, {
      handoff_token: {
        schema_version: '1.0.0',
        token_id: 'handoff_invalid',
        task_id: 'other_task_id',
        issued_at: '2026-03-12T12:03:00.000Z',
        expires_at: '2099-03-12T12:10:00.000Z',
        signature: 'deadbeef',
        replay_nonce: 'nonce_invalid',
      },
      effective_execution_contract: baseExecutionContract,
      created_at: '2026-03-12T12:04:00.000Z',
    }), env);
    assert.equal(invalidTokenRes.status, 401);

    const expiredToken = await makeSignedHandoffToken({
      tokenId: 'handoff_expired',
      taskId: task.task_id,
      issuedAt: '2020-03-12T12:03:00.000Z',
      expiresAt: '2020-03-12T12:10:00.000Z',
      replayNonce: 'nonce_expired',
    });

    const expiredTokenRes = await worker.fetch(makeAuthorizedJsonRequest('POST', `/v1/tasks/${task.task_id}/continuation`, {
      handoff_token: expiredToken,
      effective_execution_contract: baseExecutionContract,
      created_at: '2026-03-12T12:04:00.000Z',
    }), env);
    assert.equal(expiredTokenRes.status, 403);

    const replayToken = await makeSignedHandoffToken({
      tokenId: 'handoff_replay_001',
      taskId: task.task_id,
      issuedAt: '2026-03-12T12:03:00.000Z',
      expiresAt: '2099-03-12T12:10:00.000Z',
      replayNonce: 'nonce_replay_001',
    });

    const firstReplayUse = await worker.fetch(makeAuthorizedJsonRequest('POST', `/v1/tasks/${task.task_id}/continuation`, {
      handoff_token: replayToken,
      effective_execution_contract: baseExecutionContract,
      created_at: '2026-03-12T12:04:00.000Z',
    }), env);
    assert.equal(firstReplayUse.status, 201);

    const replayConflict = await worker.fetch(makeAuthorizedJsonRequest('POST', `/v1/tasks/${task.task_id}/continuation`, {
      handoff_token: replayToken,
      effective_execution_contract: {
        ...baseExecutionContract,
        required_inputs: ['different_input'],
      },
      created_at: '2026-03-12T12:05:00.000Z',
    }), env);
    assert.equal(replayConflict.status, 403);
  });
});
