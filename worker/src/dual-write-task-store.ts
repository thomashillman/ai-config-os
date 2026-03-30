/**
 * DualWriteTaskStore -- Adapter that wraps KvTaskStore (primary) and
 * replicates mutations to a Durable Object (secondary, fire-and-forget).
 *
 * PR1: Reads are KV-only. DO writes are non-blocking and failure-tolerant.
 * KV failure is fatal (propagates). DO failure is logged and swallowed.
 *
 * DO write failures are emitted as structured JSON logs with metrics for alerting.
 */

// @ts-ignore - runtime JS module
import type { KvTaskStore } from '../../runtime/lib/task-store-kv.mjs';

const DO_BASE_URL = 'https://task-object';

interface DoWriteError {
  timestamp: string;
  level: 'warn';
  component: 'DualWrite';
  event: 'do_replication_failed' | 'do_stub_creation_failed';
  task_id: string;
  error_message: string;
  error_code: string;
  operation?: string;
}

function categorizeError(err: unknown): string {
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    if (msg.includes('timeout')) return 'DO_TIMEOUT';
    if (msg.includes('network')) return 'DO_NETWORK_ERROR';
    if (msg.includes('fetch')) return 'DO_FETCH_ERROR';
  }
  if (err instanceof Error && err.message.includes('TASK_OBJECT')) {
    return 'DO_BINDING_MISSING';
  }
  return 'DO_UNKNOWN_ERROR';
}

export class DualWriteTaskStore {
  private kvStore: KvTaskStore;
  private doNamespace: DurableObjectNamespace;

  constructor(kvStore: KvTaskStore, doNamespace: DurableObjectNamespace) {
    this.kvStore = kvStore;
    this.doNamespace = doNamespace;
  }

  // ---- Read-only methods: delegate to KV only ----

  async load(taskId: string) {
    return this.kvStore.load(taskId);
  }

  async loadByCode(shortCode: string) {
    return this.kvStore.loadByCode(shortCode);
  }

  async loadByName(nameOrSlug: string) {
    return this.kvStore.loadByName(nameOrSlug);
  }

  async listProgressEvents(taskId: string) {
    return this.kvStore.listProgressEvents(taskId);
  }

  async getReadinessView(taskId: string) {
    return this.kvStore.getReadinessView(taskId);
  }

  async listSnapshots(taskId: string) {
    return this.kvStore.listSnapshots(taskId);
  }

  async getSnapshot(taskId: string, version: number) {
    return this.kvStore.getSnapshot(taskId, version);
  }

  async listRecentTasks(options?: { status?: string; limit?: number; updatedWithinSeconds?: number }) {
    return this.kvStore.listRecentTasks(options);
  }

  async getLatestActiveTask() {
    return this.kvStore.getLatestActiveTask();
  }

  async getCheckpointLog(taskId: string) {
    return this.kvStore.getCheckpointLog(taskId);
  }

  // ---- Mutation methods: KV first (primary), then DO (secondary, fire-and-forget) ----

  async create(task: Record<string, unknown>) {
    const result = await this.kvStore.create(task);
    this._replicateToDo(String(result.task_id), result);
    return result;
  }

  async update(taskId: string, payload: { expectedVersion: number; changes: Record<string, unknown> }) {
    const result = await this.kvStore.update(taskId, payload);
    this._replicateToDo(taskId, result);
    return result;
  }

  async transitionState(taskId: string, payload: {
    expectedVersion: number;
    nextState: string;
    nextAction: string;
    updatedAt: string;
    progress?: { completed_steps: number; total_steps: number };
  }) {
    const result = await this.kvStore.transitionState(taskId, payload);
    this._replicateToDo(taskId, result);
    return result;
  }

  async appendFinding(taskId: string, payload: {
    expectedVersion: number;
    finding: Record<string, unknown>;
    updatedAt: string;
  }) {
    const result = await this.kvStore.appendFinding(taskId, payload);
    this._replicateToDo(taskId, result);
    return result;
  }

  async transitionFindingsForRouteUpgrade(taskId: string, payload: {
    expectedVersion: number;
    toRouteId: string;
    upgradedAt: string;
    toEquivalenceLevel: string;
  }) {
    const result = await this.kvStore.transitionFindingsForRouteUpgrade(taskId, payload);
    this._replicateToDo(taskId, result);
    return result;
  }

  async selectRoute(taskId: string, payload: {
    routeId: string;
    expectedVersion: number;
    selectedAt: string;
  }) {
    const result = await this.kvStore.selectRoute(taskId, payload);
    this._replicateToDo(taskId, result);
    return result;
  }

  async createContinuationPackage(taskId: string, payload: {
    handoffToken: Record<string, unknown>;
    effectiveExecutionContract: Record<string, unknown>;
    createdAt?: string;
  }) {
    const result = await this.kvStore.createContinuationPackage(taskId, payload);
    // Continuation packages contain the full task; replicate the embedded task state
    const embeddedTask = result?.task;
    if (embeddedTask && typeof embeddedTask === 'object') {
      this._replicateToDo(taskId, embeddedTask as Record<string, unknown>);
    }
    return result;
  }

  // ---- DO replication (fire-and-forget) ----

  private _emitStructuredLog(error: DoWriteError): void {
    console.warn(JSON.stringify(error));
  }

  private _emitMetric(taskId: string, event: 'do_replication_failed' | 'do_stub_creation_failed', errorCode: string): void {
    const metric = {
      event,
      task_id: taskId,
      error_code: errorCode,
      timestamp: new Date().toISOString(),
    };
    console.warn(`[DualWrite:metric] ${JSON.stringify(metric)}`);
  }

  private _replicateToDo(taskId: string, taskState: Record<string, unknown>): void {
    try {
      const id = this.doNamespace.idFromName(taskId);
      const stub = this.doNamespace.get(id);
      stub.fetch(`${DO_BASE_URL}/put-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: taskState }),
      }).catch((err: unknown) => {
        const errorCode = categorizeError(err);
        const message = err instanceof Error ? err.message : String(err);
        const timestamp = new Date().toISOString();

        const errorLog: DoWriteError = {
          timestamp,
          level: 'warn',
          component: 'DualWrite',
          event: 'do_replication_failed',
          task_id: taskId,
          error_message: message,
          error_code: errorCode,
          operation: 'put-state',
        };

        this._emitStructuredLog(errorLog);
        this._emitMetric(taskId, 'do_replication_failed', errorCode);
      });
    } catch (err) {
      const errorCode = categorizeError(err);
      const message = err instanceof Error ? err.message : String(err);
      const timestamp = new Date().toISOString();

      const errorLog: DoWriteError = {
        timestamp,
        level: 'warn',
        component: 'DualWrite',
        event: 'do_stub_creation_failed',
        task_id: taskId,
        error_message: message,
        error_code: errorCode,
      };

      this._emitStructuredLog(errorLog);
      this._emitMetric(taskId, 'do_stub_creation_failed', errorCode);
    }
  }
}
