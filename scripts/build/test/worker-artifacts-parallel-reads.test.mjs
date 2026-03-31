/**
 * worker-artifacts-parallel-reads.test.mjs
 *
 * Tests for handleEffectiveContractPreview — verifies correctness of all three
 * artifact reads (outcomes, routes, tools) and their error handling.
 * Regression guard for the Promise.all parallelization change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

function transpileWorkerModule(relativePath, outPath) {
  const sourcePath = join(REPO_ROOT, "worker", "src", relativePath);
  let code = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  code = code
    .replace(/from ["']\.\.\/http["'];?/g, 'from "../http.mjs";')
    .replace(/from ["']\.\.\/types["'];?/g, 'from "../types.mjs";');

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, code, "utf8");
}

async function importArtifactsHandler() {
  const tempDir = mkdtempSync(join(tmpdir(), "worker-artifacts-parallel-"));

  transpileWorkerModule("http.ts", join(tempDir, "http.mjs"));
  transpileWorkerModule("types.ts", join(tempDir, "types.mjs"));
  transpileWorkerModule(
    "handlers/artifacts.ts",
    join(tempDir, "handlers", "artifacts.mjs"),
  );

  const module = await import(
    pathToFileURL(join(tempDir, "handlers", "artifacts.mjs")).href
  );

  return {
    handleEffectiveContractPreview: module.handleEffectiveContractPreview,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

const OUTCOMES = { schema_version: "1.0", outcomes: ["deploy"] };
const ROUTES = { schema_version: "1.0", routes: ["route-a"] };
const TOOLS = { schema_version: "1.0", tools: ["tool-x"] };

function makeR2(store) {
  return {
    get: async (key) => {
      const val = store[key];
      if (val === undefined) return null;
      return { text: async () => JSON.stringify(val) };
    },
  };
}

function makeKv(version) {
  return { get: async () => version };
}

const VERSION = "0.9.0";

test("handleEffectiveContractPreview returns merged contract when all artifacts present", async () => {
  const { handleEffectiveContractPreview, cleanup } =
    await importArtifactsHandler();

  try {
    const env = {
      MANIFEST_KV: makeKv(VERSION),
      ARTEFACTS_R2: makeR2({
        [`manifests/${VERSION}/outcomes.json`]: OUTCOMES,
        [`manifests/${VERSION}/routes.json`]: ROUTES,
        [`manifests/${VERSION}/tools.json`]: TOOLS,
      }),
    };

    const response = await handleEffectiveContractPreview(env, {
      version: VERSION,
    });
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.version, VERSION);
    assert.deepEqual(body.effective_contract.outcomes, OUTCOMES);
    assert.deepEqual(body.effective_contract.routes, ROUTES);
    assert.deepEqual(body.effective_contract.tools, TOOLS);
  } finally {
    cleanup();
  }
});

test("handleEffectiveContractPreview returns 404 when outcomes artifact missing", async () => {
  const { handleEffectiveContractPreview, cleanup } =
    await importArtifactsHandler();

  try {
    const env = {
      MANIFEST_KV: makeKv(VERSION),
      ARTEFACTS_R2: makeR2({
        // outcomes missing
        [`manifests/${VERSION}/routes.json`]: ROUTES,
        [`manifests/${VERSION}/tools.json`]: TOOLS,
      }),
    };

    const response = await handleEffectiveContractPreview(env, {
      version: VERSION,
    });
    assert.equal(response.status, 404);
  } finally {
    cleanup();
  }
});

test("handleEffectiveContractPreview returns 404 when routes artifact missing", async () => {
  const { handleEffectiveContractPreview, cleanup } =
    await importArtifactsHandler();

  try {
    const env = {
      MANIFEST_KV: makeKv(VERSION),
      ARTEFACTS_R2: makeR2({
        [`manifests/${VERSION}/outcomes.json`]: OUTCOMES,
        // routes missing
        [`manifests/${VERSION}/tools.json`]: TOOLS,
      }),
    };

    const response = await handleEffectiveContractPreview(env, {
      version: VERSION,
    });
    assert.equal(response.status, 404);
  } finally {
    cleanup();
  }
});

test("handleEffectiveContractPreview returns 404 when tools artifact missing", async () => {
  const { handleEffectiveContractPreview, cleanup } =
    await importArtifactsHandler();

  try {
    const env = {
      MANIFEST_KV: makeKv(VERSION),
      ARTEFACTS_R2: makeR2({
        [`manifests/${VERSION}/outcomes.json`]: OUTCOMES,
        [`manifests/${VERSION}/routes.json`]: ROUTES,
        // tools missing
      }),
    };

    const response = await handleEffectiveContractPreview(env, {
      version: VERSION,
    });
    assert.equal(response.status, 404);
  } finally {
    cleanup();
  }
});

test("handleEffectiveContractPreview returns 503 when R2 not configured", async () => {
  const { handleEffectiveContractPreview, cleanup } =
    await importArtifactsHandler();

  try {
    const env = {
      MANIFEST_KV: makeKv(VERSION),
      // no ARTEFACTS_R2
    };

    const response = await handleEffectiveContractPreview(env, {
      version: VERSION,
    });
    assert.equal(response.status, 503);
  } finally {
    cleanup();
  }
});
