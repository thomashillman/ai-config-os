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
    .replace("from '../http';", "from '../http.mjs';")
    .replace("from '../types';", "from '../types.mjs';");

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, code, "utf8");
}

async function importHandleClientPackage() {
  const tempDir = mkdtempSync(join(tmpdir(), "worker-artifacts-handler-"));

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
    handleClientPackage: module.handleClientPackage,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

test("handleClientPackage_returns_200_when_latest_package_exists", async () => {
  const { handleClientPackage, cleanup } = await importHandleClientPackage();

  try {
    const response = await handleClientPackage("claude-code", {
      MANIFEST_KV: {
        get: async (key) => {
          assert.equal(key, "claude-code-package:latest");
          return JSON.stringify({
            version: "1.2.3",
            skills: {
              debug: { "SKILL.md": "# Debug" },
            },
          });
        },
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("etag"), '"1.2.3"');
    assert.deepEqual(await response.json(), {
      version: "1.2.3",
      skills: {
        debug: { "SKILL.md": "# Debug" },
      },
    });
  } finally {
    cleanup();
  }
});

test("handleClientPackage_returns_404_when_latest_package_missing", async () => {
  const { handleClientPackage, cleanup } = await importHandleClientPackage();

  try {
    const response = await handleClientPackage("claude-code", {
      MANIFEST_KV: {
        get: async () => null,
      },
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "Not Found",
      message:
        "Skills package not found. Trigger a release build to populate KV.",
    });
  } finally {
    cleanup();
  }
});

test("handleClientPackage_returns_502_when_latest_package_json_is_invalid", async () => {
  const { handleClientPackage, cleanup } = await importHandleClientPackage();

  try {
    const response = await handleClientPackage("claude-code", {
      MANIFEST_KV: {
        get: async () => "{not-json",
      },
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: "Skills package contains invalid JSON",
    });
  } finally {
    cleanup();
  }
});

test("handleClientPackage_returns_502_when_latest_package_missing_required_fields", async () => {
  const { handleClientPackage, cleanup } = await importHandleClientPackage();

  try {
    const response = await handleClientPackage("claude-code", {
      MANIFEST_KV: {
        get: async () => JSON.stringify({ version: "1.2.3" }),
      },
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: "Skills package missing required fields (version, skills)",
    });
  } finally {
    cleanup();
  }
});
