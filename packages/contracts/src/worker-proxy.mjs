import Ajv2020 from "ajv/dist/2020.js";

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "status", "request_id"],
  properties: {
    ok: { type: "boolean" },
    status: { type: "integer", minimum: 100, maximum: 599 },
    request_id: { type: "string", minLength: 1 },
    code: { type: "string" },
    error: { type: "string" },
    output: { type: "string" },
    truncated: { type: "boolean" },
    duration_ms: { type: "integer", minimum: 0 },
  },
  allOf: [
    {
      if: { properties: { ok: { const: true } }, required: ["ok"] },
      then: { required: ["output", "duration_ms"] },
      else: { required: ["code", "error"] },
    },
  ],
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(responseSchema);

export function validateWorkerProxyResponse(payload) {
  const valid = validate(payload);
  return {
    valid,
    errors: valid ? [] : (validate.errors ?? []),
  };
}
