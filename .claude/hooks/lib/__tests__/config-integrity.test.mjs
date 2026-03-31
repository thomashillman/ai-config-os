/**
 * Configuration Integrity Tests
 *
 * Verifies that .claude/settings.json routes to exactly one implementation per concern,
 * and that no old shell scripts remain referenced.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "path";

// Load settings.json
const settingsPath = resolve(process.cwd(), ".claude", "settings.json");
let settings = {};

if (existsSync(settingsPath)) {
  const content = readFileSync(settingsPath, "utf8");
  settings = JSON.parse(content);
}

test("config-integrity - settings.json exists", () => {
  assert.ok(existsSync(settingsPath), ".claude/settings.json should exist");
});

test("config-integrity - has hooks configuration", () => {
  assert.ok(settings.hooks, "Settings should have hooks section");
});

test("config-integrity - no old shell scripts are referenced", () => {
  const oldScripts = [
    "log-skill-usage.sh",
    "log-tool-inefficiencies.sh",
    "skill-outcome-tracker.sh",
    "post-tool-use-metrics.sh",
  ];

  const settingsJson = JSON.stringify(settings);

  for (const oldScript of oldScripts) {
    assert.ok(
      !settingsJson.includes(oldScript),
      `Settings should not reference old script: ${oldScript}`,
    );
  }
});

test("config-integrity - PreToolUse routes to dispatcher only", () => {
  const preToolUseHooks = settings.hooks?.PreToolUse || [];
  const commands = preToolUseHooks
    .flatMap((h) => h.hooks || [])
    .map((h) => h.command);

  // Should have exactly one route to pre-tool-use.sh
  const dispatcherCount = commands.filter((c) =>
    c.includes("pre-tool-use.sh"),
  ).length;
  assert.equal(
    dispatcherCount,
    1,
    "PreToolUse should route to exactly one pre-tool-use.sh",
  );

  // Should not have any direct analytics script routes
  assert.ok(
    !commands.some((c) => c.includes("log-skill-usage.sh")),
    "PreToolUse should not route directly to log-skill-usage.sh",
  );
});

test("config-integrity - PostToolUse routes to dispatcher only", () => {
  const postToolUseHooks = settings.hooks?.PostToolUse || [];
  const commands = postToolUseHooks
    .flatMap((h) => h.hooks || [])
    .map((h) => h.command);

  // Should have exactly one route to post-tool-use.sh
  const dispatcherCount = commands.filter((c) =>
    c.includes("post-tool-use.sh"),
  ).length;
  assert.equal(
    dispatcherCount,
    1,
    "PostToolUse should route to exactly one post-tool-use.sh",
  );

  // Should not have any direct analytics script routes
  assert.ok(
    !commands.some((c) => c.includes("log-tool-inefficiencies.sh")),
    "PostToolUse should not route directly to log-tool-inefficiencies.sh",
  );

  assert.ok(
    !commands.some((c) => c.includes("skill-outcome-tracker.sh")),
    "PostToolUse should not route directly to skill-outcome-tracker.sh",
  );
});

test("config-integrity - SessionStart routes to session-start.sh", () => {
  const sessionStartHooks = settings.hooks?.SessionStart || [];
  const commands = sessionStartHooks
    .flatMap((h) => h.hooks || [])
    .map((h) => h.command);

  assert.ok(
    commands.some((c) => c.includes("session-start.sh")),
    "SessionStart should route to session-start.sh",
  );
});

test("config-integrity - all commands are quoted", () => {
  const allHooks = [
    ...(settings.hooks?.PreToolUse || []),
    ...(settings.hooks?.PostToolUse || []),
    ...(settings.hooks?.SessionStart || []),
  ];

  const commands = allHooks
    .flatMap((h) => h.hooks || [])
    .map((h) => h.command)
    .filter((c) => c);

  for (const command of commands) {
    assert.ok(
      command.startsWith('"') && command.endsWith('"'),
      `Command should be quoted: ${command}`,
    );
  }
});

test("config-integrity - no unquoted $CLAUDE_PROJECT_DIR", () => {
  const settingsJson = JSON.stringify(settings);

  // Look for unquoted references (hacky but effective for detection)
  // This is a soft check since JSON structure already requires quotes
  const lines = readFileSync(settingsPath, "utf8").split("\n");

  // Check raw file for patterns like: "command": $CLAUDE_PROJECT_DIR/...
  for (const line of lines) {
    if (line.includes("$CLAUDE_PROJECT_DIR") && line.includes("command")) {
      // Should have quotes around the whole path
      const colonIndex = line.indexOf(":");
      if (colonIndex > -1) {
        const afterColon = line.substring(colonIndex + 1).trim();
        assert.ok(
          afterColon.startsWith('"'),
          `Command path should be quoted: ${line}`,
        );
      }
    }
  }
});

test("config-integrity - dispatcher scripts exist", () => {
  const preToolUsePath = resolve(
    process.cwd(),
    ".claude",
    "hooks",
    "pre-tool-use.sh",
  );
  const postToolUsePath = resolve(
    process.cwd(),
    ".claude",
    "hooks",
    "post-tool-use.sh",
  );

  assert.ok(existsSync(preToolUsePath), "pre-tool-use.sh should exist");
  assert.ok(existsSync(postToolUsePath), "post-tool-use.sh should exist");
});

test("config-integrity - dispatcher.mjs exists", () => {
  const dispatcherPath = resolve(
    process.cwd(),
    ".claude",
    "hooks",
    "dispatch.mjs",
  );
  assert.ok(existsSync(dispatcherPath), "dispatch.mjs should exist");
});

test("config-integrity - no duplicate hook routes per event type", () => {
  const eventTypes = Object.keys(settings.hooks || {});

  for (const eventType of eventTypes) {
    const hooks = settings.hooks[eventType] || [];

    // Count unique command paths
    const commandSet = new Set();
    const commandList = [];

    for (const hook of hooks) {
      const commands = (hook.hooks || []).map((h) => h.command);
      for (const cmd of commands) {
        commandList.push(cmd);
        commandSet.add(cmd);
      }
    }

    // For most events, should have exactly one dispatcher route
    // (SessionStart might have other routes if defined)
    if (eventType !== "SessionStart") {
      assert.equal(
        commandList.length,
        commandSet.size,
        `${eventType} should not have duplicate command routes`,
      );
    }
  }
});

test("config-integrity - single source of truth for each concern", () => {
  // Map concerns to implementation locations
  const concerns = {
    skill_invocation_logging: "log-skill-usage.mjs",
    tool_inefficiency_detection: "log-tool-inefficiencies.mjs",
    skill_outcome_tracking: "skill-outcome-tracker.mjs",
    protected_path_guard: "pre-tool-use-guard.mjs",
  };

  const rulesIndexPath = resolve(
    process.cwd(),
    ".claude",
    "hooks",
    "lib",
    "rules",
    "index.mjs",
  );
  const rulesIndexContent = readFileSync(rulesIndexPath, "utf8");

  // Verify each concern is implemented in rules, not as separate shell scripts
  for (const [concern, implementation] of Object.entries(concerns)) {
    assert.ok(
      rulesIndexContent.includes(implementation),
      `Rules index should import ${implementation} for ${concern}`,
    );

    const settingsContent = JSON.stringify(settings);
    // Should not have separate shell script for this concern
    const shellVersion = implementation.replace(".mjs", ".sh");
    assert.ok(
      !settingsContent.includes(shellVersion),
      `Settings should not directly route to ${shellVersion} (should use dispatcher)`,
    );
  }
});
