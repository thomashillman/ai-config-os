/**
 * TaskObject -- Durable Object that owns live state for a single task.
 *
 * Implements a task-scoped command store:
 * - Authoritative write path via apply-command endpoint
 * - Append-only commit log for audit trail
 * - Idempotency index for deterministic replay
 * - Explicit version enforcement and conflict detection
 *
 * Storage keys (DO native serialization, not JSON strings):
 *   task                      - Full PortableTaskObject (current state)
 *   version                   - Integer version counter
 *   commits                   - Array of ActionCommit (append-only)
 *   idempotency_index         - Map<idempotency_key, {action_id, semantic_digest, version}>
 *   events                    - Array of progress events (derived, migration support)
 *   snapshots                 - Array of task state snapshots (derived, migration support)
 *   log                       - Array of checkpoint log entries (derived, migration support)
 *   continuation_fingerprints - Map<tokenId, fingerprint> for replay protection
 *   meta                      - Replication metadata
 */

import type { Env } from "./types";
import type {
  TaskCommand,
  ApplyCommandRequest,
  ApplyCommandResponse,
  ActionCommit,
} from "./task-command";

interface TaskObjectMeta {
  created_at: string;
  last_replicated_at: string;
  replication_count: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export class TaskObject implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "POST" && path === "/apply-command") {
        return this.handleApplyCommand(request);
      }
      if (request.method === "POST" && path === "/put-state") {
        return this.handlePutState(request);
      }
      if (request.method === "GET" && path === "/get-state") {
        return this.handleGetState();
      }
      if (request.method === "POST" && path === "/append-event") {
        return this.handleAppendEvent(request);
      }
      if (request.method === "POST" && path === "/append-snapshot") {
        return this.handleAppendSnapshot(request);
      }
      if (request.method === "POST" && path === "/append-log") {
        return this.handleAppendLog(request);
      }
      if (request.method === "POST" && path === "/set-fingerprint") {
        return this.handleSetFingerprint(request);
      }
      if (request.method === "GET" && path === "/get-fingerprint") {
        return this.handleGetFingerprint(url);
      }

      return jsonResponse(
        {
          error: "not_found",
          message: `Unknown route: ${request.method} ${path}`,
        },
        404,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      return jsonResponse({ error: "internal_error", message }, 500);
    }
  }

  private async handleApplyCommand(request: Request): Promise<Response> {
    const body = (await request.json()) as ApplyCommandRequest;

    if (!body.command || typeof body.command !== "object") {
      return jsonResponse(
        { error: "validation_error", message: "Missing or invalid command" },
        400,
      );
    }

    const command = body.command as TaskCommand;

    // Validate required command fields
    if (
      typeof command.task_id !== "string" ||
      typeof command.idempotency_key !== "string" ||
      typeof command.command_type !== "string"
    ) {
      return jsonResponse(
        {
          error: "validation_error",
          message: "Command missing required fields",
        },
        400,
      );
    }

    try {
      // Load current state
      const currentVersion = await this.state.storage.get<number>("version");
      const currentTask =
        await this.state.storage.get<Record<string, unknown>>("task");
      const idempotencyIndex = await this.state.storage.get<
        Record<
          string,
          {
            action_id: string;
            semantic_digest: string;
            task_version: number;
          }
        >
      >("idempotency_index");

      // Check if command was already applied (idempotency)
      const existingEntry = idempotencyIndex?.[command.idempotency_key];
      if (existingEntry) {
        // Verify digest matches (prevent key reuse with different semantics)
        if (existingEntry.semantic_digest !== command.semantic_digest) {
          return jsonResponse(
            {
              error: "idempotency_key_reused",
              message:
                "This idempotency key was used with a different request body",
              action_id: existingEntry.action_id,
            },
            400,
          );
        }

        // Return original result (replay)
        return jsonResponse({
          ok: true,
          action_id: existingEntry.action_id,
          task_id: command.task_id,
          resulting_task_version: existingEntry.task_version,
          replayed: true,
          projection_status: "complete",
        });
      }

      // Check version constraint
      const taskVersion = currentVersion ?? 0;
      if (command.expected_task_version !== null) {
        if (command.expected_task_version !== taskVersion) {
          return jsonResponse(
            {
              error: "version_conflict",
              message: `Expected task version ${command.expected_task_version}, current is ${taskVersion}`,
              expected_version: command.expected_task_version,
              current_version: taskVersion,
            },
            409,
          );
        }
      }

      // Apply command semantics based on command type
      const updatedTask = { ...currentTask };
      let applyError: { code: string; message: string } | null = null;

      switch (command.command_type) {
        case "task.select_route": {
          const payload = command.payload as { route_id?: string };
          if (!payload.route_id) {
            applyError = {
              code: "invalid_command",
              message: "route_id required for select_route",
            };
          } else {
            // Validate route is available for task type
            const taskType = String(updatedTask.task_type ?? "");
            const validRoutes: Record<string, string[]> = {
              review_repository: [
                "local_repo",
                "github_pr",
                "uploaded_bundle",
                "pasted_diff",
              ],
            };
            const availableRoutes = validRoutes[taskType] ?? [];

            if (!availableRoutes.includes(payload.route_id)) {
              applyError = {
                code: "invalid_command",
                message: `Route '${payload.route_id}' not available for task type '${taskType}'`,
              };
            } else {
              updatedTask.current_route = payload.route_id;
            }
          }
          break;
        }

        case "task.transition_state": {
          const payload = command.payload as {
            next_state?: string;
            next_action?: string;
          };
          if (!payload.next_state) {
            applyError = {
              code: "invalid_command",
              message: "next_state required for transition_state",
            };
          } else {
            // Validate state transition is allowed
            const currentState = String(updatedTask.state ?? "created");
            const validTransitions: Record<string, string[]> = {
              created: ["ready", "in_progress"],
              ready: ["in_progress"],
              in_progress: ["completed", "blocked"],
              blocked: ["in_progress"],
              completed: [],
            };

            const allowedStates = validTransitions[currentState] ?? [];
            if (!allowedStates.includes(payload.next_state)) {
              applyError = {
                code: "invalid_command",
                message: `Invalid state transition from '${currentState}' to '${payload.next_state}'`,
              };
            } else {
              updatedTask.state = payload.next_state;
              if (payload.next_action) {
                updatedTask.current_action = payload.next_action;
              }
            }
          }
          break;
        }

        case "task.append_finding": {
          const payload = command.payload as {
            finding?: Record<string, unknown>;
          };
          if (!payload.finding) {
            applyError = {
              code: "invalid_command",
              message: "finding required for append_finding",
            };
          } else {
            const finding = payload.finding as Record<string, unknown>;
            // Validate finding has required fields
            if (!finding.findingId || !finding.summary) {
              applyError = {
                code: "invalid_command",
                message: "Finding missing required fields (findingId, summary)",
              };
            } else {
              const findings = Array.isArray(updatedTask.findings)
                ? (updatedTask.findings as unknown[])
                : [];
              findings.push(finding);
              updatedTask.findings = findings;
            }
          }
          break;
        }

        default:
          applyError = {
            code: "invalid_command",
            message: `Unknown command type: ${command.command_type}`,
          };
      }

      // Return error if command execution failed
      if (applyError) {
        return jsonResponse(
          {
            error: applyError.code,
            message: applyError.message,
          },
          400,
        );
      }

      // Generate action ID and new version
      const actionId = `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const newVersion = taskVersion + 1;
      const now = new Date().toISOString();

      updatedTask.version = newVersion;
      updatedTask.updated_at = now;

      // Extract result summary based on successful command type
      let resultSummary = "Command executed";
      switch (command.command_type) {
        case "task.select_route":
          resultSummary = "Route selected";
          break;
        case "task.transition_state":
          resultSummary = "State transitioned";
          break;
        case "task.append_finding":
          resultSummary = "Finding appended";
          break;
        default:
          resultSummary = "Mutation applied";
      }

      // Create action commit with all required authoritative receipt fields
      const commit: ActionCommit = {
        // Top-level authoritative receipt fields
        action_id: actionId,
        task_id: command.task_id,
        command_type: command.command_type,
        command_digest: command.semantic_digest,
        principal_id: command.principal.principal_id,
        authority: command.authority,
        request_id: (command.request_context as Record<string, unknown>)?.request_id as string | undefined,
        trace_id: (command.request_context as Record<string, unknown>)?.trace_id as string | undefined,
        route_id: (command.resolved_context as Record<string, unknown>)?.route_id as string | undefined,
        model_path: (command.resolved_context as Record<string, unknown>)?.model_path,
        created_at: now,
        task_version_before: taskVersion,
        task_version_after: newVersion,
        result: {
          success: true,
        },
        result_summary: resultSummary,

        // Canonical mutation input (unchanged)
        command_envelope: command,
      };

      // Persist updates atomically
      const newIdempotencyIndex = {
        ...(idempotencyIndex ?? {}),
        [command.idempotency_key]: {
          action_id: actionId,
          semantic_digest: command.semantic_digest,
          task_version: newVersion,
        },
      };

      const existingCommits =
        (await this.state.storage.get<ActionCommit[]>("commits")) ?? [];
      const newCommits = [...existingCommits, commit];

      // Atomic write
      await this.state.storage.put({
        task: updatedTask,
        version: newVersion,
        commits: newCommits,
        idempotency_index: newIdempotencyIndex,
      });

      // Update meta
      const existingMeta = await this.state.storage.get<TaskObjectMeta>("meta");
      const meta: TaskObjectMeta = {
        created_at: existingMeta?.created_at ?? now,
        last_replicated_at: now,
        replication_count: (existingMeta?.replication_count ?? 0) + 1,
      };
      await this.state.storage.put("meta", meta);

      return jsonResponse({
        ok: true,
        action_id: actionId,
        task_id: command.task_id,
        resulting_task_version: newVersion,
        replayed: false,
        projection_status: "pending", // KV update may lag
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return jsonResponse({ error: "internal_error", message }, 500);
    }
  }

  private async handlePutState(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      task: Record<string, unknown>;
      events?: unknown[];
      snapshots?: unknown[];
      log?: unknown[];
      continuationFingerprints?: Record<string, string>;
    };

    if (!body.task || typeof body.task !== "object") {
      return jsonResponse(
        { error: "validation_error", message: "Missing or invalid task" },
        400,
      );
    }

    const incomingVersion =
      typeof body.task.version === "number" ? body.task.version : null;
    const storedVersion = await this.state.storage.get<number>("version");

    // Advisory version conflict check -- logged, not blocking in PR1
    if (
      storedVersion !== undefined &&
      incomingVersion !== null &&
      incomingVersion !== storedVersion + 1
    ) {
      console.warn(
        `TaskObject version drift: stored=${storedVersion}, incoming=${incomingVersion}, task_id=${String(body.task.task_id ?? "unknown")}`,
      );
      return jsonResponse(
        {
          error: "version_conflict",
          message: `Expected version ${storedVersion + 1}, got ${incomingVersion}`,
          stored_version: storedVersion,
          incoming_version: incomingVersion,
        },
        409,
      );
    }

    const now = new Date().toISOString();
    const existingMeta = await this.state.storage.get<TaskObjectMeta>("meta");
    const meta: TaskObjectMeta = {
      created_at: existingMeta?.created_at ?? now,
      last_replicated_at: now,
      replication_count: (existingMeta?.replication_count ?? 0) + 1,
    };

    // Atomic write of core state
    await this.state.storage.put({
      task: body.task,
      version: incomingVersion ?? (storedVersion ?? 0) + 1,
      meta,
    });

    // Optional bulk replications
    if (Array.isArray(body.events) && body.events.length > 0) {
      const existing =
        (await this.state.storage.get<unknown[]>("events")) ?? [];
      await this.state.storage.put("events", existing.concat(body.events));
    }
    if (Array.isArray(body.snapshots) && body.snapshots.length > 0) {
      const existing =
        (await this.state.storage.get<unknown[]>("snapshots")) ?? [];
      await this.state.storage.put(
        "snapshots",
        existing.concat(body.snapshots),
      );
    }
    if (Array.isArray(body.log) && body.log.length > 0) {
      const existing = (await this.state.storage.get<unknown[]>("log")) ?? [];
      await this.state.storage.put("log", existing.concat(body.log));
    }
    if (
      body.continuationFingerprints &&
      typeof body.continuationFingerprints === "object"
    ) {
      const existing =
        (await this.state.storage.get<Record<string, string>>(
          "continuation_fingerprints",
        )) ?? {};
      await this.state.storage.put("continuation_fingerprints", {
        ...existing,
        ...body.continuationFingerprints,
      });
    }

    return jsonResponse({
      ok: true,
      version: incomingVersion ?? (storedVersion ?? 0) + 1,
    });
  }

  private async handleGetState(): Promise<Response> {
    const [task, version, events, snapshots, log, meta] = await Promise.all([
      this.state.storage.get("task"),
      this.state.storage.get<number>("version"),
      this.state.storage.get<unknown[]>("events"),
      this.state.storage.get<unknown[]>("snapshots"),
      this.state.storage.get<unknown[]>("log"),
      this.state.storage.get<TaskObjectMeta>("meta"),
    ]);

    if (task === undefined) {
      return jsonResponse(
        { error: "not_found", message: "No state stored in this TaskObject" },
        404,
      );
    }

    return jsonResponse({
      task,
      version: version ?? null,
      events: events ?? [],
      snapshots: snapshots ?? [],
      log: log ?? [],
      meta: meta ?? null,
    });
  }

  private async handleAppendEvent(request: Request): Promise<Response> {
    const event = await request.json();
    const existing = (await this.state.storage.get<unknown[]>("events")) ?? [];
    existing.push(event);
    await this.state.storage.put("events", existing);
    return jsonResponse({ ok: true, count: existing.length });
  }

  private async handleAppendSnapshot(request: Request): Promise<Response> {
    const snapshot = await request.json();
    const existing =
      (await this.state.storage.get<unknown[]>("snapshots")) ?? [];
    existing.push(snapshot);
    await this.state.storage.put("snapshots", existing);
    return jsonResponse({ ok: true, count: existing.length });
  }

  private async handleAppendLog(request: Request): Promise<Response> {
    const entry = await request.json();
    const existing = (await this.state.storage.get<unknown[]>("log")) ?? [];
    existing.push(entry);
    await this.state.storage.put("log", existing);
    return jsonResponse({ ok: true, count: existing.length });
  }

  private async handleSetFingerprint(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      tokenId: string;
      fingerprint: string;
    };
    if (
      typeof body.tokenId !== "string" ||
      typeof body.fingerprint !== "string"
    ) {
      return jsonResponse(
        {
          error: "validation_error",
          message: "tokenId and fingerprint must be strings",
        },
        400,
      );
    }
    const existing =
      (await this.state.storage.get<Record<string, string>>(
        "continuation_fingerprints",
      )) ?? {};
    existing[body.tokenId] = body.fingerprint;
    await this.state.storage.put("continuation_fingerprints", existing);
    return jsonResponse({ ok: true });
  }

  private async handleGetFingerprint(url: URL): Promise<Response> {
    const tokenId = url.searchParams.get("tokenId");
    if (!tokenId) {
      return jsonResponse(
        {
          error: "validation_error",
          message: "Missing tokenId query parameter",
        },
        400,
      );
    }
    const fingerprints =
      (await this.state.storage.get<Record<string, string>>(
        "continuation_fingerprints",
      )) ?? {};
    const fingerprint = fingerprints[tokenId] ?? null;
    return jsonResponse({ tokenId, fingerprint });
  }
}
