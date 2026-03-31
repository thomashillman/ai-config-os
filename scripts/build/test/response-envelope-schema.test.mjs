import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const CONTRACTS_DIR = resolve(REPO_ROOT, "shared/contracts");

function loadSchema(name) {
  return JSON.parse(readFileSync(resolve(CONTRACTS_DIR, name), "utf8"));
}

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

const capabilitySchema = loadSchema("capability.schema.json");
const envelopeSchema = loadSchema("response-envelope.schema.json");
const errorEnvelopeSchema = loadSchema("response-envelope-error.schema.json");

ajv.addSchema(capabilitySchema, "capability.schema.json");
ajv.addSchema(envelopeSchema, "response-envelope.schema.json");

const validateEnvelope = ajv.compile(envelopeSchema);
const validateErrorEnvelope = ajv.compile(errorEnvelopeSchema);
const validateCapability = ajv.compile(capabilitySchema);

const WORKER_CAPABILITY = {
  worker_backed: true,
  local_only: false,
  remote_safe: true,
  tunnel_required: false,
  unavailable_on_surface: false,
};

const LOCAL_CAPABILITY = {
  worker_backed: false,
  local_only: true,
  remote_safe: false,
  tunnel_required: false,
  unavailable_on_surface: false,
};

// Import the JS envelope factory
const { createSuccessEnvelope, createErrorEnvelope } = await import(
  new URL("../../../runtime/lib/contracts/envelope.mjs", import.meta.url).href
);

test("capability schema: worker capability is valid", () => {
  const valid = validateCapability(WORKER_CAPABILITY);
  assert.ok(valid, JSON.stringify(validateCapability.errors));
});

test("capability schema: local-only capability is valid", () => {
  const valid = validateCapability(LOCAL_CAPABILITY);
  assert.ok(valid, JSON.stringify(validateCapability.errors));
});

test("capability schema: rejects missing fields", () => {
  const valid = validateCapability({ worker_backed: true });
  assert.equal(valid, false);
});

test("capability schema: rejects extra fields", () => {
  const valid = validateCapability({ ...WORKER_CAPABILITY, extra_field: true });
  assert.equal(valid, false);
});

test("success envelope: factory output passes schema", () => {
  const envelope = createSuccessEnvelope({
    resource: "tasks.list",
    data: { tasks: [] },
    summary: "0 tasks.",
    capability: WORKER_CAPABILITY,
  });
  const valid = validateEnvelope(envelope);
  assert.ok(valid, JSON.stringify(validateEnvelope.errors));
});

test("success envelope: resource name pattern is enforced", () => {
  const valid = validateEnvelope({
    contract_version: "1.0.0",
    resource: "Tasks.List", // uppercase — invalid
    data: {},
    summary: "test",
    capability: WORKER_CAPABILITY,
    suggested_actions: [],
  });
  assert.equal(valid, false);
});

test("success envelope: rejects missing required fields", () => {
  const valid = validateEnvelope({
    contract_version: "1.0.0",
    resource: "tasks.list",
    // data missing
    summary: "test",
    capability: WORKER_CAPABILITY,
    suggested_actions: [],
  });
  assert.equal(valid, false);
});

test("success envelope: suggested_actions items must have all required fields", () => {
  const valid = validateEnvelope({
    contract_version: "1.0.0",
    resource: "tasks.list",
    data: null,
    summary: "test",
    capability: WORKER_CAPABILITY,
    suggested_actions: [{ id: "foo" }], // missing label/reason/runnable_target
  });
  assert.equal(valid, false);
});

test("error envelope: factory output passes error schema", () => {
  const envelope = createErrorEnvelope({
    resource: "tasks.error",
    data: null,
    summary: "Task not found.",
    capability: WORKER_CAPABILITY,
    error: {
      code: "not_found",
      message: "No task with that id.",
      hint: "Check the task ID and try again.",
    },
  });
  const valid = validateErrorEnvelope(envelope);
  assert.ok(valid, JSON.stringify(validateErrorEnvelope.errors));
});

test("error envelope: error code must be snake_case", () => {
  const valid = validateErrorEnvelope({
    contract_version: "1.0.0",
    resource: "tasks.error",
    data: null,
    summary: "Failed.",
    capability: WORKER_CAPABILITY,
    suggested_actions: [],
    error: {
      code: "NotFound", // camelCase — invalid
      message: "Not found.",
      hint: "Try again.",
    },
  });
  assert.equal(valid, false);
});

test("error envelope: requires error.hint field", () => {
  const valid = validateErrorEnvelope({
    contract_version: "1.0.0",
    resource: "tasks.error",
    data: null,
    summary: "Failed.",
    capability: WORKER_CAPABILITY,
    suggested_actions: [],
    error: {
      code: "not_found",
      message: "Not found.",
      // hint missing
    },
  });
  assert.equal(valid, false);
});

test("error envelope: rejects absence of error field", () => {
  const valid = validateErrorEnvelope({
    contract_version: "1.0.0",
    resource: "tasks.list",
    data: { tasks: [] },
    summary: "0 tasks.",
    capability: WORKER_CAPABILITY,
    suggested_actions: [],
    // no error field
  });
  assert.equal(valid, false);
});
