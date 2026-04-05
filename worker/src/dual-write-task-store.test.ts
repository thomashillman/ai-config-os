import { beforeEach, describe, expect, it, vi } from "vitest";
import { DualWriteTaskStore } from "./dual-write-task-store";
import { buildTaskCommand } from "./task-command";

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
    createContinuationPackage: vi.fn().mockResolvedValue({ task }),
  };
}

function makeMockDoNamespace({
  applyCommandResponse,
  commits = [],
}: {
  applyCommandResponse?: Record<string, unknown>;
  commits?: Array<Record<string, unknown>>;
} = {}) {
  const fetchFn = vi.fn().mockImplementation((url: string) => {
    if (url.endsWith("/commits")) {
      return Promise.resolve(new Response(JSON.stringify({ commits })));
    }

    if (url.endsWith("/apply-command")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            applyCommandResponse ?? {
              ok: true,
              action_id: "action-1",
              task_id: "task_1",
              resulting_task_version: 3,
              replayed: false,
            },
          ),
        ),
      );
    }

    return Promise.resolve(new Response(JSON.stringify({ ok: true })));
  });
  const stub = { fetch: fetchFn };
  const namespace = {
    idFromName: vi.fn().mockReturnValue("do-id-1"),
    get: vi.fn().mockReturnValue(stub),
  };
  return { namespace, fetchFn };
}

function makeCommand(
  type: "task.select_route" | "task.transition_state" | "task.append_finding",
) {
  const payload =
    type === "task.select_route"
      ? { route_id: "local_repo" }
      : type === "task.transition_state"
        ? { next_state: "active", next_action: "continue" }
        : {
            finding: {
              findingId: "f-1",
              summary: "Finding",
              status: "verified",
              recordedByRoute: "local_repo",
              recordedAt: "2026-04-05T00:00:00.000Z",
            },
          };

  return buildTaskCommand({
    task_id: "task_1",
    idempotency_key: `${type}-1`,
    expected_task_version: 2,
    command_type: type,
    payload,
    principal: { principal_type: "user", principal_id: "u1" },
    boundary: { owner_principal_id: "u1", workspace_id: "ws1" },
    authority: {
      authority_mode: "direct_owner",
      allowed_actions: [type],
      stamped_at: "2026-04-05T00:00:00.000Z",
    },
    request_context: {
      updated_at: "2026-04-05T00:00:00.000Z",
      selected_at: "2026-04-05T00:00:00.000Z",
    },
    resolved_context: { route_id: "local_repo" },
  });
}

