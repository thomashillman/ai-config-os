// @ts-expect-error - runtime JS module (no .d.ts)
import type { KvTaskStore } from "../../runtime/lib/task-store-kv.mjs";
import type { TaskCommand, ActionCommit } from "./task-command";
import { computeTaskProjectionMetrics } from "./task-projection-integration";
import {
  computeProjectionLag,
  planProjectionRepair,
  validateRepairPlan,
} from "./task-projection-reconcile";

const DO_BASE_URL = "https://task-object";

export type TaskCommandStoreMode = "shadow" | "authoritative";

interface DoWriteError {
  timestamp: string;
  level: "warn";
  component: "DualWrite";
  event: "do_replication_failed" | "do_stub_creation_failed";
  task_id: string;
  error_message: string;
  error_code: string;
  operation?: string;
}

export interface MutationReceipt {
  action_id: string;
  task_id: string;
  resulting_task_version: number;
  replayed: boolean;
  projection_status: "applied" | "pending";
}

interface ApplyCommandDoResponse {
  ok: boolean;
  action_id: string;
  task_id: string;
  resulting_task_version: number;
  replayed: boolean;
  projection_status?: string;
  task_state_after?: Record<string, unknown> | null;
  error?: string;
  message?: string;
}

function categorizeError(err: unknown): string {
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    if (msg.includes("timeout")) return "DO_TIMEOUT";
    if (msg.includes("network")) return "DO_NETWORK_ERROR";
    if (msg.includes("fetch")) return "DO_FETCH_ERROR";
  }
  if (err instanceof Error && err.message.includes("TASK_OBJECT")) {
    return "DO_BINDING_MISSING";
  }
  return "DO_UNKNOWN_ERROR";
}

export class DualWriteTaskStore {
  private kvStore: KvTaskStore;
  private doNamespace: DurableObjectNamespace;
  private mode: TaskCommandStoreMode;

  constructor(
    kvStore: KvTaskStore,
    doNamespace: DurableObjectNamespace,
    mode: TaskCommandStoreMode = "shadow",
  ) {
    this.kvStore = kvStore;
    this.doNamespace = doNamespace;
    this.mode = mode;
  }

  private isAuthoritativeCommand(commandEnvelope?: TaskCommand): boolean {
    return (
      this.mode === "authoritative" &&
      !!commandEnvelope &&
      (commandEnvelope.command_type === "task.select_route" ||
        commandEnvelope.command_type === "task.transition_state" ||
        commandEnvelope.command_type === "task.append_finding")
    );
  }

  private getStub(taskId: string): DurableObjectStub {
    const id = this.doNamespace.idFromName(taskId);
    return this.doNamespace.get(id);
  }

  private async fetchDoJson<T>(
    taskId: string,
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const stub = this.getStub(taskId);
    const response = await stub.fetch(`${DO_BASE_URL}${path}`, init);
    const body = (await response.json()) as T & {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      const detail =
        typeof body.message === "string"
          ? body.message
          : typeof body.error === "string"
            ? body.error
            : `TaskObject request failed with status ${response.status}`;
      throw new Error(detail);
    }
    return body;
  }

  private _emitStructuredLog(error: DoWriteError): void {
    console.warn(JSON.stringify(error));
  }

  private _emitMetric(
    taskId: string,
    event: "do_replication_failed" | "do_stub_creation_failed",
    errorCode: string,
  ): void {
    const metric = {
      event,
      task_id: taskId,
      error_code: errorCode,
      timestamp: new Date().toISOString(),
    };
    console.warn(`[DualWrite:metric] ${JSON.stringify(metric)}`);
  }

  private async applyAuthoritativeCommand(
    taskId: string,
    command: TaskCommand,
    kvProjectionWrite: () => Promise<unknown>,
  ): Promise<MutationReceipt> {
    const authoritative = await this.fetchDoJson<ApplyCommandDoResponse>(
      taskId,
      "/apply-command",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      },
    );

    let projectionStatus: MutationReceipt["projection_status"] = "applied";
    try {
      await kvProjectionWrite();
    } catch (error) {
      projectionStatus = "pending";
      const errorCode = categorizeError(error);
      this._emitStructuredLog({
        timestamp: new Date().toISOString(),
        level: "warn",
        component: "DualWrite",
        event: "do_replication_failed",
        task_id: taskId,
        error_message:
          error instanceof Error ? error.message : "Projection write failed",
        error_code: errorCode,
        operation: "projection-write",
      });
      this._emitMetric(taskId, "do_replication_failed", errorCode);
    }

