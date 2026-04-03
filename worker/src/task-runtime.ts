// @ts-expect-error - runtime JS module (no .d.ts)
// prettier-ignore
import { TaskConflictError, TaskNotFoundError, TaskStore } from "../../runtime/lib/task-store-worker.mjs";
// @ts-expect-error - runtime JS module (no .d.ts)
import { KvTaskStore } from "../../runtime/lib/task-store-kv.mjs";
// @ts-expect-error - runtime JS module (no .d.ts)
import { createTaskControlPlaneService } from "../../runtime/lib/task-control-plane-service-worker.mjs";
// @ts-expect-error - runtime JS module (no .d.ts)
import { createHandoffTokenService } from "../../runtime/lib/handoff-token-service-worker.mjs";
import { DualWriteTaskStore } from "./dual-write-task-store";
import { contractErrorResponse, WORKER_CAPABILITY } from "./contracts";
import type { Env } from "./types";

let taskStore: TaskStore | KvTaskStore | DualWriteTaskStore | null = null;
let taskStoreSecret: string | null = null;
let taskStoreKvRef: unknown | null = null;
let taskStoreDualWriteEnabled = false;

const MAX_CONTINUATION_FINGERPRINTS = 5000;
const continuationFingerprints = new Map<string, string>();

function ensureTaskStore(
  env: Env,
): TaskStore | KvTaskStore | DualWriteTaskStore {
  const secret = env.HANDOFF_TOKEN_SIGNING_KEY ?? null;
  const kv = env.MANIFEST_KV ?? null;
  const dualWriteRequested = env.TASK_DO_DUAL_WRITE === "true";

  // Use KV-backed store when available (durable, survives Worker instance recycling)
  if (kv) {
    const needsRebuild =
      !taskStore ||
      kv !== taskStoreKvRef ||
      dualWriteRequested !== taskStoreDualWriteEnabled;
    if (needsRebuild) {
      const kvStore = new KvTaskStore(
        kv,
        secret ? createHandoffTokenService({ secret }) : null,
      );

      if (dualWriteRequested && env.TASK_OBJECT) {
        taskStore = new DualWriteTaskStore(kvStore, env.TASK_OBJECT);
        taskStoreDualWriteEnabled = true;
      } else {
        if (dualWriteRequested && !env.TASK_OBJECT) {
          console.warn(
            '[TaskRuntime] TASK_DO_DUAL_WRITE is "true" but TASK_OBJECT binding is missing. Falling back to KV-only.',
          );
        }
        taskStore = kvStore;
        taskStoreDualWriteEnabled = false;
      }

      taskStoreSecret = secret;
      taskStoreKvRef = kv;
    }
    return taskStore!;
  }

  // Fallback: in-memory store for local dev (ephemeral)
  if (!taskStore || secret !== taskStoreSecret || taskStoreKvRef !== null) {
    taskStore = secret
      ? new TaskStore({
          handoffTokenService: createHandoffTokenService({ secret }),
        })
      : new TaskStore();
    taskStoreSecret = secret;
    taskStoreKvRef = null;
    taskStoreDualWriteEnabled = false;
  }

  return taskStore;
}

export function getContinuationFingerprint(
  tokenId: string,
): string | undefined {
  return continuationFingerprints.get(tokenId);
}

export function setContinuationFingerprint(
  tokenId: string,
  fingerprint: string,
): void {
  if (continuationFingerprints.has(tokenId)) {
    continuationFingerprints.set(tokenId, fingerprint);
    return;
  }

  continuationFingerprints.set(tokenId, fingerprint);

  if (continuationFingerprints.size > MAX_CONTINUATION_FINGERPRINTS) {
    const oldestTokenId = continuationFingerprints.keys().next().value;
    if (typeof oldestTokenId === "string") {
      continuationFingerprints.delete(oldestTokenId);
    }
  }
}

export function getTaskService(env: Env) {
  return createTaskControlPlaneService({ taskStore: ensureTaskStore(env) });
}

/**
 * Get the underlying task store directly (for mutation context resolution)
 * Allows looki ng up current task state for boundary validation
 */
export function getTaskStore(env: Env): TaskStore | KvTaskStore | DualWriteTaskStore {
  return ensureTaskStore(env);
}

export function taskErrorResponse(error: unknown): Response | null {
  if (error instanceof TaskNotFoundError) {
    const known = error as Error & { code?: string };
    return contractErrorResponse(
      {
        resource: "tasks.error",
        data: null,
        summary: known.message,
        capability: WORKER_CAPABILITY,
        error: {
          code: String(known.code ?? "not_found"),
          message: known.message,
          hint: "Check the task ID and try again.",
        },
      },
      404,
    );
  }

  if (error instanceof TaskConflictError) {
    const known = error as Error & { code?: string };
    return contractErrorResponse(
      {
        resource: "tasks.error",
        data: null,
        summary: known.message,
        capability: WORKER_CAPABILITY,
        error: {
          code: String(known.code ?? "version_conflict"),
          message: known.message,
          hint: "Fetch the latest task version and retry with the updated expected_version.",
        },
      },
      409,
    );
  }

  if (error instanceof Error) {
    const message = error.message || "Continuation token validation failed";
    if (
      message.includes("Token is expired") ||
      message.includes("already consumed")
    ) {
      return contractErrorResponse(
        {
          resource: "tasks.error",
          data: null,
          summary: message,
          capability: WORKER_CAPABILITY,
          error: {
            code: "handoff_token_forbidden",
            message,
            hint: "Request a new handoff token.",
          },
        },
        403,
      );
    }

    if (message.includes("Token")) {
      return contractErrorResponse(
        {
          resource: "tasks.error",
          data: null,
          summary: message,
          capability: WORKER_CAPABILITY,
          error: {
            code: "handoff_token_invalid",
            message,
            hint: "Verify the token structure and signing key.",
          },
        },
        401,
      );
    }
  }

  return null;
}
