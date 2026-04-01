/**
 * capability-discovery-api.test.mjs
 *
 * Comprehensive test suite for the capability discovery REST API.
 * Tests: happy paths, validation, CORS, error formats, edge cases,
 * data consistency, injection protection, and response structure.
 *
 * All tests use the same transpile-and-load harness as worker-contract.test.mjs
 * so they exercise real Worker code, not mocks.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const WORKER_INDEX_TS = resolve(REPO_ROOT, "worker/src/index.ts");
const TASK_STORE_FILE_URL = new URL(
  "../../../runtime/lib/task-store-worker.mjs",
  import.meta.url,
).href;
const KV_TASK_STORE_FILE_URL = new URL(
  "../../../runtime/lib/task-store-kv.mjs",
  import.meta.url,
).href;
const HANDOFF_SERVICE_FILE_URL = new URL(
  "../../../runtime/lib/handoff-token-service-worker.mjs",
  import.meta.url,
).href;
const TASK_CONTROL_PLANE_SERVICE_FILE_URL = new URL(
  "../../../runtime/lib/task-control-plane-service-worker.mjs",
  import.meta.url,
).href;
const REGISTRY_PATH = resolve(REPO_ROOT, "dist/registry/index.json");
const PLUGIN_PATH = resolve(
  REPO_ROOT,
  "dist/clients/claude-code/.claude-plugin/plugin.json",
);

// ─── Harness (shared with worker-contract.test.mjs) ──────────────────────────

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function loadWorkerWithFixtures(registryFixture, pluginFixture) {
  const source = readFileSync(WORKER_INDEX_TS, "utf8");
  const ts = await import("typescript");

  const patchedIndex = source
    .replace(
      /import REGISTRY_JSON from ["']\.\.\/\.\.\/dist\/registry\/index\.json["'];/,
      `const REGISTRY_JSON = ${JSON.stringify(registryFixture)} as const;`,
    )
    .replace(
      /import CLAUDE_CODE_PLUGIN_JSON from ["']\.\.\/\.\.\/dist\/clients\/claude-code\/\.claude-plugin\/plugin\.json["'];/,
      `const CLAUDE_CODE_PLUGIN_JSON = ${JSON.stringify(pluginFixture)} as const;`,
    )
    .replace(
      /import \{ TaskStore, TaskConflictError, TaskNotFoundError \} from '..\/..\/runtime\/lib\/task-store.mjs';/,
      `import { TaskStore, TaskConflictError, TaskNotFoundError } from '${TASK_STORE_FILE_URL}';`,
    )
    .replace(
      /import \{ createHandoffTokenService \} from '..\/..\/runtime\/lib\/handoff-token-service.mjs';/,
      `import { createHandoffTokenService } from '${HANDOFF_SERVICE_FILE_URL}';`,
    )
    .replace(
      /import \{ createTaskControlPlaneService \} from '..\/..\/runtime\/lib\/task-control-plane-service-worker\.mjs';/,
      `import { createTaskControlPlaneService } from '${TASK_CONTROL_PLANE_SERVICE_FILE_URL}';`,
    );

  const tempRoot = mkdtempSync(join(tmpdir(), "cap-api-test-"));
  const tempSrc = join(tempRoot, "src");
  const sourceRoot = resolve(REPO_ROOT, "worker/src");

  function transpileTree(current) {
    for (const entry of readdirSync(current)) {
      const absolute = join(current, entry);
      const relative = absolute.slice(sourceRoot.length + 1);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        transpileTree(absolute);
        continue;
      }
      if (!relative.endsWith(".ts")) continue;

      let tsSource =
        relative === "index.ts" ? patchedIndex : readFileSync(absolute, "utf8");
      if (relative === "task-runtime.ts") {
        tsSource = tsSource
          .replace(
            /(?:\/\/ @ts-expect-error[^\n]*\n)(?:\/\/ prettier-ignore\s*\n)?import\s*\{\s*TaskConflictError,\s*TaskNotFoundError,\s*TaskStore,?\s*\}\s*from\s*["']\.\.\/\.\.\/runtime\/lib\/task-store-worker\.mjs["'];/s,
            `import { TaskStore, TaskConflictError, TaskNotFoundError } from '${TASK_STORE_FILE_URL}';`,
          )
          .replace(
            /import\s*\{\s*KvTaskStore\s*\}\s*from\s*["']\.\.\/\.\.\/runtime\/lib\/task-store-kv\.mjs["'];/,
            `import { KvTaskStore } from '${KV_TASK_STORE_FILE_URL}';`,
          )
          .replace(
            /import\s*\{\s*createTaskControlPlaneService\s*\}\s*from\s*["']\.\.\/\.\.\/runtime\/lib\/task-control-plane-service-worker\.mjs["'];/,
            `import { createTaskControlPlaneService } from '${TASK_CONTROL_PLANE_SERVICE_FILE_URL}';`,
          )
          .replace(
            /import\s*\{\s*createHandoffTokenService\s*\}\s*from\s*["']\.\.\/\.\.\/runtime\/lib\/handoff-token-service-worker\.mjs["'];/,
            `import { createHandoffTokenService } from '${HANDOFF_SERVICE_FILE_URL}';`,
          );
      }
      const transpiled = ts.transpileModule(tsSource, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: relative,
      });
      const outputPath = join(tempSrc, relative.replace(/\.ts$/, ".js"));
      mkdirSync(dirname(outputPath), { recursive: true });
      const rewritten = transpiled.outputText.replace(
        /(from\s+['"])(\.\.?\/[^'".]+)(['"])/g,
        "$1$2.js$3",
      );
      writeFileSync(outputPath, rewritten);
    }
  }

  mkdirSync(tempSrc, { recursive: true });
  transpileTree(sourceRoot);
  writeFileSync(
    join(tempRoot, "package.json"),
    JSON.stringify({ type: "module" }),
  );

  const moduleUrl = `${pathToFileURL(join(tempSrc, "index.js")).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  rmSync(tempRoot, { recursive: true, force: true });
  return mod.default;
}

const AUTH_TOKEN = "test-token-123";
const baseEnv = { AUTH_TOKEN, EXECUTOR_SHARED_SECRET: "secret" };

function makeRequest(path, method = "GET", headers = {}) {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`, ...headers },
  });
}

async function call(worker, path, method = "GET", headers = {}) {
  const res = await worker.fetch(makeRequest(path, method, headers), baseEnv);
  const body = res.headers.get("content-type")?.includes("application/json")
    ? await res.json()
    : await res.text();
  return { status: res.status, body, headers: res.headers };
}

// ─── Minimal registry fixture ─────────────────────────────────────────────────

function makeRegistry(overrides = {}) {
  return {
    version: "1.0.0-test",
    skill_count: 2,
    platform_count: 3,
    platforms: ["claude-code", "claude-web", "claude-ios"],
    platform_definitions: {
      "claude-code": {
        id: "claude-code",
        name: "Claude Code",
        surface: "desktop-cli",
        default_package: "skill",
        capabilities: {
          "fs.read": {
            status: "supported",
            confidence: "high",
            source: "manual-test",
          },
          "fs.write": {
            status: "supported",
            confidence: "high",
            source: "manual-test",
          },
          "shell.exec": {
            status: "supported",
            confidence: "high",
            source: "manual-test",
          },
          "git.read": {
            status: "supported",
            confidence: "high",
            source: "manual-test",
          },
          "network.http": {
            status: "supported",
            confidence: "high",
            source: "manual-test",
          },
          "mcp.client": {
            status: "supported",
            confidence: "high",
            source: "manual-test",
          },
        },
        notes: "Full local access.",
      },
      "claude-web": {
        id: "claude-web",
        name: "Claude Web",
        surface: "web-app",
        default_package: "api",
        capabilities: {
          "fs.read": {
            status: "unknown",
            confidence: "low",
            source: "inference",
          },
          "shell.exec": {
            status: "unsupported",
            confidence: "medium",
            source: "inference",
          },
          "network.http": {
            status: "supported",
            confidence: "medium",
            source: "vendor-doc",
          },
          "ui.prompt-only": {
            status: "supported",
            confidence: "high",
            source: "vendor-doc",
          },
        },
        notes: "Web interface. Prompt-only mode always available.",
      },
      "claude-ios": {
        id: "claude-ios",
        name: "Claude iOS",
        surface: "mobile-app",
        default_package: "api",
        capabilities: {
          "network.http": {
            status: "supported",
            confidence: "medium",
            source: "vendor-doc",
          },
          "shell.exec": {
            status: "unsupported",
            confidence: "medium",
            source: "inference",
          },
          "fs.read": {
            status: "unsupported",
            confidence: "medium",
            source: "inference",
          },
        },
      },
    },
    skills: [
      {
        id: "git-ops",
        version: "1.0.0",
        description: "Git operations skill requiring shell access.",
        type: "hook",
        status: "stable",
        invocation: null,
        tags: ["git", "core"],
        capabilities: {
          required: ["shell.exec", "git.read"],
          optional: ["fs.write"],
          fallback_mode: "none",
        },
        compatibility: {
          "claude-code": {
            status: "supported",
            mode: "native",
            package: "skill",
          },
          "claude-web": {
            status: "excluded",
            mode: "excluded",
            package: "api",
            notes: "No shell access.",
          },
          "claude-ios": {
            status: "excluded",
            mode: "excluded",
            package: "api",
            notes: "No shell access.",
          },
        },
        platforms: [],
        dependencies: { runtime: [], optional: [], skills: [], models: [] },
      },
      {
        id: "code-review",
        version: "1.0.0",
        description: "Structured code review; works everywhere via prompt.",
        type: "prompt",
        status: "stable",
        invocation: null,
        tags: ["review"],
        capabilities: {
          required: [],
          optional: ["fs.read", "git.read"],
          fallback_mode: "prompt-only",
        },
        compatibility: {
          "claude-code": {
            status: "supported",
            mode: "native",
            package: "skill",
          },
          "claude-web": { status: "supported", mode: "native", package: "api" },
          "claude-ios": { status: "supported", mode: "native", package: "api" },
        },
        platforms: [],
        dependencies: { runtime: [], optional: [], skills: [], models: [] },
      },
    ],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("capability discovery API", () => {
  // ── 1. Happy path — /v1/capabilities/platform/:platform ─────────────────────

  describe("/v1/capabilities/platform/:platform — happy path", () => {
    test("returns capability profile for claude-code", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/capabilities/platform/claude-code",
      );

      assert.equal(status, 200);
      assert.equal(body.platform, "claude-code");
      assert.equal(body.surface, "desktop-cli");
      assert.equal(body.manifest_version, "1.0.0-test");
      assert.ok(
        Array.isArray(body.capabilities.supported),
        "supported must be an array",
      );
      assert.ok(
        Array.isArray(body.capabilities.unsupported),
        "unsupported must be an array",
      );
      assert.ok(
        Array.isArray(body.capabilities.unknown),
        "unknown must be an array",
      );
      assert.ok(
        body.capabilities.supported.includes("shell.exec"),
        "claude-code supports shell.exec",
      );
      assert.ok(
        body.capabilities.supported.includes("fs.read"),
        "claude-code supports fs.read",
      );
    });

    test("returns capability profile for claude-web", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/capabilities/platform/claude-web",
      );

      assert.equal(status, 200);
      assert.equal(body.platform, "claude-web");
      assert.equal(body.surface, "web-app");
      assert.ok(body.capabilities.supported.includes("network.http"));
      assert.ok(body.capabilities.unsupported.includes("shell.exec"));
    });

    test("returns capability profile for claude-ios", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/capabilities/platform/claude-ios",
      );

      assert.equal(status, 200);
      assert.equal(body.platform, "claude-ios");
      assert.equal(body.surface, "mobile-app");
      assert.ok(body.capabilities.supported.includes("network.http"));
      assert.ok(body.capabilities.unsupported.includes("shell.exec"));
      assert.ok(body.capabilities.unsupported.includes("fs.read"));
    });

    test("includes capability_detail with status, confidence and source per cap", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/capabilities/platform/claude-code",
      );

      assert.ok(body.capability_detail, "capability_detail present");
      const fsRead = body.capability_detail["fs.read"];
      assert.equal(fsRead.status, "supported");
      assert.equal(fsRead.confidence, "high");
      assert.equal(fsRead.source, "manual-test");
    });

    test("includes platform notes when present", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/capabilities/platform/claude-web",
      );
      assert.ok(
        typeof body.notes === "string" && body.notes.length > 0,
        "notes present for claude-web",
      );
    });

    test("omits notes field when platform has no notes", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/capabilities/platform/claude-ios",
      );
      assert.equal(body.notes, undefined, "no notes for claude-ios fixture");
    });

    test("returns capabilities from the real compiled registry", async () => {
      const registry = loadJson(REGISTRY_PATH);
      const worker = await loadWorkerWithFixtures(
        registry,
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/capabilities/platform/claude-code",
      );

      assert.equal(status, 200);
      assert.equal(body.manifest_version, registry.version);
      assert.ok(
        body.capabilities.supported.length > 0,
        "at least one supported capability",
      );
    });
  });

  // ── 2. /v1/capabilities/platform/:platform — validation ──────────────────────

  describe("/v1/capabilities/platform/:platform — validation", () => {
    test("returns 404 for unknown platform", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/capabilities/platform/nonexistent",
      );

      assert.equal(status, 404);
      assert.equal(body.error.code, "INVALID_PLATFORM");
      assert.ok(body.error.message.includes("nonexistent"));
      assert.ok(body.error.hint, "hint lists known platforms");
    });

    test("blocks path traversal attempts", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/capabilities/platform/..%2F..%2Fetc%2Fpasswd",
      );

      assert.equal(status, 404);
      assert.equal(body.error.code, "INVALID_PLATFORM");
    });

    test("blocks slash-injected platform names", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status } = await call(
        worker,
        "/v1/capabilities/platform/claude-code/extra",
      );
      // Route won't match — falls through to 404 from router
      assert.equal(status, 404);
    });
  });

  // ── 3. CORS headers ───────────────────────────────────────────────────────────

  describe("CORS headers", () => {
    test("capability platform response includes CORS headers", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { headers } = await call(
        worker,
        "/v1/capabilities/platform/claude-web",
      );

      assert.equal(headers.get("access-control-allow-origin"), "*");
      assert.ok(headers.get("access-control-allow-methods")?.includes("GET"));
    });

    test("compatible skills response includes CORS headers", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { headers } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http",
      );

      assert.equal(headers.get("access-control-allow-origin"), "*");
    });

    test("error responses include CORS headers (404)", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, headers } = await call(
        worker,
        "/v1/capabilities/platform/does-not-exist",
      );

      assert.equal(status, 404);
      assert.equal(headers.get("access-control-allow-origin"), "*");
    });

    test("error responses include CORS headers (400)", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, headers } = await call(worker, "/v1/skills/compatible");

      assert.equal(status, 400);
      assert.equal(headers.get("access-control-allow-origin"), "*");
    });

    test("OPTIONS preflight returns 204 with full CORS headers", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const res = await worker.fetch(
        new Request("https://worker.test/v1/capabilities/platform/claude-web", {
          method: "OPTIONS",
        }),
        baseEnv,
      );
      assert.equal(res.status, 204);
      assert.equal(res.headers.get("access-control-allow-origin"), "*");
      assert.ok(
        res.headers.get("access-control-allow-methods")?.includes("GET"),
      );
    });
  });

  // ── 4. Caching headers ────────────────────────────────────────────────────────

  describe("caching headers", () => {
    test("platform response has immutable cache-control", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { headers } = await call(
        worker,
        "/v1/capabilities/platform/claude-code",
      );

      const cc = headers.get("cache-control") ?? "";
      assert.ok(
        cc.includes("immutable"),
        "cache-control must include immutable",
      );
      assert.ok(
        cc.includes("max-age=31536000"),
        "cache-control must include 1-year max-age",
      );
    });

    test("platform response has ETag header", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { headers } = await call(
        worker,
        "/v1/capabilities/platform/claude-code",
      );
      assert.ok(headers.get("etag"), "ETag must be present");
    });

    test("same platform always returns same ETag", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const r1 = await call(worker, "/v1/capabilities/platform/claude-web");
      const r2 = await call(worker, "/v1/capabilities/platform/claude-web");
      assert.equal(r1.headers.get("etag"), r2.headers.get("etag"));
    });

    test("compatible skills response has immutable cache-control", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { headers } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http",
      );

      const cc = headers.get("cache-control") ?? "";
      assert.ok(cc.includes("immutable"));
    });
  });

  // ── 5. Happy path — /v1/skills/compatible ────────────────────────────────────

  describe("/v1/skills/compatible — happy path", () => {
    test("returns skills with no required capabilities for any cap set", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http",
      );

      assert.equal(status, 200);
      assert.equal(body.manifest_version, "1.0.0-test");
      assert.ok(Array.isArray(body.skills));
      // code-review has no required caps → always included
      const ids = body.skills.map((s) => s.id);
      assert.ok(
        ids.includes("code-review"),
        "code-review is compatible with any caps",
      );
    });

    test("excludes skills whose required caps are not in request", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      // Only network.http — git-ops needs shell.exec + git.read → excluded
      const { body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http",
      );

      const ids = body.skills.map((s) => s.id);
      assert.ok(
        !ids.includes("git-ops"),
        "git-ops excluded when shell.exec absent",
      );
    });

    test("includes skill when all required caps are satisfied", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/skills/compatible?caps=shell.exec,git.read,network.http",
      );

      const ids = body.skills.map((s) => s.id);
      assert.ok(
        ids.includes("git-ops"),
        "git-ops included when all required caps present",
      );
      assert.ok(ids.includes("code-review"), "code-review always included");
    });

    test("response includes correct counts", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http",
      );

      assert.equal(body.total_skills, 2);
      assert.equal(body.compatible_count, body.skills.length);
    });

    test("each skill entry has required fields", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/skills/compatible?caps=shell.exec,git.read",
      );

      for (const skill of body.skills) {
        assert.ok(skill.id, "id present");
        assert.ok(skill.version, "version present");
        assert.ok(skill.description !== undefined, "description present");
        assert.ok(skill.type, "type present");
        assert.ok(skill.status, "status present");
        assert.ok(skill.capabilities, "capabilities present");
        assert.ok(skill.compatibility, "compatibility matrix present");
      }
    });

    test("each compatible skill includes full pre-computed compatibility matrix", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http",
      );

      const codeReview = body.skills.find((s) => s.id === "code-review");
      assert.ok(codeReview, "code-review present");
      assert.ok(
        codeReview.compatibility["claude-code"],
        "compat for claude-code present",
      );
      assert.ok(
        codeReview.compatibility["claude-web"],
        "compat for claude-web present",
      );
      assert.ok(
        codeReview.compatibility["claude-ios"],
        "compat for claude-ios present",
      );
    });

    test("includes fallback_mode in skill capabilities", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http",
      );

      const codeReview = body.skills.find((s) => s.id === "code-review");
      assert.equal(codeReview.capabilities.fallback_mode, "prompt-only");
    });

    test("includes requested_capabilities in response", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http,fs.read",
      );

      assert.ok(body.requested_capabilities.includes("network.http"));
      assert.ok(body.requested_capabilities.includes("fs.read"));
    });

    test("deduplicates repeated capability IDs in request", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http,network.http",
      );

      assert.equal(status, 200);
      // Deduplicated — requested_capabilities has only one entry
      assert.equal(
        body.requested_capabilities.filter((c) => c === "network.http").length,
        1,
      );
    });

    test("works against real compiled registry", async () => {
      const registry = loadJson(REGISTRY_PATH);
      const worker = await loadWorkerWithFixtures(
        registry,
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http",
      );

      assert.equal(status, 200);
      assert.ok(body.total_skills > 0);
      assert.ok(body.compatible_count >= 0);
      assert.ok(body.compatible_count <= body.total_skills);
    });
  });

  // ── 6. /v1/skills/compatible — validation ────────────────────────────────────

  describe("/v1/skills/compatible — validation", () => {
    test("returns 400 when caps param is missing", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(worker, "/v1/skills/compatible");

      assert.equal(status, 400);
      assert.equal(body.error.code, "MISSING_CAPS_PARAM");
      assert.ok(body.error.hint, "hint with usage example present");
    });

    test("returns 400 when caps param is empty string", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/skills/compatible?caps=",
      );

      assert.equal(status, 400);
      assert.equal(body.error.code, "EMPTY_CAPS_PARAM");
    });

    test("returns 400 for invalid capability ID format", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/skills/compatible?caps=UPPERCASE",
      );

      assert.equal(status, 400);
      assert.equal(body.error.code, "INVALID_CAPABILITY_FORMAT");
      // Input is normalised to lowercase before validation; message contains 'uppercase'
      assert.ok(body.error.message.includes("uppercase"));
    });

    test("returns 400 for capability IDs with no dot separator", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/skills/compatible?caps=nodot",
      );

      assert.equal(status, 400);
      assert.equal(body.error.code, "INVALID_CAPABILITY_FORMAT");
    });

    test("all error responses have consistent { error: { code, message } } structure", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const scenarios = [
        "/v1/skills/compatible",
        "/v1/skills/compatible?caps=",
        "/v1/skills/compatible?caps=BAD",
        "/v1/capabilities/platform/unknown-platform",
      ];
      for (const path of scenarios) {
        const { body } = await call(worker, path);
        assert.ok(body.error, `error field present for ${path}`);
        assert.ok(body.error.code, `error.code present for ${path}`);
        assert.ok(body.error.message, `error.message present for ${path}`);
      }
    });
  });

  // ── 7. Data consistency ───────────────────────────────────────────────────────

  describe("data consistency", () => {
    test("compatible skills: required caps are always a subset of requested", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http,shell.exec",
      );

      const capSet = new Set(["network.http", "shell.exec"]);
      for (const skill of body.skills) {
        for (const req of skill.capabilities.required) {
          assert.ok(
            capSet.has(req),
            `${skill.id} requires '${req}' which is not in requested caps`,
          );
        }
      }
    });

    test("no skill appears twice in compatible list", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/skills/compatible?caps=shell.exec,git.read,network.http",
      );

      const ids = body.skills.map((s) => s.id);
      const uniqueIds = [...new Set(ids)];
      assert.equal(ids.length, uniqueIds.length, "no duplicate skills");
    });

    test("platform capability lists are mutually exclusive and exhaustive", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/capabilities/platform/claude-web",
      );

      const allCaps = [
        ...body.capabilities.supported,
        ...body.capabilities.unsupported,
        ...body.capabilities.unknown,
      ];
      const detailKeys = Object.keys(body.capability_detail);

      // Every cap in detail_keys appears in exactly one list
      for (const cap of detailKeys) {
        const count = allCaps.filter((c) => c === cap).length;
        assert.equal(count, 1, `${cap} appears in exactly one capability list`);
      }
    });

    test("compatible skills response compatible_count matches skills array length", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http",
      );

      assert.equal(body.compatible_count, body.skills.length);
    });
  });

  // ── 8. Edge cases ─────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    test("registry with no skills returns empty compatible list gracefully", async () => {
      const emptyRegistry = makeRegistry({ skills: [], skill_count: 0 });
      const worker = await loadWorkerWithFixtures(
        emptyRegistry,
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/skills/compatible?caps=network.http",
      );

      assert.equal(status, 200);
      assert.equal(body.compatible_count, 0);
      assert.deepEqual(body.skills, []);
    });

    test("registry with no platform_definitions returns platform synthesised from compat blocks", async () => {
      const noDefs = makeRegistry({ platform_definitions: undefined });
      const worker = await loadWorkerWithFixtures(
        noDefs,
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/capabilities/platform/claude-web",
      );

      // When platform_definitions absent, the index synthesises profiles from
      // skill compatibility blocks — claude-web appears in skill compat so a
      // synthetic profile exists, returned as 200 with empty capability_detail.
      assert.equal(status, 200);
      assert.equal(body.platform, "claude-web");
      assert.deepEqual(body.capability_detail, {});
      assert.deepEqual(body.capabilities.supported, []);
    });

    test("caps param with only whitespace returns 400", async () => {
      const worker = await loadWorkerWithFixtures(
        makeRegistry(),
        loadJson(PLUGIN_PATH),
      );
      const { status } = await call(
        worker,
        "/v1/skills/compatible?caps=%20,%20",
      );
      assert.equal(status, 400);
    });

    test("skill with missing compatibility block is included with empty compat", async () => {
      const registry = makeRegistry();
      // Remove compatibility from one skill
      registry.skills[0] = { ...registry.skills[0], compatibility: undefined };
      const worker = await loadWorkerWithFixtures(
        registry,
        loadJson(PLUGIN_PATH),
      );
      const { status, body } = await call(
        worker,
        "/v1/skills/compatible?caps=shell.exec,git.read",
      );

      assert.equal(status, 200);
      // Skill should still appear (compatibility field defaults to {})
      const skill = body.skills.find((s) => s.id === "git-ops");
      assert.ok(skill, "skill with missing compat still returned");
      assert.deepEqual(skill.compatibility, {});
    });
  });
});
