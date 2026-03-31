import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Test suite for Phase 1 executor tool acceptance/rejection
 *
 * Phase 1 is Cloudflare-only with a limited tool set:
 * - health_check, list_phase1_tools, get_skill_metadata, get_artifact, skill_stats_cached
 *
 * All Phase 0 tools are rejected with 403 TOOL_NOT_SUPPORTED:
 * - sync_tools, list_tools, get_config, context_cost, validate_all
 */

// Mock Phase 1 executor handler
async function mockPhase1ExecutorHandler(payload) {
  const PHASE1_TOOLS = [
    "health_check",
    "list_phase1_tools",
    "get_skill_metadata",
    "get_artifact",
    "skill_stats_cached",
  ];

  const PHASE0_TOOLS = [
    "sync_tools",
    "list_tools",
    "get_config",
    "context_cost",
    "validate_all",
  ];

  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_REQUEST",
        message: "Payload must be a JSON object",
      },
    };
  }

  const { tool, args, request_id } = payload;

  if (!tool || typeof tool !== "string" || tool.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_REQUEST",
        message: "Tool must be a non-empty string",
      },
    };
  }

  // Reject Phase 0 tools explicitly
  if (PHASE0_TOOLS.includes(tool)) {
    return {
      ok: false,
      status: 403,
      error: {
        code: "TOOL_NOT_SUPPORTED",
        message: `Tool '${tool}' is not supported in Phase 1. Currently supported: ${PHASE1_TOOLS.join(", ")}`,
      },
      request_id,
    };
  }

  // Reject unknown tools
  if (!PHASE1_TOOLS.includes(tool)) {
    return {
      ok: false,
      status: 403,
      error: {
        code: "TOOL_NOT_SUPPORTED",
        message: `Tool '${tool}' is not supported in Phase 1. Currently supported: ${PHASE1_TOOLS.join(", ")}`,
      },
      request_id,
    };
  }

  // Accept Phase 1 tools (mock implementations)
  switch (tool) {
    case "health_check":
      return {
        ok: true,
        status: 200,
        result: {
          status: "healthy",
          service: "executor",
          timestamp: new Date().toISOString(),
        },
        request_id,
      };

    case "list_phase1_tools":
      return {
        ok: true,
        status: 200,
        result: PHASE1_TOOLS,
        request_id,
      };

    case "get_skill_metadata":
      // Mock: return cached metadata from KV
      const skillId = args?.[0];
      if (!skillId) {
        return {
          ok: false,
          status: 400,
          error: {
            code: "INVALID_REQUEST",
            message: "get_skill_metadata requires skill_id argument",
          },
          request_id,
        };
      }
      // Mock success
      return {
        ok: true,
        status: 200,
        result: {
          skill: skillId,
          description: "Mock skill metadata",
          cached: true,
        },
        request_id,
      };

    case "get_artifact":
      // Mock: return artifact from R2
      const [version, name] = args || [];
      if (!version || !name) {
        return {
          ok: false,
          status: 400,
          error: {
            code: "INVALID_REQUEST",
            message: "get_artifact requires version and name arguments",
          },
          request_id,
        };
      }
      // Mock success
      return {
        ok: true,
        status: 200,
        result: {
          version,
          artifact: name,
          data: {},
        },
        request_id,
      };

    case "skill_stats_cached":
      return {
        ok: true,
        status: 200,
        result: {
          total_skills: 42,
          latest_version: "1.0.0",
          cached: true,
          updated_at: new Date().toISOString(),
        },
        request_id,
      };

    default:
      return {
        ok: false,
        status: 403,
        error: { code: "TOOL_NOT_SUPPORTED", message: `Unknown tool: ${tool}` },
        request_id,
      };
  }
}

// UNIT TEST CASES

/**
 * Phase 1 tool acceptance tests
 */

test("Phase 1 executor: accept health_check", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "health_check",
    request_id: "test-1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.ok(result.result);
  assert.equal(result.result.status, "healthy");
  assert.equal(result.request_id, "test-1");
});

test("Phase 1 executor: accept list_phase1_tools", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "list_phase1_tools",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.result));
  assert.deepEqual(result.result, [
    "health_check",
    "list_phase1_tools",
    "get_skill_metadata",
    "get_artifact",
    "skill_stats_cached",
  ]);
});

test("Phase 1 executor: accept get_skill_metadata with valid skill_id", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "get_skill_metadata",
    args: ["test-skill"],
    request_id: "test-2",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.ok(result.result);
  assert.equal(result.result.skill, "test-skill");
  assert.equal(result.request_id, "test-2");
});

test("Phase 1 executor: accept get_artifact with version and name", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "get_artifact",
    args: ["1.0.0", "manifest.json"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.ok(result.result);
  assert.equal(result.result.version, "1.0.0");
  assert.equal(result.result.artifact, "manifest.json");
});

test("Phase 1 executor: accept skill_stats_cached", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "skill_stats_cached",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.ok(result.result);
  assert.ok(result.result.total_skills);
  assert.equal(result.result.cached, true);
});

test("Phase 1 executor: REJECT sync_tools (Phase 0)", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "sync_tools",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error.code, "TOOL_NOT_SUPPORTED");
  assert.match(result.error.message, /sync_tools/);
});

test("Phase 1 executor: REJECT list_tools (Phase 0)", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "list_tools",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error.code, "TOOL_NOT_SUPPORTED");
  assert.match(result.error.message, /list_tools/);
});

test("Phase 1 executor: REJECT get_config (Phase 0)", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "get_config",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error.code, "TOOL_NOT_SUPPORTED");
});

test("Phase 1 executor: REJECT context_cost (Phase 0)", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "context_cost",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error.code, "TOOL_NOT_SUPPORTED");
});

test("Phase 1 executor: REJECT validate_all (Phase 0)", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "validate_all",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error.code, "TOOL_NOT_SUPPORTED");
});

test("Phase 1 executor: REJECT unknown tool", async () => {
  const result = await mockPhase1ExecutorHandler({
    tool: "unknown_tool",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error.code, "TOOL_NOT_SUPPORTED");
  assert.match(result.error.message, /unknown_tool/);
});
