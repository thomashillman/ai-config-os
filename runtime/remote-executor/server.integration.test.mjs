import test from "node:test";
import assert from "node:assert/strict";
import { ExecutorHttpError } from "./errors.mjs";
import { createRemoteExecutorServer } from "./server.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

test("remote executor handler works end-to-end over HTTP", async () => {
  const env = {
    sharedSecret: "top-secret",
    signaturePublicKey: "",
    requireSignature: false,
    timeoutMs: 5000,
    port: 0,
  };

  const server = createRemoteExecutorServer({
    env,
    executeToolImpl: async (body) => {
      if (body.tool === "validate_all") {
        throw new ExecutorHttpError(
          500,
          "EXECUTOR_ERROR",
          "simulated runtime failure",
        );
      }
      return {
        ok: true,
        status: 200,
        result: {
          tool: body.tool,
          data: {
            "tooling.sync": {
              dry_run: true,
              steps: {},
              warning_count: 0,
              error_count: 0,
            },
          },
          schema_ids: ["tooling.sync"],
          capability: { local_only: false, worker_backed: true },
          diagnostics: { raw_output: `ran ${body.tool}` },
          stderr: "",
        },
      };
    },
  });

  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const unauthorized = await fetch(`${baseUrl}/v1/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "sync_tools" }),
    });
    assert.equal(unauthorized.status, 401);

    const badPayload = await fetch(`${baseUrl}/v1/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-executor-shared-secret": "top-secret",
      },
      body: '{"tool":',
    });
    assert.equal(badPayload.status, 400);
    const badPayloadJson = await badPayload.json();
    assert.equal(badPayloadJson.error.code, "BAD_REQUEST");

    const runtimeFailure = await fetch(`${baseUrl}/v1/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-executor-shared-secret": "top-secret",
      },
      body: JSON.stringify({ tool: "validate_all" }),
    });
    assert.equal(runtimeFailure.status, 500);
    const runtimeFailureJson = await runtimeFailure.json();
    assert.equal(runtimeFailureJson.error.code, "EXECUTOR_ERROR");

    const success = await fetch(`${baseUrl}/v1/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-executor-shared-secret": "top-secret",
      },
      body: JSON.stringify({
        request_id: "abc",
        tool: "sync_tools",
        args: ["--dry-run"],
      }),
    });
    assert.equal(success.status, 200);
    const successJson = await success.json();
    assert.equal(successJson.ok, true);
    assert.equal(successJson.result.schema_ids[0], "tooling.sync");
    assert.equal(successJson.request_id, "abc");

    const health = await fetch(`${baseUrl}/v1/health`);
    assert.equal(health.status, 200);
  } finally {
    await closeServer(server);
  }
});
