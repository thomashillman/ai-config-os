import test from "node:test";
import assert from "node:assert/strict";
import { toToolResponse, toolError } from "./tool-response.mjs";

function readStructured(response) {
  assert.equal(typeof response, "object");
  assert.equal(Array.isArray(response.content), true);
  assert.equal(response.content.length > 0, true);
  return response.structuredContent;
}

test("successful runtime response always includes required envelope fields with local route locality", () => {
  const response = toToolResponse({
    success: true,
    output: "Tool manifest loaded.",
  });
  const envelope = readStructured(response);

  assert.equal(envelope.status, "Full");
  assert.equal(envelope.selectedRoute, "local-runtime-script");
  assert.equal(typeof envelope.output, "string");
  assert.equal(envelope.output.length > 0, true);
  assert.equal(envelope.output.length <= 160, true);
});

test("degraded runtime response provides deterministic error shape and suggested actions", () => {
  const response = toolError("Threshold must be numeric");
  const envelope = readStructured(response);

  assert.equal(response.isError, true);
  assert.equal(envelope.status, "Degraded");
  assert.equal(envelope.selectedRoute, "manual-input-correction");
  assert.deepEqual(envelope.missingCapabilities, ["valid-tool-input"]);
  assert.equal(Array.isArray(envelope.requiredUserInput), true);
  assert.equal(envelope.requiredUserInput.length > 0, true);
  assert.equal(typeof envelope.guidanceEquivalentRoute, "string");
  assert.equal(
    typeof envelope.guidanceFullWorkflowHigherCapabilityEnvironment,
    "string",
  );
  assert.equal(typeof envelope.output, "string");
  assert.equal(envelope.output.length > 0, true);
  assert.equal(envelope.output.length <= 160, true);
});

test("legacy envelope path keeps plain payloads backward compatible for older clients", () => {
  const response = toToolResponse({
    success: false,
    error: "sync failed",
    output: "permission denied",
  });
  const envelope = readStructured(response);

  assert.equal(response.isError, true);
  assert.equal(typeof envelope.output, "string");
  assert.match(envelope.output, /sync failed/);
  assert.match(envelope.output, /permission denied/);
});
