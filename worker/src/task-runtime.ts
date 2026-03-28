// @ts-ignore - runtime JS module
import { TaskConflictError, TaskNotFoundError, TaskStore } from '../../runtime/lib/task-store-worker.mjs';
// @ts-ignore - runtime JS module
import { KvTaskStore } from '../../runtime/lib/task-store-kv.mjs';
// @ts-ignore - runtime JS module
import { createTaskControlPlaneService } from '../../runtime/lib/task-control-plane-service-worker.mjs';
// @ts-ignore - runtime JS module
import { createHandoffTokenService } from '../../runtime/lib/handoff-token-service-worker.mjs';
import { contractErrorResponse, WORKER_CAPABILITY } from './contracts';
import type { Env } from './types';

let taskStore: TaskStore | KvTaskStore | null = null;
let taskStoreSecret: string | null = null;
let taskStoreKvRef: unknown | null = null;

const MAX_CONTINUATION_FINGERPRINTS = 5000;
const continuationFingerprints = new Map<string, string>();

function ensureTaskStore(env: Env): TaskStore | KvTaskStore {
  const secret = env.HANDOFF_TOKEN_SIGNING_KEY ?? null;
  const kv = env.MANIFEST_KV ?? null;

  // Use KV-backed store when available (durable, survives Worker instance recycling)
  if (kv) {
    if (!taskStore || kv !== taskStoreKvRef) {
      taskStore = new KvTaskStore(kv, secret ? createHandoffTokenService({ secret }) : null);
      taskStoreSecret = secret;
      taskStoreKvRef = kv;
    }
    return taskStore;
  }

  // Fallback: in-memory store for local dev (ephemeral)
  if (!taskStore || secret !== taskStoreSecret || taskStoreKvRef !== null) {
    taskStore = secret
      ? new TaskStore({ handoffTokenService: createHandoffTokenService({ secret }) })
      : new TaskStore();
    taskStoreSecret = secret;
    taskStoreKvRef = null;
  }

  return taskStore;
}

export function getContinuationFingerprint(tokenId: string): string | undefined {
  return continuationFingerprints.get(tokenId);
}

export function setContinuationFingerprint(tokenId: string, fingerprint: string): void {
  if (continuationFingerprints.has(tokenId)) {
    continuationFingerprints.set(tokenId, fingerprint);
    return;
  }

  continuationFingerprints.set(tokenId, fingerprint);

  if (continuationFingerprints.size > MAX_CONTINUATION_FINGERPRINTS) {
    const oldestTokenId = continuationFingerprints.keys().next().value;
    if (typeof oldestTokenId === 'string') {
      continuationFingerprints.delete(oldestTokenId);
    }
  }
}

export function getTaskService(env: Env) {
  return createTaskControlPlaneService({ taskStore: ensureTaskStore(env) });
}

export function taskErrorResponse(error: unknown): Response | null {
  if (error instanceof TaskNotFoundError) {
    const known = error as Error & { code?: string };
    return contractErrorResponse({
      resource: 'tasks.error',
      data: null,
      summary: known.message,
      capability: WORKER_CAPABILITY,
      error: {
        code: String(known.code ?? 'not_found'),
        message: known.message,
        hint: 'Check the task ID and try again.',
      },
    }, 404);
  }

  if (error instanceof TaskConflictError) {
    const known = error as Error & { code?: string };
    return contractErrorResponse({
      resource: 'tasks.error',
      data: null,
      summary: known.message,
      capability: WORKER_CAPABILITY,
      error: {
        code: String(known.code ?? 'version_conflict'),
        message: known.message,
        hint: 'Fetch the latest task version and retry with the updated expected_version.',
      },
    }, 409);
  }

  if (error instanceof Error) {
    const message = error.message || 'Continuation token validation failed';
    if (message.includes('Token is expired') || message.includes('already consumed')) {
      return contractErrorResponse({
        resource: 'tasks.error',
        data: null,
        summary: message,
        capability: WORKER_CAPABILITY,
        error: {
          code: 'handoff_token_forbidden',
          message,
          hint: 'Request a new handoff token.',
        },
      }, 403);
    }

    if (message.includes('Token')) {
      return contractErrorResponse({
        resource: 'tasks.error',
        data: null,
        summary: message,
        capability: WORKER_CAPABILITY,
        error: {
          code: 'handoff_token_invalid',
          message,
          hint: 'Verify the token structure and signing key.',
        },
      }, 401);
    }
  }

  return null;
}
