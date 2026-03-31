/**
 * Tests for the dual-write wiring in task-runtime.ts.
 *
 * Verifies that ensureTaskStore returns the correct store type
 * based on feature flag and binding availability.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to test ensureTaskStore indirectly through getTaskService,
// since ensureTaskStore is not exported. getTaskService wraps whatever
// ensureTaskStore returns in createTaskControlPlaneService.

// Mock the runtime modules to avoid loading actual JS modules
vi.mock("../../runtime/lib/task-store-worker.mjs", () => {
  class TaskStore {
    _type = "memory";
    constructor() {}
  }
  class TaskConflictError extends Error {
    constructor(m: string) {
      super(m);
    }
  }
  class TaskNotFoundError extends Error {
    constructor(m: string) {
      super(m);
    }
  }
  return { TaskStore, TaskConflictError, TaskNotFoundError };
});

vi.mock("../../runtime/lib/task-store-kv.mjs", () => {
  class KvTaskStore {
    _type = "kv";
    kv: unknown;
    constructor(kv: unknown) {
      this.kv = kv;
    }
  }
  return { KvTaskStore };
});

vi.mock("../../runtime/lib/task-control-plane-service-worker.mjs", () => ({
  createTaskControlPlaneService: ({ taskStore }: { taskStore: unknown }) => ({
    _taskStore: taskStore,
  }),
}));

vi.mock("../../runtime/lib/handoff-token-service-worker.mjs", () => ({
  createHandoffTokenService: () => ({}),
}));

// Must import after mocks are set up
import { getTaskService } from "./task-runtime";
import { DualWriteTaskStore } from "./dual-write-task-store";

function makeMockKv() {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockDoNamespace() {
  return {
    idFromName: vi.fn().mockReturnValue("id"),
    get: vi.fn().mockReturnValue({
      fetch: vi.fn().mockResolvedValue(new Response("{}")),
    }),
  };
}

describe("task-runtime dual-write wiring", () => {
  beforeEach(() => {
    // Reset module-level cached store between tests by importing fresh
    // This is necessary because task-runtime.ts caches the store in module scope.
    // We work around it by changing the KV reference each time.
    vi.clearAllMocks();
  });

  it('returns DualWriteTaskStore when flag is "true" and binding is present', () => {
    const env = {
      AUTH_TOKEN: "tok",
      EXECUTOR_SHARED_SECRET: "sec",
      MANIFEST_KV: makeMockKv(),
      TASK_DO_DUAL_WRITE: "true",
      TASK_OBJECT: makeMockDoNamespace(),
    };

    const service = getTaskService(env as never) as { _taskStore: unknown };
    expect(service._taskStore).toBeInstanceOf(DualWriteTaskStore);
  });

  it('returns KvTaskStore when flag is "false"', () => {
    const env = {
      AUTH_TOKEN: "tok",
      EXECUTOR_SHARED_SECRET: "sec",
      MANIFEST_KV: makeMockKv(),
      TASK_DO_DUAL_WRITE: "false",
    };

    const service = getTaskService(env as never) as {
      _taskStore: { _type?: string };
    };
    expect(service._taskStore).not.toBeInstanceOf(DualWriteTaskStore);
    expect(service._taskStore._type).toBe("kv");
  });

  it('returns KvTaskStore when flag is "true" but binding is missing', () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = {
      AUTH_TOKEN: "tok",
      EXECUTOR_SHARED_SECRET: "sec",
      MANIFEST_KV: makeMockKv(),
      TASK_DO_DUAL_WRITE: "true",
      // No TASK_OBJECT binding
    };

    const service = getTaskService(env as never) as {
      _taskStore: { _type?: string };
    };
    expect(service._taskStore).not.toBeInstanceOf(DualWriteTaskStore);
    expect(service._taskStore._type).toBe("kv");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("TASK_OBJECT binding is missing"),
    );
    warnSpy.mockRestore();
  });

  it("returns in-memory TaskStore when no KV binding", () => {
    const env = {
      AUTH_TOKEN: "tok",
      EXECUTOR_SHARED_SECRET: "sec",
      // No MANIFEST_KV
    };

    const service = getTaskService(env as never) as {
      _taskStore: { _type?: string };
    };
    expect(service._taskStore).not.toBeInstanceOf(DualWriteTaskStore);
    expect(service._taskStore._type).toBe("memory");
  });
});
