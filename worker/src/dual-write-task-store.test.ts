import { describe, it, expect, vi, beforeEach } from "vitest";
import { DualWriteTaskStore } from "./dual-write-task-store";

// ── Mock KvTaskStore ─────────────────────────────────────────────────────────

function makeMockKvStore() {
  const task = { task_id: "task_1", version: 2, state: "active" };
  return {
    load: vi.fn().mockResolvedValue(task),
    loadByCode: vi.fn().mockResolvedValue(task),
    loadByName: vi.fn().mockResolvedValue(task),
    listProgressEvents: vi.fn().mockResolvedValue([]),
    getReadinessView: vi.fn().mockResolvedValue({ ready: true }),
    listSnapshots: vi.fn().mockResolvedValue([]),
    getSnapshot: vi.fn().mockResolvedValue({ snapshot_version: 1 }),
    listRecentTasks: vi.fn().mockResolvedValue([]),
    getLatestActiveTask: vi.fn().mockResolvedValue(null),
    getCheckpointLog: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ ...task, version: 1 }),
    update: vi.fn().mockResolvedValue({ ...task, version: 3 }),
    transitionState: vi
      .fn()
      .mockResolvedValue({ ...task, state: "completed", version: 3 }),
    appendFinding: vi.fn().mockResolvedValue({ ...task, version: 3 }),
    transitionFindingsForRouteUpgrade: vi
      .fn()
      .mockResolvedValue({ ...task, version: 3 }),
    selectRoute: vi.fn().mockResolvedValue({ ...task, version: 3 }),
    createContinuationPackage: vi.fn().mockResolvedValue({
      schema_version: "1.0.0",
      task: { ...task, version: 3 },
      handoff_token_id: "tok_1",
      created_at: "2026-01-01T00:00:00Z",
    }),
  };
}

// ── Mock DurableObjectNamespace ──────────────────────────────────────────────

function makeMockDoNamespace() {
  const fetchFn = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  const stub = { fetch: fetchFn };
  const namespace = {
    idFromName: vi.fn().mockReturnValue("do-id-1"),
    get: vi.fn().mockReturnValue(stub),
  };
  return { namespace, stub, fetchFn };
}

