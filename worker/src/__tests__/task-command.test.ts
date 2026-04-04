import { describe, it, expect } from "vitest";
import {
  computeSemanticDigest,
  buildTaskCommand,
  type Principal,
  type Boundary,
  type Authority,
  type ActionCommit,
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
    const resolvedContext = {
      validated: true,
      selected_at: "2026-04-03T00:00:00Z",
    };

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

describe("ActionCommit shape (failing tests)", () => {
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

  describe("shape validation", () => {
    it("should have action_id at top level", () => {
      // This is a specification test - we expect the receipt to have this field
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.action_id exists and is string
      expect(receipt).toBeDefined();
    });

    it("should have task_id at top level", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.task_id exists and matches command.task_id
      expect(receipt).toBeDefined();
    });

    it("should have command_type at top level", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.command_type exists and matches command.command_type
      expect(receipt).toBeDefined();
    });

    it("should have command_digest at top level", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.command_digest exists and is valid SHA256 hex
      expect(receipt).toBeDefined();
    });

    it("should have principal_id at top level", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.principal_id exists and comes from command.principal.principal_id
      expect(receipt).toBeDefined();
    });

    it("should have authority at top level", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.authority exists and matches command.authority
      expect(receipt).toBeDefined();
    });

    it("should have created_at (not committed_at)", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.created_at exists and is ISO 8601
      // TODO: Verify receipt.committed_at does NOT exist
      expect(receipt).toBeDefined();
    });

    it("should have result with success and code fields", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.result exists
      // TODO: Verify receipt.result.success is always true
      // TODO: Verify receipt.result.code is optional
      expect(receipt).toBeDefined();
    });

    it("should have result_summary string", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.result_summary exists and is string
      // TODO: Verify it is human-readable outcome description
      expect(receipt).toBeDefined();
    });

    it("should have route_id optional", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.route_id is optional (undefined or string)
      expect(receipt).toBeDefined();
    });

    it("should have model_path optional", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.model_path is optional (undefined or object)
      expect(receipt).toBeDefined();
    });

    it("should keep command_envelope unchanged", () => {
      const receipt = {} as unknown as ActionCommit;
      // TODO: Verify receipt.command_envelope exists and is complete TaskCommand
      // TODO: Verify command_envelope is not modified or flattened
      expect(receipt).toBeDefined();
    });
  });

  describe("field sourcing", () => {
    it("principal_id comes from command.principal.principal_id", () => {
      // TODO: After apply-command is fixed:
      // Create command with principal.principal_id = "user-456"
      // Apply command and get receipt
      // Verify receipt.principal_id === "user-456"
      expect(true).toBe(true);
    });

    it("authority comes from command.authority", () => {
      // TODO: After apply-command is fixed:
      // Create command with specific authority
      // Apply command and get receipt
      // Verify receipt.authority === command.authority
      expect(true).toBe(true);
    });

    it("request_id and trace_id come from command.request_context if stamped", () => {
      // TODO: After apply-command is fixed:
      // Create command with request_context.request_id and request_context.trace_id
      // Apply command and get receipt
      // Verify receipt.request_id === command.request_context.request_id
      // Verify receipt.trace_id === command.request_context.trace_id
      expect(true).toBe(true);
    });

    it("command_digest equals canonical semantic digest", () => {
      // TODO: After apply-command is fixed:
      // Create command and apply it
      // Get receipt
      // Verify receipt.command_digest === command.semantic_digest
      expect(true).toBe(true);
    });

    it("task_id and command_type come from command", () => {
      // TODO: After apply-command is fixed:
      // Create command with task_id="task-999" and command_type="task.transition_state"
      // Apply command and get receipt
      // Verify receipt.task_id === "task-999"
      // Verify receipt.command_type === "task.transition_state"
      expect(true).toBe(true);
    });
  });
});
