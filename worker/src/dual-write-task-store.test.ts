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

function makeMockDoNamespace() {
  const fetchFn = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        ok: true,
        action_id: "action-1",
        task_id: "task_1",
        resulting_task_version: 3,
        replayed: false,
      }),
    ),
  );
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
});
