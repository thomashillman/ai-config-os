import test from "node:test";
import assert from "node:assert/strict";
import { ExecutorHttpError, toErrorResponse } from "./errors.mjs";

test("preserves explicit HTTP status from typed executor errors", () => {
  const error = new ExecutorHttpError(503, "EXECUTOR_ERROR", "process failed");
  const response = toErrorResponse(error);

  assert.equal(response.status, 503);
  assert.equal(response.payload.error.code, "EXECUTOR_ERROR");
});

test("maps unknown runtime errors to 500", () => {
  const response = toErrorResponse(new Error("boom"));
  assert.equal(response.status, 500);
  assert.equal(response.payload.error.code, "EXECUTOR_ERROR");
});

test("maps validation-style errors to 400", () => {
  const response = toErrorResponse(new TypeError("bad input"));
  assert.equal(response.status, 400);
  assert.equal(response.payload.error.code, "BAD_REQUEST");
});
