import { describe, it, expect, beforeEach } from "vitest";
import { TaskObject } from "./task-object";

// Minimal in-memory DurableObjectState mock
function makeMockState() {
  const store = new Map<string, unknown>();
  return {
    storage: {
      async get<T = unknown>(key: string): Promise<T | undefined> {
        return store.get(key) as T | undefined;
      },
      async put(
        keyOrEntries: string | Record<string, unknown>,
        value?: unknown,
      ): Promise<void> {
        if (typeof keyOrEntries === "string") {
          store.set(keyOrEntries, value);
        } else {
          for (const [k, v] of Object.entries(keyOrEntries)) {
            store.set(k, v);
          }
        }
      },
      async delete(key: string): Promise<void> {
        store.delete(key);
      },
      async list(): Promise<Map<string, unknown>> {
        return new Map(store);
      },
    },
    _store: store,
  };
}

function makeRequest(method: string, path: string, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(`https://task-object${path}`, init);
}

describe("TaskObject", () => {
  let obj: TaskObject;
  let state: ReturnType<typeof makeMockState>;

  beforeEach(() => {
    state = makeMockState();
    obj = new TaskObject(state as never, {} as never);
  });

  describe("PUT /put-state", () => {
    it("stores task state and returns version", async () => {
      const task = { task_id: "task_1", version: 1, state: "pending" };
      const res = await obj.fetch(makeRequest("POST", "/put-state", { task }));
      const body = (await res.json()) as { ok: boolean; version: number };

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.version).toBe(1);

      expect(state._store.get("task")).toEqual(task);
      expect(state._store.get("version")).toBe(1);
    });

    it("stores events, snapshots, log, and fingerprints when provided", async () => {
      const task = { task_id: "task_1", version: 1 };
      const res = await obj.fetch(
        makeRequest("POST", "/put-state", {
          task,
          events: [{ event_id: "e1" }],
          snapshots: [{ snapshot_version: 1 }],
          log: [{ type: "created" }],
          continuationFingerprints: { tok_1: "fp_1" },
        }),
      );

      expect(res.status).toBe(200);
      expect(state._store.get("events")).toEqual([{ event_id: "e1" }]);
      expect(state._store.get("snapshots")).toEqual([{ snapshot_version: 1 }]);
      expect(state._store.get("log")).toEqual([{ type: "created" }]);
      expect(state._store.get("continuation_fingerprints")).toEqual({
        tok_1: "fp_1",
      });
    });

    it("returns 409 on version conflict", async () => {
      // Store initial state at version 1
      await obj.fetch(
        makeRequest("POST", "/put-state", {
          task: { task_id: "task_1", version: 1 },
        }),
      );

      // Attempt version 3 (should be 2)
      const res = await obj.fetch(
        makeRequest("POST", "/put-state", {
          task: { task_id: "task_1", version: 3 },
        }),
      );

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("version_conflict");
    });

    it("returns 400 when task is missing", async () => {
      const res = await obj.fetch(makeRequest("POST", "/put-state", {}));
      expect(res.status).toBe(400);
    });

    it("increments replication count on repeated writes", async () => {
      await obj.fetch(
        makeRequest("POST", "/put-state", {
          task: { task_id: "task_1", version: 1 },
        }),
      );
      await obj.fetch(
        makeRequest("POST", "/put-state", {
          task: { task_id: "task_1", version: 2 },
        }),
      );

      const meta = state._store.get("meta") as { replication_count: number };
      expect(meta.replication_count).toBe(2);
    });
  });

  describe("GET /get-state", () => {
    it("returns stored state", async () => {
      const task = { task_id: "task_1", version: 1 };
      await obj.fetch(makeRequest("POST", "/put-state", { task }));

      const res = await obj.fetch(makeRequest("GET", "/get-state"));
      const body = (await res.json()) as { task: unknown; version: number };

      expect(res.status).toBe(200);
      expect(body.task).toEqual(task);
      expect(body.version).toBe(1);
    });

    it("returns 404 when no state stored", async () => {
      const res = await obj.fetch(makeRequest("GET", "/get-state"));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /append-event", () => {
    it("accumulates events", async () => {
      await obj.fetch(makeRequest("POST", "/append-event", { event_id: "e1" }));
      await obj.fetch(makeRequest("POST", "/append-event", { event_id: "e2" }));

      const events = state._store.get("events") as unknown[];
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ event_id: "e1" });
      expect(events[1]).toEqual({ event_id: "e2" });
    });
  });

  describe("POST /append-snapshot", () => {
    it("accumulates snapshots", async () => {
      await obj.fetch(makeRequest("POST", "/append-snapshot", { v: 1 }));
      await obj.fetch(makeRequest("POST", "/append-snapshot", { v: 2 }));

      const snapshots = state._store.get("snapshots") as unknown[];
      expect(snapshots).toHaveLength(2);
    });
  });

  describe("POST /append-log", () => {
    it("accumulates log entries", async () => {
      await obj.fetch(makeRequest("POST", "/append-log", { type: "created" }));
      const log = state._store.get("log") as unknown[];
      expect(log).toHaveLength(1);
    });
  });

  describe("fingerprint management", () => {
    it("round-trips set and get", async () => {
      await obj.fetch(
        makeRequest("POST", "/set-fingerprint", {
          tokenId: "tok_1",
          fingerprint: "fp_abc",
        }),
      );

      const res = await obj.fetch(
        makeRequest("GET", "/get-fingerprint?tokenId=tok_1"),
      );
      const body = (await res.json()) as {
        tokenId: string;
        fingerprint: string | null;
      };

      expect(body.tokenId).toBe("tok_1");
      expect(body.fingerprint).toBe("fp_abc");
    });

    it("returns null for unknown tokenId", async () => {
      const res = await obj.fetch(
        makeRequest("GET", "/get-fingerprint?tokenId=unknown"),
      );
      const body = (await res.json()) as { fingerprint: string | null };
      expect(body.fingerprint).toBeNull();
    });

    it("rejects missing tokenId on set", async () => {
      const res = await obj.fetch(
        makeRequest("POST", "/set-fingerprint", { tokenId: 123 }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects missing tokenId on get", async () => {
      const res = await obj.fetch(makeRequest("GET", "/get-fingerprint"));
      expect(res.status).toBe(400);
    });
  });

  describe("unknown routes", () => {
    it("returns 404 for unknown path", async () => {
      const res = await obj.fetch(makeRequest("GET", "/nope"));
      expect(res.status).toBe(404);
    });

    it("returns 404 for wrong method on known path", async () => {
      const res = await obj.fetch(makeRequest("DELETE", "/put-state"));
      expect(res.status).toBe(404);
    });
  });
});