    return {
      action_id: authoritative.action_id,
      task_id: authoritative.task_id,
      resulting_task_version: authoritative.resulting_task_version,
      replayed: authoritative.replayed,
      projection_status: projectionStatus,
    };
  }

  private async fetchAuthoritativeCommits(
    taskId: string,
  ): Promise<ActionCommit[]> {
    try {
      const body = await this.fetchDoJson<{ commits?: ActionCommit[] }>(
        taskId,
        "/commits",
      );
      return Array.isArray(body.commits) ? body.commits : [];
    } catch {
      return [];
    }
  }

  async load(taskId: string) {
    const task = (await this.kvStore.load(taskId)) as Record<string, unknown>;
    const commits = await this.fetchAuthoritativeCommits(taskId);
    if (commits.length === 0) {
      return task;
    }

    const metrics = computeTaskProjectionMetrics(
      task,
      typeof task.version === "number" ? task.version : null,
      commits,
    );

    return {
      ...task,
      projection: {
        authoritative_version: metrics.authoritative_version,
        projected_version: metrics.projected_version,
        projection_lag: metrics.projection_lag,
        divergence: metrics.divergence,
      },
    };
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

  async listRecentTasks(options?: {
    status?: string;
    limit?: number;
    updatedWithinSeconds?: number;
  }) {
    return this.kvStore.listRecentTasks(options);
  }

  async getLatestActiveTask() {
    return this.kvStore.getLatestActiveTask();
  }

  async getCheckpointLog(taskId: string) {
    return this.kvStore.getCheckpointLog(taskId);
  }

  async create(task: Record<string, unknown>) {
    const result = await this.kvStore.create(task);
    this._replicateToDo(String(result.task_id), result);
    return result;
  }

  async update(
    taskId: string,
    payload: { expectedVersion: number; changes: Record<string, unknown> },
  ) {
    const result = await this.kvStore.update(taskId, payload);
    this._replicateToDo(taskId, result);
    return result;
  }

  async transitionState(
    taskId: string,
    payload: {
      expectedVersion: number;
      nextState: string;
      nextAction: string;
      updatedAt: string;
      progress?: { completed_steps: number; total_steps: number };
    },
    commandEnvelope?: TaskCommand,
  ) {
    if (this.isAuthoritativeCommand(commandEnvelope)) {
      return this.applyAuthoritativeCommand(taskId, commandEnvelope!, () =>
        this.kvStore.transitionState(taskId, payload),
      );
    }

    const result = await this.kvStore.transitionState(taskId, payload);
    this._replicateToDo(taskId, result);
    if (commandEnvelope) this._applyCommandToDo(taskId, commandEnvelope);
    return result;
  }

  async appendFinding(
    taskId: string,
    payload: {
      expectedVersion: number;
      finding: Record<string, unknown>;
      updatedAt: string;
    },
    commandEnvelope?: TaskCommand,
  ) {
    if (this.isAuthoritativeCommand(commandEnvelope)) {
      return this.applyAuthoritativeCommand(taskId, commandEnvelope!, () =>
        this.kvStore.appendFinding(taskId, payload),
      );
    }

    const result = await this.kvStore.appendFinding(taskId, payload);
    this._replicateToDo(taskId, result);
    if (commandEnvelope) this._applyCommandToDo(taskId, commandEnvelope);
    return result;
  }

  async transitionFindingsForRouteUpgrade(
    taskId: string,
    payload: {
      expectedVersion: number;
      toRouteId: string;
      upgradedAt: string;
      toEquivalenceLevel: string;
    },
  ) {
    const result = await this.kvStore.transitionFindingsForRouteUpgrade(
      taskId,
      payload,
    );
    this._replicateToDo(taskId, result);
    return result;
  }

  async selectRoute(
    taskId: string,
    payload: {
      routeId: string;
      expectedVersion: number;
      selectedAt: string;
    },
    commandEnvelope?: TaskCommand,
  ) {
    if (this.isAuthoritativeCommand(commandEnvelope)) {
      return this.applyAuthoritativeCommand(taskId, commandEnvelope!, () =>
        this.kvStore.selectRoute(taskId, payload),
      );
    }

    const result = await this.kvStore.selectRoute(taskId, payload);
    this._replicateToDo(taskId, result);
    if (commandEnvelope) this._applyCommandToDo(taskId, commandEnvelope);
    return result;
  }

  async createContinuationPackage(
    taskId: string,
    payload: {
      handoffToken: Record<string, unknown>;
      effectiveExecutionContract: Record<string, unknown>;
      createdAt?: string;
    },
  ) {
    const result = await this.kvStore.createContinuationPackage(
      taskId,
      payload,
    );
    const embeddedTask = result?.task;
    if (embeddedTask && typeof embeddedTask === "object") {
      this._replicateToDo(taskId, embeddedTask as Record<string, unknown>);
    }
    return result;
  }

  async repairProjection(taskId: string): Promise<{
    repaired: boolean;
    projected_version: number;
    authoritative_version: number;
    commits_replayed: number;
  }> {
    const [projectedTask, commits] = await Promise.all([
      this.kvStore.load(taskId),
      this.fetchAuthoritativeCommits(taskId),
    ]);

    const projectedVersion = Number(projectedTask?.version ?? 0);
    const authoritativeVersion = commits.length
      ? commits[commits.length - 1].task_version_after
      : projectedVersion;

    const plan = planProjectionRepair(
      taskId,
      authoritativeVersion,
      projectedVersion,
      commits,
    );

    const continuity = validateRepairPlan(plan);
    if (!continuity.valid) {
      throw new Error(
        `Projection repair continuity check failed: ${continuity.error ?? "unknown error"}`,
      );
    }

    for (const commit of plan.commits_to_apply) {
      await this.kvStore.update(taskId, {
        expectedVersion: commit.task_version_before,
        changes: commit.task_state_after,
      });
    }

    const repairedTask = await this.kvStore.load(taskId);
    const lag = computeProjectionLag(
      authoritativeVersion,
      Number(repairedTask?.version ?? 0),
    );

    return {
      repaired: !lag.is_lagging,
      projected_version: lag.projected_version,
      authoritative_version: lag.authoritative_version,
      commits_replayed: plan.commits_to_apply.length,
    };
  }

  private _applyCommandToDo(taskId: string, command: TaskCommand): void {
    try {
      const id = this.doNamespace.idFromName(taskId);
      const stub = this.doNamespace.get(id);
      stub
        .fetch(`${DO_BASE_URL}/apply-command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command }),
        })
        .catch((err: unknown) => {
          const errorCode = categorizeError(err);
          const message = err instanceof Error ? err.message : String(err);
          const timestamp = new Date().toISOString();

          const errorLog: DoWriteError = {
            timestamp,
            level: "warn",
            component: "DualWrite",
            event: "do_replication_failed",
            task_id: taskId,
            error_message: message,
            error_code: errorCode,
            operation: "apply-command",
          };

          this._emitStructuredLog(errorLog);
          this._emitMetric(taskId, "do_replication_failed", errorCode);
        });
    } catch (err) {
      const errorCode = categorizeError(err);
      const message = err instanceof Error ? err.message : String(err);
      const timestamp = new Date().toISOString();

      const errorLog: DoWriteError = {
        timestamp,
        level: "warn",
        component: "DualWrite",
        event: "do_stub_creation_failed",
        task_id: taskId,
        error_message: message,
        error_code: errorCode,
      };

      this._emitStructuredLog(errorLog);
      this._emitMetric(taskId, "do_stub_creation_failed", errorCode);
    }
  }

  private _replicateToDo(
    taskId: string,
    taskState: Record<string, unknown>,
  ): void {
    try {
      const id = this.doNamespace.idFromName(taskId);
      const stub = this.doNamespace.get(id);
      stub
        .fetch(`${DO_BASE_URL}/put-state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: taskState }),
        })
        .catch((err: unknown) => {
          const errorCode = categorizeError(err);
          const message = err instanceof Error ? err.message : String(err);
          const timestamp = new Date().toISOString();

          const errorLog: DoWriteError = {
            timestamp,
            level: "warn",
            component: "DualWrite",
            event: "do_replication_failed",
            task_id: taskId,
            error_message: message,
            error_code: errorCode,
            operation: "put-state",
          };

          this._emitStructuredLog(errorLog);
          this._emitMetric(taskId, "do_replication_failed", errorCode);
        });
    } catch (err) {
      const errorCode = categorizeError(err);
      const message = err instanceof Error ? err.message : String(err);
      const timestamp = new Date().toISOString();

      const errorLog: DoWriteError = {
        timestamp,
        level: "warn",
        component: "DualWrite",
        event: "do_stub_creation_failed",
        task_id: taskId,
        error_message: message,
        error_code: errorCode,
      };

      this._emitStructuredLog(errorLog);
      this._emitMetric(taskId, "do_stub_creation_failed", errorCode);
    }
  }
}