describe("DualWriteTaskStore authoritative mode", () => {
  let kvStore: ReturnType<typeof makeMockKvStore>;
  let doMock: ReturnType<typeof makeMockDoNamespace>;
  let store: DualWriteTaskStore;

  beforeEach(() => {
    kvStore = makeMockKvStore();
    doMock = makeMockDoNamespace();
    store = new DualWriteTaskStore(
      kvStore as never,
      doMock.namespace as never,
      "authoritative",
    );
  });

  it("routes migrated command through apply-command before KV projection write", async () => {
    const command = makeCommand("task.select_route");

    const result = await store.selectRoute(
      "task_1",
      {
        routeId: "local_repo",
        expectedVersion: 2,
        selectedAt: "2026-04-05T00:00:00.000Z",
      },
      command,
    );

    expect(doMock.fetchFn).toHaveBeenCalledWith(
      "https://task-object/apply-command",
      expect.objectContaining({ method: "POST" }),
    );
    expect(kvStore.selectRoute).toHaveBeenCalled();
    expect(result).toEqual({
      action_id: "action-1",
      task_id: "task_1",
      resulting_task_version: 3,
      replayed: false,
      projection_status: "applied",
    });
  });

  it("keeps authoritative success when KV projection write fails", async () => {
    kvStore.transitionState.mockRejectedValue(
      new Error("kv projection failed"),
    );
    const command = makeCommand("task.transition_state");

    const result = await store.transitionState(
      "task_1",
      {
        expectedVersion: 2,
        nextState: "active",
        nextAction: "continue",
        updatedAt: "2026-04-05T00:00:00.000Z",
      },
      command,
    );

    expect(result.projection_status).toBe("pending");
    expect(result.action_id).toBe("action-1");
  });

  it("does not replay KV projection write for authoritative replay receipts", async () => {
    doMock = makeMockDoNamespace({
      applyCommandResponse: {
        ok: true,
        action_id: "action-replay",
        task_id: "task_1",
        resulting_task_version: 3,
        replayed: true,
      },
    });
    store = new DualWriteTaskStore(
      kvStore as never,
      doMock.namespace as never,
      "authoritative",
    );
    kvStore.selectRoute.mockRejectedValue(new Error("should not be called"));

    const result = await store.selectRoute(
      "task_1",
      {
        routeId: "local_repo",
        expectedVersion: 2,
        selectedAt: "2026-04-05T00:00:00.000Z",
      },
      makeCommand("task.select_route"),
    );

    expect(kvStore.selectRoute).not.toHaveBeenCalled();
    expect(result).toEqual({
      action_id: "action-replay",
      task_id: "task_1",
      resulting_task_version: 3,
      replayed: true,
      projection_status: "applied",
    });
  });

  it("preserves replayed authoritative receipt fields", async () => {
    doMock = makeMockDoNamespace({
      applyCommandResponse: {
        ok: true,
        action_id: "action-original",
        task_id: "task_original",
        resulting_task_version: 9,
        replayed: true,
      },
    });
    store = new DualWriteTaskStore(
      kvStore as never,
      doMock.namespace as never,
      "authoritative",
    );

    const result = await store.appendFinding(
      "task_1",
      {
        expectedVersion: 2,
        finding: { findingId: "f-1" },
        updatedAt: "2026-04-05T00:00:00.000Z",
      },
      makeCommand("task.append_finding"),
    );

    expect(result.action_id).toBe("action-original");
    expect(result.task_id).toBe("task_original");
    expect(result.resulting_task_version).toBe(9);
    expect(result.replayed).toBe(true);
    expect(result.projection_status).toBe("applied");
  });

  it("surfaces projection lag on loadByCode/loadByName/latest/listRecent read paths", async () => {
    doMock = makeMockDoNamespace({
      commits: [
        {
          task_id: "task_1",
          task_version_after: 3,
          task_state_after: { task_id: "task_1", version: 3, state: "done" },
        },
      ],
    });
    store = new DualWriteTaskStore(
      kvStore as never,
      doMock.namespace as never,
      "authoritative",
    );
    kvStore.loadByCode.mockResolvedValue({ task_id: "task_1", version: 2 });
    kvStore.loadByName.mockResolvedValue({ task_id: "task_1", version: 2 });
    kvStore.getLatestActiveTask.mockResolvedValue({
      task_id: "task_1",
      version: 2,
    });
    kvStore.listRecentTasks.mockResolvedValue([
      { task_id: "task_1", version: 2 },
    ]);

    const byCode = await store.loadByCode("T1");
    const byName = await store.loadByName("Task 1");
    const latest = await store.getLatestActiveTask();
    const recent = await store.listRecentTasks();

    const byCodeProjection = (
      byCode as { projection?: Record<string, unknown> }
    ).projection as { projection_lag?: { is_lagging?: boolean } } | undefined;
    const byNameProjection = (
      byName as { projection?: Record<string, unknown> }
    ).projection as { projection_lag?: { amount?: number } } | undefined;
    const latestProjection = (
      latest as { projection?: Record<string, unknown> }
    ).projection as { authoritative_version?: number } | undefined;
    const recentProjection = (
      recent[0] as {
        projection?: Record<string, unknown>;
      }
    ).projection as { projected_version?: number } | undefined;

    expect(byCodeProjection?.projection_lag?.is_lagging).toBe(true);
    expect(byNameProjection?.projection_lag?.amount).toBe(1);
    expect(latestProjection?.authoritative_version).toBe(3);
    expect(recentProjection?.projected_version).toBe(2);
  });

  it("repairs lagging projection without mutating authoritative commits", async () => {
    const authoritativeCommits = [
      {
        action_id: "a-2",
        task_id: "task_1",
        task_version_before: 2,
        task_version_after: 3,
        task_state_after: { task_id: "task_1", version: 3, state: "done" },
      },
    ];
    doMock = makeMockDoNamespace({ commits: authoritativeCommits });
    store = new DualWriteTaskStore(
      kvStore as never,
      doMock.namespace as never,
      "authoritative",
    );
    kvStore.load.mockResolvedValueOnce({ task_id: "task_1", version: 2 });
    kvStore.update.mockResolvedValueOnce({ task_id: "task_1", version: 3 });
    kvStore.load.mockResolvedValueOnce({ task_id: "task_1", version: 3 });

    const result = await store.repairProjection("task_1");

    expect(result.repaired).toBe(true);
    expect(result.commits_replayed).toBe(1);
    expect(kvStore.update).toHaveBeenCalledWith("task_1", {
      expectedVersion: 2,
      changes: { task_id: "task_1", version: 3, state: "done" },
    });
    expect(doMock.fetchFn).toHaveBeenCalledTimes(1);
  });

  it("surfaces continuity/gap failures during projection repair", async () => {
    doMock = makeMockDoNamespace({
      commits: [
        {
          action_id: "a-2",
          task_id: "task_1",
          task_version_before: 3,
          task_version_after: 4,
          task_state_after: { task_id: "task_1", version: 4 },
        },
      ],
    });
    store = new DualWriteTaskStore(
      kvStore as never,
      doMock.namespace as never,
      "authoritative",
    );
    kvStore.load.mockResolvedValue({ task_id: "task_1", version: 1 });

    await expect(store.repairProjection("task_1")).rejects.toThrow(
      /continuity check failed/i,
    );
  });
});
