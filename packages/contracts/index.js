import Ajv from "ajv";
import addFormats from "ajv-formats";

export const CONTRACT_VERSION = "1.0";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

export const toolInvocationPayloadSchema = {
  $id: "https://ai-config-os.dev/schemas/tool-invocation-payload.v1.json",
  type: "object",
  additionalProperties: false,
  required: ["toolName"],
  properties: {
    toolName: { type: "string", minLength: 1 },
    args: { type: "object", additionalProperties: true, default: {} },
    timeoutMs: { type: "integer", minimum: 1 },
    workingDirectory: { type: "string", minLength: 1 },
  },
};

export const signedExecutionRequestEnvelopeSchema = {
  $id: "https://ai-config-os.dev/schemas/signed-execution-request-envelope.v1.json",
  type: "object",
  additionalProperties: false,
  required: [
    "contractVersion",
    "requestId",
    "issuedAt",
    "signature",
    "payload",
  ],
  properties: {
    contractVersion: { const: CONTRACT_VERSION },
    requestId: { type: "string", minLength: 1 },
    issuedAt: { type: "string", format: "date-time" },
    signature: {
      type: "object",
      additionalProperties: false,
      required: ["algorithm", "keyId", "value"],
      properties: {
        algorithm: { type: "string", minLength: 1 },
        keyId: { type: "string", minLength: 1 },
        value: { type: "string", minLength: 1 },
      },
    },
    payload: toolInvocationPayloadSchema,
  },
};

export const executionResultSchema = {
  $id: "https://ai-config-os.dev/schemas/execution-result.v1.json",
  type: "object",
  additionalProperties: false,
  required: [
    "ok",
    "stdout",
    "stderr",
    "exitCode",
    "startedAt",
    "finishedAt",
    "durationMs",
  ],
  properties: {
    ok: { type: "boolean" },
    stdout: { type: "string" },
    stderr: { type: "string" },
    exitCode: { anyOf: [{ type: "integer" }, { type: "null" }] },
    startedAt: { type: "string", format: "date-time" },
    finishedAt: { type: "string", format: "date-time" },
    durationMs: { type: "integer", minimum: 0 },
    metadata: { type: "object", additionalProperties: true },
  },
};

export const errorResponseSchema = {
  $id: "https://ai-config-os.dev/schemas/error-response.v1.json",
  type: "object",
  additionalProperties: false,
  required: ["ok", "contractVersion", "error"],
  properties: {
    ok: { const: false },
    contractVersion: { const: CONTRACT_VERSION },
    requestId: nullableString,
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string", minLength: 1 },
        message: { type: "string", minLength: 1 },
        details: {},
      },
    },
  },
};

export const validateToolInvocationPayload = ajv.compile(
  toolInvocationPayloadSchema,
);
export const validateSignedExecutionRequestEnvelope = ajv.compile(
  signedExecutionRequestEnvelopeSchema,
);
export const validateExecutionResult = ajv.compile(executionResultSchema);
export const validateErrorResponse = ajv.compile(errorResponseSchema);

function validationError(prefix, validate) {
  const details = (validate.errors || [])
    .map((entry) => `${entry.instancePath || "/"} ${entry.message}`)
    .join("; ");
  return new Error(
    `${prefix}: ${details || "unknown schema validation error"}`,
  );
}

export function assertToolInvocationPayload(value) {
  if (!validateToolInvocationPayload(value)) {
    throw validationError(
      "Invalid tool invocation payload",
      validateToolInvocationPayload,
    );
  }
  return value;
}

export function assertSignedExecutionRequestEnvelope(value) {
  if (!validateSignedExecutionRequestEnvelope(value)) {
    throw validationError(
      "Invalid execution request envelope",
      validateSignedExecutionRequestEnvelope,
    );
  }
  return value;
}

export function assertExecutionResult(value) {
  if (!validateExecutionResult(value)) {
    throw validationError("Invalid execution result", validateExecutionResult);
  }
  return value;
}

export function assertErrorResponse(value) {
  if (!validateErrorResponse(value)) {
    throw validationError("Invalid error response", validateErrorResponse);
  }
  return value;
}

export function makeErrorResponse({
  code,
  message,
  details,
  requestId = null,
}) {
  return {
    ok: false,
    contractVersion: CONTRACT_VERSION,
    requestId,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}
