import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const WORKER_INDEX_TS = resolve(REPO_ROOT, 'worker/src/index.ts');
const REGISTRY_PATH = resolve(REPO_ROOT, 'dist/registry/index.json');
const PLUGIN_PATH = resolve(REPO_ROOT, 'dist/clients/claude-code/.claude-plugin/plugin.json');

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function loadWorkerWithFixtures(registryFixture, pluginFixture) {
  const source = readFileSync(WORKER_INDEX_TS, 'utf8');
  const ts = await import('typescript');

  const patchedTs = source
    .replace(
      /import REGISTRY_JSON from '..\/..\/dist\/registry\/index.json';/,
      `const REGISTRY_JSON = ${JSON.stringify(registryFixture)} as const;`
    )
    .replace(
      /import CLAUDE_CODE_PLUGIN_JSON from '..\/..\/dist\/clients\/claude-code\/\.claude-plugin\/plugin.json';/,
      `const CLAUDE_CODE_PLUGIN_JSON = ${JSON.stringify(pluginFixture)} as const;`
    );

  const transpiled = ts.transpileModule(patchedTs, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText, 'utf8').toString('base64')}`;
  const mod = await import(moduleUrl);
  return mod.default;
}

function makeAuthorizedRequest(pathname) {
  return new Request(`https://example.test${pathname}`, {
    method: 'GET',
    headers: { Authorization: 'Bearer test-token' },
  });
}

const env = { AUTH_TOKEN: 'test-token', ENVIRONMENT: 'test' };

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
    assert.equal(manifest.body.manifest.version, version);

    for (const sample of [outcomes, routes, tools]) {
      assert.equal(sample.status, 200);
      assert.equal(sample.body.version, version);
      assert.equal(sample.body.artifact.version, version);
    }
  });
});
