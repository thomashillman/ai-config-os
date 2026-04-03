import { describe, it, expect } from "vitest";
import {
  computeSemanticDigest,
  buildTaskCommand,
  type Principal,
  type Boundary,
  type Authority,
} from "../task-command";

describe("computeSemanticDigest", () => {
  it("produces stable digest for same semantic payload", () => {
    const payload1 = {
      route_id: "local_repo",
      route_index: 0,
      timestamp: "2026-04-03T00:00:00Z",
    };
    const payload2 = {
      route_id: "local_repo",
      route_index: 0,
      timestamp: "2026-04-03T00:00:01Z", // Different timestamp
    };

    const digest1 = computeSemanticDigest("task.select_route", payload1);
    const digest2 = computeSemanticDigest("task.select_route", payload2);

    // Same semantic content, different timestamp → same digest
    expect(digest1).toBe(digest2);
  });

  it("produces different digest when semantic payload changes", () => {
    const payload1 = {
      route_id: "local_repo",
      route_index: 0,
    };
    const payload2 = {
      route_id: "github_pr",
      route_index: 0,
    };

    const digest1 = computeSemanticDigest("task.select_route", payload1);
    const digest2 = computeSemanticDigest("task.select_route", payload2);

    // Different semantic content → different digest
    expect(digest1).not.toBe(digest2);
  });

  it("excludes volatile fields like timestamps from digest", () => {
    const payload = {
      next_state: "completed",
      next_action: "ready_to_ship",
      updated_at: "2026-04-03T00:00:00Z",
      request_id: "req-123",
    };

    const digest = computeSemanticDigest("task.transition_state", payload);

    // Verify it's a valid SHA256 hex digest
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles missing optional fields gracefully", () => {
    const payload1 = {
      route_id: "local_repo",
    };
    const payload2 = {
      route_id: "local_repo",
      extra_field: "ignored",
    };

    const digest1 = computeSemanticDigest("task.select_route", payload1);
    const digest2 = computeSemanticDigest("task.select_route", payload2);

    // Extra non-semantic field should not affect digest
    expect(digest1).toBe(digest2);
  });

  it("produces deterministic digests (same input always same output)", () => {
    const payload = {
      finding: {
        type: "security_issue",
        severity: "high",
      },
    };

    const digests = [
      computeSemanticDigest("task.append_finding", payload),
      computeSemanticDigest("task.append_finding", payload),
      computeSemanticDigest("task.append_finding", payload),
    ];

    // All three calls should produce identical digests
    expect(digests[0]).toBe(digests[1]);
    expect(digests[1]).toBe(digests[2]);
  });
});

describe("buildTaskCommand", () => {
  const mockPrincipal: Principal = {
    principal_type: "user",
    principal_id: "user-123",
    workspace_id: "ws-456",
  };

  const mockBoundary: Boundary = {
    owner_principal_id: "user-123",
    workspace_id: "ws-456",
    repo_id: "repo-789",
  };

  const mockAuthority: Authority = {
    authority_mode: "direct_owner",
    allowed_actions: ["task.select_route", "task.transition_state"],
    stamped_at: "2026-04-03T00:00:00Z",
  };

  it("builds valid command with all required fields", () => {
    const cmd = buildTaskCommand({
      task_id: "task-1",
      idempotency_key: "idem-key-1",
      expected_task_version: 5,
      command_type: "task.select_route",
      payload: { route_id: "local_repo" },
      principal: mockPrincipal,
      boundary: mockBoundary,
      authority: mockAuthority,
      request_context: { selected_at: "2026-04-03T00:00:00Z" },
    });

    expect(cmd.task_id).toBe("task-1");
    expect(cmd.idempotency_key).toBe("idem-key-1");
    expect(cmd.expected_task_version).toBe(5);
    expect(cmd.command_type).toBe("task.select_route");
    expect(cmd.principal.principal_id).toBe("user-123");
    expect(cmd.boundary.workspace_id).toBe("ws-456");
  });

  it("automatically computes semantic digest", () => {
    const cmd = buildTaskCommand({
      task_id: "task-1",
      idempotency_key: "idem-key-1",
      expected_task_version: 5,
      command_type: "task.select_route",
      payload: { route_id: "local_repo" },
      principal: mockPrincipal,
      boundary: mockBoundary,
      authority: mockAuthority,
      request_context: {},
    });

    // Digest should be a valid SHA256 hex
    expect(cmd.semantic_digest).toMatch(/^[a-f0-9]{64}$/);

    // Same payload should always produce same digest
    const cmd2 = buildTaskCommand({
      task_id: "task-2",
      idempotency_key: "idem-key-2",
      expected_task_version: 1,
      command_type: "task.select_route",
      payload: { route_id: "local_repo" },
      principal: mockPrincipal,
      boundary: mockBoundary,
      authority: mockAuthority,
      request_context: {},
    });

    expect(cmd.semantic_digest).toBe(cmd2.semantic_digest);
  });

  it("uses resolved_context if provided, otherwise uses request_context", () => {
    const requestContext = { selected_at: "2026-04-03T00:00:00Z" };
    const resolvedContext = { validated: true, selected_at: "2026-04-03T00:00:00Z" };

    const cmd1 = buildTaskCommand({
      task_id: "task-1",
      idempotency_key: "idem-key-1",
      expected_task_version: 5,
      command_type: "task.select_route",
      payload: { route_id: "local_repo" },
      principal: mockPrincipal,
      boundary: mockBoundary,
      authority: mockAuthority,
      request_context: requestContext,
      resolved_context: resolvedContext,
    });

    expect(cmd1.resolved_context).toEqual(resolvedContext);

    const cmd2 = buildTaskCommand({
      task_id: "task-2",
      idempotency_key: "idem-key-2",
      expected_task_version: 5,
      command_type: "task.select_route",
      payload: { route_id: "local_repo" },
      principal: mockPrincipal,
      boundary: mockBoundary,
      authority: mockAuthority,
      request_context: requestContext,
    });

    expect(cmd2.resolved_context).toEqual(requestContext);
  });

  it("preserves payload without modification", () => {
    const payload = {
      route_id: "local_repo",
      route_index: 0,
      extra_metadata: { key: "value" },
    };

    const cmd = buildTaskCommand({
      task_id: "task-1",
      idempotency_key: "idem-key-1",
      expected_task_version: 5,
      command_type: "task.select_route",
      payload,
      principal: mockPrincipal,
      boundary: mockBoundary,
      authority: mockAuthority,
      request_context: {},
    });

    expect(cmd.payload).toEqual(payload);
  });
});
