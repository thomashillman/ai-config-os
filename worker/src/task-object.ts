/**
 * TaskObject -- Durable Object that owns live state for a single task.
 *
 * PR1: Write-only target in the dual-write path. Reads still served by KV.
 * One DO instance per task ID (sharded via idFromName(taskId)).
 *
 * Storage keys (DO native serialization, not JSON strings):
 *   task                      - Full PortableTaskObject
 *   version                   - Integer version counter
 *   events                    - Array of progress events
 *   snapshots                 - Array of task state snapshots
 *   log                       - Array of checkpoint log entries
 *   continuation_fingerprints - Map<tokenId, fingerprint> for replay protection
 *   meta                      - Replication metadata
 */

import type { Env } from "./types";

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
