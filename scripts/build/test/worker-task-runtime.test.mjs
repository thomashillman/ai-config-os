import { test } from "node:test";
import assert from "node:assert/strict";

const mod = await import("../../../worker/src/task-runtime.ts").catch(
  async () => {
    const ts = await import("typescript");
    const { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } =
      await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { fileURLToPath, pathToFileURL } = await import("node:url");

    const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
    const sourcePath = join(repoRoot, "worker/src/task-runtime.ts");
    let src = readFileSync(sourcePath, "utf8");

    src = src
      .replace(
        // Keep in sync with worker/src/task-runtime.ts (see @ts-expect-error + prettier-ignore on first import)
        /(?:\/\/ @ts-expect-error[^\n]*\n)(?:\/\/ prettier-ignore\s*\n)?import\s*\{\s*TaskConflictError,\s*TaskNotFoundError,\s*TaskStore,?\s*\}\s*from\s*["']\.\.\/\.\.\/runtime\/lib\/task-store-worker\.mjs["'];/s,
        `import { TaskConflictError, TaskNotFoundError, TaskStore } from '${new URL("../../../runtime/lib/task-store-worker.mjs", import.meta.url).href}';`,
      )
      .replace(
        /import\s*\{\s*KvTaskStore\s*\}\s*from\s*["']\.\.\/\.\.\/runtime\/lib\/task-store-kv\.mjs["'];/,
        `import { KvTaskStore } from '${new URL("../../../runtime/lib/task-store-kv.mjs", import.meta.url).href}';`,
      )
      .replace(
        /import\s*\{\s*createTaskControlPlaneService\s*\}\s*from\s*["']\.\.\/\.\.\/runtime\/lib\/task-control-plane-service-worker\.mjs["'];/,
        `import { createTaskControlPlaneService } from '${new URL("../../../runtime/lib/task-control-plane-service-worker.mjs", import.meta.url).href}';`,
      )
      .replace(
        /import\s*\{\s*createHandoffTokenService\s*\}\s*from\s*["']\.\.\/\.\.\/runtime\/lib\/handoff-token-service-worker\.mjs["'];/,
        `import { createHandoffTokenService } from '${new URL("../../../runtime/lib/handoff-token-service-worker.mjs", import.meta.url).href}';`,
      )
      .replace(
        /import\s*\{\s*jsonResponse\s*\}\s*from\s*["']\.\/http["'];/,
        "const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });",
      )
      .replace(
        /import\s*\{\s*contractErrorResponse,\s*WORKER_CAPABILITY\s*\}\s*from\s*["']\.\/contracts["'];/,
        `
const WORKER_CAPABILITY = { worker_backed: true, local_only: false, remote_safe: true, tunnel_required: false, unavailable_on_surface: false };
function contractErrorResponse({ resource, data, summary, capability, error }, status = 500) {
  return new Response(JSON.stringify({ contract_version: '1.0.0', resource: resource ?? 'tasks.error', data: data ?? null, summary: summary ?? '', capability, suggested_actions: [], error }), { status, headers: { 'Content-Type': 'application/json' } });
}`,
      )
      .replace(
        /import\s*\{\s*DualWriteTaskStore\s*\}\s*from\s*["']\.\/dual-write-task-store["'];\s*\n/,
        "class DualWriteTaskStore { constructor(kv, ns) { this.kv = kv; this.ns = ns; } }\n",
      )
      .replace(
        /import\s+type\s+\{\s*Env\s*\}\s*from\s*["']\.\/types["'];\s*\n/,
        "",
      );

    const out = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const temp = mkdtempSync(join(tmpdir(), "worker-task-runtime-"));
    writeFileSync(
      join(temp, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    mkdirSync(join(temp, "src"), { recursive: true });
    writeFileSync(join(temp, "src", "task-runtime.js"), out);
    const loaded = await import(
      pathToFileURL(join(temp, "src", "task-runtime.js")).href
    );
    rmSync(temp, { recursive: true, force: true });
    return loaded;
  },
);

const { setContinuationFingerprint, getContinuationFingerprint } = mod;

test("setContinuationFingerprint enforces bounded cache size by evicting oldest entries", () => {
  for (let i = 0; i < 5005; i += 1) {
    setContinuationFingerprint(`token_${i}`, `fp_${i}`);
  }

  assert.equal(getContinuationFingerprint("token_0"), undefined);
  assert.equal(getContinuationFingerprint("token_1"), undefined);
  assert.equal(getContinuationFingerprint("token_5"), "fp_5");
  assert.equal(getContinuationFingerprint("token_5004"), "fp_5004");
});

test("setContinuationFingerprint updates existing entry in place", () => {
  setContinuationFingerprint("token_mutable", "v1");
  setContinuationFingerprint("token_mutable", "v2");
  assert.equal(getContinuationFingerprint("token_mutable"), "v2");
});