describe("DualWriteTaskStore", () => {
  let kvStore: ReturnType<typeof makeMockKvStore>;
  let doMock: ReturnType<typeof makeMockDoNamespace>;
  let store: DualWriteTaskStore;

  beforeEach(() => {
    kvStore = makeMockKvStore();
    doMock = makeMockDoNamespace();
    store = new DualWriteTaskStore(kvStore as never, doMock.namespace as never);
  });

  describe("read methods delegate to KV only", () => {
    it("load", async () => {
      const result = await store.load("task_1");
      expect(kvStore.load).toHaveBeenCalledWith("task_1");
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
      expect(result.task_id).toBe("task_1");
    });

    it("loadByCode", async () => {
      await store.loadByCode("abc1");
      expect(kvStore.loadByCode).toHaveBeenCalledWith("abc1");
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
    });

    it("loadByName", async () => {
      await store.loadByName("my-task");
      expect(kvStore.loadByName).toHaveBeenCalledWith("my-task");
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
    });

    it("listProgressEvents", async () => {
      await store.listProgressEvents("task_1");
      expect(kvStore.listProgressEvents).toHaveBeenCalled();
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
    });

    it("getReadinessView", async () => {
      await store.getReadinessView("task_1");
      expect(kvStore.getReadinessView).toHaveBeenCalled();
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
    });

    it("listSnapshots", async () => {
      await store.listSnapshots("task_1");
      expect(kvStore.listSnapshots).toHaveBeenCalled();
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
    });

    it("getSnapshot", async () => {
      await store.getSnapshot("task_1", 1);
      expect(kvStore.getSnapshot).toHaveBeenCalled();
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
    });

    it("listRecentTasks", async () => {
      await store.listRecentTasks();
      expect(kvStore.listRecentTasks).toHaveBeenCalled();
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
    });

    it("getLatestActiveTask", async () => {
      await store.getLatestActiveTask();
      expect(kvStore.getLatestActiveTask).toHaveBeenCalled();
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
    });

    it("getCheckpointLog", async () => {
      await store.getCheckpointLog("task_1");
      expect(kvStore.getCheckpointLog).toHaveBeenCalled();
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
    });
  });

  describe("mutation methods call KV first, then DO", () => {
    it("create", async () => {
      const task = { task_id: "task_1", version: 1, state: "pending" };
      const result = await store.create(task);
      expect(kvStore.create).toHaveBeenCalledWith(task);
      expect(result.version).toBe(1);

      // Give fire-and-forget time to execute
      await new Promise((r) => setTimeout(r, 10));
      expect(doMock.namespace.idFromName).toHaveBeenCalledWith("task_1");
      expect(doMock.namespace.get).toHaveBeenCalled();
      expect(doMock.fetchFn).toHaveBeenCalled();
    });

    it("transitionState", async () => {
      const payload = {
        expectedVersion: 2,
        nextState: "completed",
        nextAction: "done",
        updatedAt: "2026-01-01T00:00:00Z",
      };
      await store.transitionState("task_1", payload);
      expect(kvStore.transitionState).toHaveBeenCalledWith("task_1", payload);
      await new Promise((r) => setTimeout(r, 10));
      expect(doMock.fetchFn).toHaveBeenCalled();
    });

    it("appendFinding", async () => {
      const payload = {
        expectedVersion: 2,
        finding: { finding_id: "f1" },
        updatedAt: "2026-01-01T00:00:00Z",
      };
      await store.appendFinding("task_1", payload);
      expect(kvStore.appendFinding).toHaveBeenCalledWith("task_1", payload);
      await new Promise((r) => setTimeout(r, 10));
      expect(doMock.fetchFn).toHaveBeenCalled();
    });

    it("selectRoute", async () => {
      const payload = {
        routeId: "local_repo",
        expectedVersion: 2,
        selectedAt: "2026-01-01T00:00:00Z",
      };
      await store.selectRoute("task_1", payload);
      expect(kvStore.selectRoute).toHaveBeenCalledWith("task_1", payload);
      await new Promise((r) => setTimeout(r, 10));
      expect(doMock.fetchFn).toHaveBeenCalled();
    });

    it("update", async () => {
      const payload = {
        expectedVersion: 2,
        changes: { next_action: "review" },
      };
      await store.update("task_1", payload);
      expect(kvStore.update).toHaveBeenCalledWith("task_1", payload);
      await new Promise((r) => setTimeout(r, 10));
      expect(doMock.fetchFn).toHaveBeenCalled();
    });

    it("transitionFindingsForRouteUpgrade", async () => {
      const payload = {
        expectedVersion: 2,
        toRouteId: "local_repo",
        upgradedAt: "2026-01-01T00:00:00Z",
        toEquivalenceLevel: "equal",
      };
      await store.transitionFindingsForRouteUpgrade("task_1", payload);
      expect(kvStore.transitionFindingsForRouteUpgrade).toHaveBeenCalledWith(
        "task_1",
        payload,
      );
      await new Promise((r) => setTimeout(r, 10));
      expect(doMock.fetchFn).toHaveBeenCalled();
    });

    it("createContinuationPackage", async () => {
      const payload = {
        handoffToken: { token_id: "tok_1" },
        effectiveExecutionContract: { task_id: "task_1" },
      };
      await store.createContinuationPackage("task_1", payload);
      expect(kvStore.createContinuationPackage).toHaveBeenCalledWith(
        "task_1",
        payload,
      );
      await new Promise((r) => setTimeout(r, 10));
      expect(doMock.fetchFn).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("propagates KV errors without calling DO", async () => {
      kvStore.create.mockRejectedValue(new Error("KV write failed"));
      await expect(store.create({ task_id: "task_1" })).rejects.toThrow(
        "KV write failed",
      );
      expect(doMock.namespace.idFromName).not.toHaveBeenCalled();
    });

    it("swallows DO errors and returns KV result", async () => {
      doMock.fetchFn.mockRejectedValue(new Error("DO unreachable"));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await store.create({ task_id: "task_1", version: 1 });
      expect(result.version).toBe(1);

      // Wait for fire-and-forget
      await new Promise((r) => setTimeout(r, 10));
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[DualWrite]"),
      );
      warnSpy.mockRestore();
    });

    it("swallows DO stub creation errors", async () => {
      doMock.namespace.idFromName.mockImplementation(() => {
        throw new Error("bad ID");
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await store.create({ task_id: "task_1", version: 1 });
      expect(result.version).toBe(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[DualWrite] DO stub creation failed"),
      );
      warnSpy.mockRestore();
    });
  });

  describe("DO replication sends correct payload", () => {
    it("sends task state to /put-state", async () => {
      await store.create({ task_id: "task_1", version: 1, state: "pending" });
      await new Promise((r) => setTimeout(r, 10));

      expect(doMock.fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = doMock.fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://task-object/put-state");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.task.task_id).toBe("task_1");
    });
  });
});
