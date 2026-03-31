import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteExecutorServer } from "./server.mjs";

const BASE_ENV = {
  sharedSecret: "test-secret",
  signaturePublicKey: "",
  requireSignature: false,
  timeoutMs: 5000,
  port: 0,
};

const FLAGS_DISABLED = () => ({
  remote_executor_enabled: false,
  outcome_resolution_enabled: false,
  effective_contract_required: false,
});

const FLAGS_ENABLED = () => ({
  remote_executor_enabled: true,
  outcome_resolution_enabled: false,
  effective_contract_required: false,
});

test("createRemoteExecutorServer throws when remote_executor_enabled=false", () => {
  assert.throws(
    () =>
      createRemoteExecutorServer({ env: BASE_ENV, readFlags: FLAGS_DISABLED }),
    /remote_executor_enabled/,
    "should throw with message mentioning remote_executor_enabled",
  );
});

test("createRemoteExecutorServer succeeds when remote_executor_enabled=true", () => {
  let server;
  assert.doesNotThrow(() => {
    server = createRemoteExecutorServer({
      env: BASE_ENV,
      readFlags: FLAGS_ENABLED,
      executeToolImpl: async () => ({ ok: true, status: 200, result: {} }),
    });
  });
  server?.close();
});

test("readFlags is called at server creation time", () => {
  let callCount = 0;
  const readFlags = () => {
    callCount += 1;
    return FLAGS_DISABLED();
  };
  assert.throws(() => createRemoteExecutorServer({ env: BASE_ENV, readFlags }));
  assert.equal(
    callCount,
    1,
    "readFlags should be called exactly once during creation",
  );
});

test("createRemoteExecutorServer behaves normally when readFlags is not provided", () => {
  // No readFlags passed — existing behavior unchanged (no flag check)
  let server;
  assert.doesNotThrow(() => {
    server = createRemoteExecutorServer({
      env: BASE_ENV,
      executeToolImpl: async () => ({ ok: true, status: 200, result: {} }),
    });
  });
  server?.close();
});
