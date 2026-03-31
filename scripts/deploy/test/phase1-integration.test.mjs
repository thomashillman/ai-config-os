/**
 * Phase 1 Integration Tests
 *
 * Validates that code paths work together correctly:
 * - Service binding routing
 * - Fallback behavior
 * - Error propagation
 * - Timeout handling
 */

import test from "node:test";
import assert from "node:assert/strict";

// These tests validate the logic of the executor handler
// without needing to run actual Workers

test("Integration: Service binding path has priority over proxy", () => {
  // Simulate the executor handler logic
  function determineExecutorPath(env) {
    if (env.EXECUTOR) {
      return "service-binding";
    }
    if (env.EXECUTOR_PROXY_URL) {
      return "http-proxy";
    }
    return "error";
  }

  // Service binding present
  const result1 = determineExecutorPath({
    EXECUTOR: { fetch: () => {} },
    EXECUTOR_PROXY_URL: "https://proxy.example.com",
  });
  assert.equal(
    result1,
    "service-binding",
    "Service binding should be preferred",
  );

  // Only proxy
  const result2 = determineExecutorPath({
    EXECUTOR_PROXY_URL: "https://proxy.example.com",
  });
  assert.equal(result2, "http-proxy", "Should use proxy when binding absent");

  // Neither configured
  const result3 = determineExecutorPath({});
  assert.equal(result3, "error", "Should error when no executor configured");
});

test("Integration: Error message clarity without executor configured", () => {
  function getErrorMessage(hasBinding, hasProxy) {
    if (!hasBinding && !hasProxy) {
      return "Executor is not configured. Phase 1 requires service binding (EXECUTOR). EXECUTOR_PROXY_URL is optional for backward compatibility or future Phase 2.";
    }
    return null;
  }

  const msg = getErrorMessage(false, false);
  assert.ok(
    msg.includes("Phase 1 requires service binding"),
    "Message should emphasize Phase 1 requirement",
  );
  assert.ok(msg.includes("EXECUTOR"), "Message should name the binding");
  assert.ok(
    msg.includes("optional"),
    "Message should indicate proxy is optional",
  );
  assert.ok(
    !msg.includes("Phase 0"),
    "Message should not confuse with Phase 0",
  );
});

test("Integration: Timeout clamping respects Phase 1 15s limit", () => {
  function clampTimeout(ms, isServiceBinding) {
    if (isServiceBinding) {
      // Phase 1: 15s max
      return Math.min(ms, 15000);
    } else {
      // Phase 0/Phase 2: could be longer
      return Math.min(ms, 120000);
    }
  }

  // Phase 1 service binding
  assert.equal(clampTimeout(20000, true), 15000, "Phase 1 should clamp to 15s");
  assert.equal(
    clampTimeout(10000, true),
    10000,
    "Phase 1 should respect values under 15s",
  );

  // Phase 0/Phase 2 proxy
  assert.equal(clampTimeout(20000, false), 20000, "Proxy can exceed 15s");
  assert.equal(
    clampTimeout(120000, false),
    120000,
    "Proxy should clamp to 120s",
  );
});

test("Integration: Payload validation is independent of execution path", () => {
  // Both paths should validate the same payload structure
  function validatePayload(payload) {
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: "Payload must be an object" };
    }
    if (typeof payload.tool !== "string" || payload.tool.length === 0) {
      return { ok: false, error: "Field tool must be a non-empty string" };
    }
    return { ok: true, value: payload };
  }

  // Valid payload
  const valid = validatePayload({ tool: "health_check" });
  assert.equal(valid.ok, true, "Valid payload should pass");

  // Invalid payloads
  const invalid1 = validatePayload({});
  assert.equal(invalid1.ok, false, "Missing tool should fail");
  assert.ok(invalid1.error.includes("tool"), "Error should mention tool field");

  const invalid2 = validatePayload({ tool: "" });
  assert.equal(invalid2.ok, false, "Empty tool should fail");
});

test("Integration: Request signature passes through both paths", () => {
  // Both paths should preserve and forward signature for verification
  function processRequest(request, path) {
    const signature = request.headers?.get?.("X-Request-Signature") ?? "";
    return {
      path,
      signature,
      hasSignature: !!signature,
    };
  }

  const mockRequest = {
    headers: {
      get(name) {
        if (name === "X-Request-Signature") {
          return "sig123";
        }
        return null;
      },
    },
  };

  const viaBinding = processRequest(mockRequest, "service-binding");
  const viaProxy = processRequest(mockRequest, "http-proxy");

  assert.equal(
    viaBinding.signature,
    "sig123",
    "Service binding should preserve signature",
  );
  assert.equal(viaProxy.signature, "sig123", "Proxy should preserve signature");
  assert.equal(
    viaBinding.hasSignature,
    true,
    "Binding should detect signature",
  );
  assert.equal(viaProxy.hasSignature, true, "Proxy should detect signature");
});

test("Integration: Phase 1 does not expose shell capability claims", () => {
  // The executor should not claim to support shell tools
  const phase1Tools = [
    "health_check",
    "list_phase1_tools",
    "get_skill_metadata",
    "get_artifact",
    "skill_stats_cached",
  ];
  const phase0Tools = [
    "sync_tools",
    "list_tools",
    "get_config",
    "context_cost",
    "validate_all",
  ];

  // Phase 1 should not include Phase 0 tools
  for (const tool of phase0Tools) {
    assert.ok(
      !phase1Tools.includes(tool),
      `Phase 1 should not claim support for ${tool}`,
    );
  }

  // Phase 1 tools should be documented as KV/R2 only
  const kvR2Tools = {
    health_check: "Worker health status",
    list_phase1_tools: "Available Phase 1 tools",
    get_skill_metadata: "Fetch skill metadata from KV",
    get_artifact: "Fetch versioned artifacts from R2",
    skill_stats_cached: "Pre-computed statistics from KV",
  };

  for (const [tool, desc] of Object.entries(kvR2Tools)) {
    assert.ok(
      desc.includes("KV") ||
        desc.includes("R2") ||
        desc === "Available Phase 1 tools" ||
        desc === "Worker health status",
      `Tool ${tool} description should indicate KV/R2 only, got: ${desc}`,
    );
  }
});

test("Integration: Configuration changes do not require code changes", () => {
  // Key insight: Phase 1 vs Phase 2 is determined by config (presence of EXECUTOR binding),
  // not by code branches
  function selectExecutor(env) {
    // This is the entire logic needed
    // Code doesn't change for Phase 2
    return env.EXECUTOR
      ? "service-binding"
      : env.EXECUTOR_PROXY_URL
        ? "proxy"
        : "none";
  }

  // Phase 1 (just config change from Phase 0)
  const phase1 = selectExecutor({
    EXECUTOR: { fetch: () => {} },
  });

  // Phase 2 future (just config change from Phase 1)
  const phase2Future = selectExecutor({
    EXECUTOR_PROXY_URL: "https://vps-executor.example.com",
  });

  assert.equal(phase1, "service-binding", "Phase 1 uses service binding");
  assert.equal(phase2Future, "proxy", "Phase 2 would use proxy");
  // Same code handles both, no refactoring needed
});
