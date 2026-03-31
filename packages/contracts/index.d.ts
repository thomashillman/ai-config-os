export const CONTRACT_VERSION: "1.0";

export interface ToolInvocationPayload {
  toolName: string;
  args?: Record<string, unknown>;
  timeoutMs?: number;
  workingDirectory?: string;
}

export interface SignedExecutionRequestEnvelope {
  contractVersion: typeof CONTRACT_VERSION;
  requestId: string;
  issuedAt: string;
  signature: {
    algorithm: string;
    keyId: string;
    value: string;
  };
  payload: ToolInvocationPayload;
}

export interface ExecutionResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface ErrorResponse {
  ok: false;
  contractVersion: typeof CONTRACT_VERSION;
  requestId?: string | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const toolInvocationPayloadSchema: Record<string, unknown>;
export const signedExecutionRequestEnvelopeSchema: Record<string, unknown>;
export const executionResultSchema: Record<string, unknown>;
export const errorResponseSchema: Record<string, unknown>;

export function validateToolInvocationPayload(
  value: unknown,
): value is ToolInvocationPayload;
export function validateSignedExecutionRequestEnvelope(
  value: unknown,
): value is SignedExecutionRequestEnvelope;
export function validateExecutionResult(
  value: unknown,
): value is ExecutionResult;
export function validateErrorResponse(value: unknown): value is ErrorResponse;

export function assertToolInvocationPayload(
  value: unknown,
): ToolInvocationPayload;
export function assertSignedExecutionRequestEnvelope(
  value: unknown,
): SignedExecutionRequestEnvelope;
export function assertExecutionResult(value: unknown): ExecutionResult;
export function assertErrorResponse(value: unknown): ErrorResponse;

export function makeErrorResponse(input: {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string | null;
}): ErrorResponse;
