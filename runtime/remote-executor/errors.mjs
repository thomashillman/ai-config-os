export class ExecutorHttpError extends Error {
  constructor(status, code, message) {
    super(String(message || "Executor request failed"));
    this.name = "ExecutorHttpError";
    this.status = Number(status);
    this.code = String(code || "EXECUTOR_ERROR");
  }
}

export function toErrorResponse(error) {
  if (error instanceof ExecutorHttpError) {
    return {
      status: error.status,
      payload: {
        ok: false,
        status: error.status,
        error: {
          code: error.code,
          message: error.message,
        },
      },
    };
  }

  const isValidationError =
    error instanceof TypeError || error instanceof SyntaxError;
  const status = isValidationError ? 400 : 500;
  return {
    status,
    payload: {
      ok: false,
      status,
      error: {
        code: status === 400 ? "BAD_REQUEST" : "EXECUTOR_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    },
  };
}
