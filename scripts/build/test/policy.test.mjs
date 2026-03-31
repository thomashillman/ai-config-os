/**
 * policy.test.mjs
 * Unit tests for validate-skill-policy.mjs and load-platforms.mjs.
 * Run with: node --test scripts/build/test/policy.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  validateSkillPolicy,
  validatePlatformPolicy,
} from "../lib/validate-skill-policy.mjs";
import { loadPlatforms } from "../lib/load-platforms.mjs";

// ---------------------------------------------------------------------------
// validateSkillPolicy
// ---------------------------------------------------------------------------

describe("validateSkillPolicy — hook rules", () => {
  const nonHookPlatforms = ["claude-web", "claude-ios", "cursor", "codex"];

  function allExcluded() {
    return Object.fromEntries(
      nonHookPlatforms.map((pid) => [
        pid,
        { mode: "excluded", notes: "No hook surface" },
      ]),
    );
  }

  test("hook skill with all non-hook platforms explicitly excluded → no errors", () => {
    const fm = {
      type: "hook",
      capabilities: { required: [], optional: [] },
      platforms: allExcluded(),
    };
    const { errors } = validateSkillPolicy(fm, "my-hook");
    assert.deepEqual(errors, []);
  });

  test("hook skill missing one exclusion → error mentioning that platform", () => {
    const platforms = allExcluded();
    delete platforms["claude-ios"];
    const fm = {
      type: "hook",
      capabilities: { required: [], optional: [] },
      platforms,
    };
    const { errors } = validateSkillPolicy(fm, "my-hook");
    assert.ok(
      errors.some((e) => e.includes("claude-ios")),
      `Expected error about claude-ios, got: ${errors}`,
    );
  });

  test("hook skill with a non-hook platform entry but wrong mode → error", () => {
    const platforms = allExcluded();
    platforms["cursor"] = { mode: "degraded" };
    const fm = {
      type: "hook",
      capabilities: { required: [], optional: [] },
      platforms,
    };
    const { errors } = validateSkillPolicy(fm, "my-hook");
    assert.ok(
      errors.some((e) => e.includes("cursor")),
      `Expected error about cursor, got: ${errors}`,
    );
  });

  test("hook skill with no platforms block → error", () => {
    const fm = { type: "hook", capabilities: { required: [], optional: [] } };
    const { errors } = validateSkillPolicy(fm, "my-hook");
    assert.ok(
      errors.some((e) => e.includes("'platforms' block")),
      `Expected platforms-block error, got: ${errors}`,
    );
  });

  test("non-hook skill with no platforms block → no errors", () => {
    const fm = { type: "prompt", capabilities: { required: [], optional: [] } };
    const { errors } = validateSkillPolicy(fm, "my-prompt");
    assert.deepEqual(errors, []);
  });
});

describe("validateSkillPolicy — capability rules", () => {
  test("legacy flat capabilities array → error", () => {
    const fm = { type: "prompt", capabilities: ["git.read"] };
    const { errors } = validateSkillPolicy(fm, "x");
    assert.ok(errors.some((e) => e.includes("Legacy flat capabilities")));
  });

  test("overlapping required and optional → error", () => {
    const fm = {
      type: "prompt",
      capabilities: {
        required: ["git.read", "fs.write"],
        optional: ["git.read"],
      },
    };
    const { errors } = validateSkillPolicy(fm, "x");
    assert.ok(errors.some((e) => e.includes("git.read")));
  });

  test("unknown platform with knownPlatforms set → error", () => {
    const fm = {
      type: "prompt",
      capabilities: { required: [], optional: [] },
      platforms: { "phantom-os": { mode: "native" } },
    };
    const { errors } = validateSkillPolicy(
      fm,
      "x",
      new Set(["claude-code", "cursor"]),
    );
    assert.ok(errors.some((e) => e.includes("phantom-os")));
  });

  test("mode=excluded + allow_unverified=true → error", () => {
    const fm = {
      type: "prompt",
      capabilities: { required: [], optional: [] },
      platforms: { "claude-web": { mode: "excluded", allow_unverified: true } },
    };
    const { errors } = validateSkillPolicy(fm, "x");
    assert.ok(errors.some((e) => e.includes("allow_unverified")));
  });
  test("unknown tool dependency with registeredTools set → error", () => {
    const fm = {
      type: "prompt",
      capabilities: { required: [], optional: [] },
      dependencies: { tools: ["ghost-tool"] },
    };
    const { errors } = validateSkillPolicy(
      fm,
      "x",
      new Set(),
      new Set(["codex", "cursor"]),
    );
    assert.ok(errors.some((e) => e.includes("Unknown tool dependency")));
  });

  test("known tool dependency with registeredTools set → no errors", () => {
    const fm = {
      type: "prompt",
      capabilities: { required: [], optional: [] },
      dependencies: { tools: ["codex"] },
    };
    const { errors } = validateSkillPolicy(
      fm,
      "x",
      new Set(),
      new Set(["codex", "cursor"]),
    );
    assert.equal(
      errors.some((e) => e.includes("Unknown tool dependency")),
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// validatePlatformPolicy
// ---------------------------------------------------------------------------

describe("validatePlatformPolicy", () => {
  test("id matches filename → no errors", () => {
    const { errors } = validatePlatformPolicy(
      { id: "claude-code" },
      "claude-code",
    );
    assert.deepEqual(errors, []);
  });

  test("id mismatches filename → error", () => {
    const { errors } = validatePlatformPolicy(
      { id: "claude-web" },
      "claude-code",
    );
    assert.ok(
      errors.some((e) => e.includes("claude-web") && e.includes("claude-code")),
    );
  });

  test("no id field → no errors (id is optional in policy; schema catches missing id)", () => {
    const { errors } = validatePlatformPolicy({}, "claude-code");
    assert.deepEqual(errors, []);
  });
});

// ---------------------------------------------------------------------------
// loadPlatforms
// ---------------------------------------------------------------------------

describe("loadPlatforms", () => {
  test("missing platform directory → error in errors array, not thrown", async () => {
    const fakeRoot = mkdtempSync(join(tmpdir(), "ai-config-test-"));
    const { platforms, errors } = await loadPlatforms(fakeRoot);
    assert.equal(platforms.size, 0);
    assert.ok(errors.length > 0, "Expected at least one error");
    assert.ok(
      errors.some((e) => e.includes("Platform directory not found")),
      `Expected missing-dir error, got: ${errors}`,
    );
  });

  test("valid platform yaml → populated Map, no errors", async () => {
    const fakeRoot = mkdtempSync(join(tmpdir(), "ai-config-test-"));
    const platformDir = join(fakeRoot, "shared", "targets", "platforms");
    mkdirSync(platformDir, { recursive: true });
    writeFileSync(
      join(platformDir, "test-platform.yaml"),
      "id: test-platform\ncapabilities:\n  git.read: { status: supported }\n",
    );
    const { platforms, errors } = await loadPlatforms(fakeRoot);
    assert.deepEqual(errors, []);
    assert.ok(platforms.has("test-platform"));
  });

  test("repo platform registry resolves claude-ssh definition", async () => {
    const { platforms, errors } = await loadPlatforms(resolve(process.cwd()));
    assert.deepEqual(errors, []);
    assert.ok(platforms.has("claude-ssh"));
    assert.equal(platforms.get("claude-ssh")?.surface, "remote-shell");
  });

  test("yaml with id mismatch → error, platform not loaded", async () => {
    const fakeRoot = mkdtempSync(join(tmpdir(), "ai-config-test-"));
    const platformDir = join(fakeRoot, "shared", "targets", "platforms");
    mkdirSync(platformDir, { recursive: true });
    writeFileSync(
      join(platformDir, "test-platform.yaml"),
      "id: wrong-id\ncapabilities:\n  git.read: { status: supported }\n",
    );
    const { platforms, errors } = await loadPlatforms(fakeRoot);
    assert.ok(errors.length > 0);
    assert.ok(!platforms.has("test-platform"));
  });

  test("yaml missing id field → error", async () => {
    const fakeRoot = mkdtempSync(join(tmpdir(), "ai-config-test-"));
    const platformDir = join(fakeRoot, "shared", "targets", "platforms");
    mkdirSync(platformDir, { recursive: true });
    writeFileSync(
      join(platformDir, "test-platform.yaml"),
      "capabilities: {}\n",
    );
    const { platforms, errors } = await loadPlatforms(fakeRoot);
    assert.ok(errors.some((e) => e.includes("missing 'id'")));
    assert.equal(platforms.size, 0);
  });

  test("loadPlatforms is async and returns a Promise", async () => {
    const fakeRoot = mkdtempSync(join(tmpdir(), "ai-config-test-"));
    const result = loadPlatforms(fakeRoot);
    assert.ok(result instanceof Promise, "loadPlatforms must return a Promise");
    await result;
  });

  test("loads multiple platform yaml files concurrently → all entries in Map", async () => {
    const fakeRoot = mkdtempSync(join(tmpdir(), "ai-config-test-"));
    const platformDir = join(fakeRoot, "shared", "targets", "platforms");
    mkdirSync(platformDir, { recursive: true });
    writeFileSync(join(platformDir, "alpha.yaml"), "id: alpha\n");
    writeFileSync(join(platformDir, "beta.yaml"), "id: beta\n");

    const { platforms, errors } = await loadPlatforms(fakeRoot);

    assert.deepEqual(errors, []);
    assert.strictEqual(platforms.size, 2);
    assert.ok(platforms.has("alpha"));
    assert.ok(platforms.has("beta"));
  });
});
