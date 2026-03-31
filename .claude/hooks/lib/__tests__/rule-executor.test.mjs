/**
 * Rule Executor Tests
 *
 * Tests rule registry, dispatch, and error handling.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { RuleExecutor } from "../rule-executor.mjs";
import * as fixtures from "./fixtures.mjs";

// Mock rules for testing
const mockRules = {
  allowRule: {
    name: "allowRule",
    triggers: ["PreToolUse"],
    execute: async () => ({ decision: "allow" }),
  },

  blockRule: {
    name: "blockRule",
    triggers: ["PreToolUse"],
    execute: async () => ({
      decision: "block",
      reason: "Test block",
    }),
  },

  postToolRule: {
    name: "postToolRule",
    triggers: ["PostToolUse"],
    execute: async (event) => ({
      decision: "allow",
      metadata: { tool: event.tool_name },
    }),
  },

  errorRule: {
    name: "errorRule",
    triggers: ["PreToolUse"],
    execute: async () => {
      throw new Error("Test rule error");
    },
  },

  slowRule: {
    name: "slowRule",
    triggers: ["PreToolUse"],
    execute: async () => {
      return { decision: "allow" };
    },
  },
};

test("RuleExecutor - dispatches to matching rules", async () => {
  const registry = {
    allowRule: mockRules.allowRule,
    blockRule: mockRules.blockRule,
  };
  const executor = new RuleExecutor(registry);
  const event = fixtures.preToolUseFixtures.skillInvocation;

  const results = await executor.dispatch(event);

  assert.equal(results.length, 2);
  assert.equal(results[0].ruleName, "allowRule");
  assert.equal(results[0].decision, "allow");
  assert.equal(results[1].ruleName, "blockRule");
  assert.equal(results[1].decision, "block");
});

test("RuleExecutor - skips non-matching rules", async () => {
  const registry = {
    preToolRule: mockRules.allowRule,
    postToolRule: mockRules.postToolRule,
  };
  const executor = new RuleExecutor(registry);
  const event = fixtures.preToolUseFixtures.skillInvocation; // PreToolUse event

  const results = await executor.dispatch(event);

  // Only preToolRule should execute
  assert.equal(results.length, 1);
  assert.equal(results[0].ruleName, "preToolRule");
});

test("RuleExecutor - collects rule metadata", async () => {
  const registry = { postToolRule: mockRules.postToolRule };
  const executor = new RuleExecutor(registry);
  const event = fixtures.postToolUseFixtures.bashSuccess;

  const results = await executor.dispatch(event);

  assert.equal(results.length, 1);
  assert.equal(results[0].metadata.tool, "Bash");
});

test("RuleExecutor - handles rule errors gracefully", async () => {
  const registry = {
    errorRule: mockRules.errorRule,
    allowRule: mockRules.allowRule,
  };
  const executor = new RuleExecutor(registry);
  const event = fixtures.preToolUseFixtures.skillInvocation;

  // Should not throw; should continue to next rule
  const results = await executor.dispatch(event);

  assert.equal(results.length, 2);
  // First rule failed
  assert.equal(results[0].decision, "allow"); // Fallback to allow
  assert.ok(results[0].error); // Error recorded
  // Second rule succeeded
  assert.equal(results[1].decision, "allow");
});

test("RuleExecutor.getBlockingResult - finds block decision", () => {
  const results = [
    { ruleName: "rule1", decision: "allow" },
    { ruleName: "rule2", decision: "block", reason: "Blocked" },
  ];

  const blockingResult = RuleExecutor.getBlockingResult(results);

  assert.ok(blockingResult);
  assert.equal(blockingResult.ruleName, "rule2");
  assert.equal(blockingResult.reason, "Blocked");
});

test("RuleExecutor.getBlockingResult - returns null if no block", () => {
  const results = [
    { ruleName: "rule1", decision: "allow" },
    { ruleName: "rule2", decision: "allow" },
  ];

  const blockingResult = RuleExecutor.getBlockingResult(results);

  assert.equal(blockingResult, null);
});

test("RuleExecutor - dispatches to all event types", async () => {
  const registry = {
    preToolRule: mockRules.allowRule,
    postToolRule: mockRules.postToolRule,
  };
  const executor = new RuleExecutor(registry);

  // Test PreToolUse
  let results = await executor.dispatch(
    fixtures.preToolUseFixtures.skillInvocation,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].ruleName, "preToolRule");

  // Test PostToolUse
  results = await executor.dispatch(fixtures.postToolUseFixtures.bashSuccess);
  assert.equal(results.length, 1);
  assert.equal(results[0].ruleName, "postToolRule");
});

test("RuleExecutor - rejects null event", async () => {
  const registry = { allowRule: mockRules.allowRule };
  const executor = new RuleExecutor(registry);

  assert.rejects(() => executor.dispatch(null), /Event is required/);
});

test("RuleExecutor - rejects event without type", async () => {
  const registry = { allowRule: mockRules.allowRule };
  const executor = new RuleExecutor(registry);

  assert.rejects(() => executor.dispatch({}), /must have a type field/);
});

test("RuleExecutor - handles empty registry", async () => {
  const executor = new RuleExecutor({});
  const event = fixtures.preToolUseFixtures.skillInvocation;

  const results = await executor.dispatch(event);

  assert.equal(results.length, 0);
});
