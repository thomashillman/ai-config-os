/**
 * mcp-security.test.mjs
 * Security smoke tests for MCP server input validation.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolve, sep } from "node:path";

// Import validators (standalone module, no heavy MCP deps)
import {
  validateName,
  validateNumber,
} from "../../../runtime/mcp/validators.mjs";
import { isCommandNameSafe } from "../../../runtime/adapters/shell-safe.mjs";
import { resolveRepoScriptPath } from "../../../runtime/mcp/path-utils.mjs";

// ---------------------------------------------------------------------------
// validateName
// ---------------------------------------------------------------------------

describe("validateName — rejects shell metacharacters", () => {
  const malicious = [
    "; rm -rf /",
    "foo; whoami",
    "test$(id)",
    "test`id`",
    "foo | cat /etc/passwd",
    "foo & bg",
    "foo\nbar",
    "../../../etc/passwd",
    "",
    " ",
    "UPPERCASE",
    "-starts-with-dash",
  ];

  for (const input of malicious) {
    test(`rejects: ${JSON.stringify(input)}`, () => {
      assert.throws(() => validateName(input), /Invalid name/);
    });
  }
});

describe("validateName — accepts valid names", () => {
  const valid = [
    "my-server",
    "foo_bar",
    "blockscout",
    "web-search",
    "a1",
    "mcp-server-v2",
  ];

  for (const input of valid) {
    test(`accepts: ${input}`, () => {
      assert.equal(validateName(input), input);
    });
  }
});

// ---------------------------------------------------------------------------
// isCommandNameSafe — validates MCP server command names
// ---------------------------------------------------------------------------

describe("isCommandNameSafe — rejects unsafe command values", () => {
  const unsafe = [
    "/bin/sh",
    "cmd;whoami",
    "node --eval",
    "npx && rm",
    'python -c "import os"',
    "../bin/node",
    "cmd.exe",
    "",
  ];

  for (const input of unsafe) {
    test(`rejects: ${JSON.stringify(input)}`, () => {
      assert.equal(isCommandNameSafe(input), false);
    });
  }
});

describe("isCommandNameSafe — accepts valid command names", () => {
  const valid = [
    "npx",
    "node",
    "python3",
    "uvx",
    "bash",
    "deno",
    "mcp-server",
    "my_tool",
  ];

  for (const input of valid) {
    test(`accepts: ${input}`, () => {
      assert.equal(isCommandNameSafe(input), true);
    });
  }
});

// ---------------------------------------------------------------------------
// resolveRepoScriptPath — repo-root script boundary guard
// ---------------------------------------------------------------------------

describe("resolveRepoScriptPath — accepts scripts inside repo root", () => {
  const repoRoot = "/home/user/project";

  test("normal in-repo path is accepted", () => {
    const result = resolveRepoScriptPath("runtime/sync.sh", repoRoot);
    assert.ok(result !== null, "Should return a resolved path");
    // Use resolve() for platform-safe comparison (Windows resolves / to drive-root)
    const resolvedRoot = resolve(repoRoot);
    assert.ok(
      result.startsWith(resolvedRoot + sep) || result === resolvedRoot,
      `Resolved path ${result} should be inside ${resolvedRoot}`,
    );
  });

  test("logically equivalent path with redundant segments is accepted", () => {
    const result = resolveRepoScriptPath(
      "runtime/../runtime/sync.sh",
      repoRoot,
    );
    assert.ok(
      result !== null,
      "Path normalising back inside boundary should be accepted",
    );
  });
});

describe("resolveRepoScriptPath — rejects scripts that escape repo root", () => {
  const repoRoot = "/home/user/project";

  test("../outside.sh is rejected", () => {
    assert.equal(
      resolveRepoScriptPath("../outside.sh", repoRoot),
      null,
      "Traversal outside repo root must be rejected",
    );
  });

  test("sibling-prefix path is rejected", () => {
    // /home/user/project-evil/script.sh starts with the repo root string
    // but is not inside it; the boundary check must catch this.
    assert.equal(
      resolveRepoScriptPath("/home/user/project-evil/script.sh", repoRoot),
      null,
      "Sibling path with shared prefix must be rejected",
    );
  });

  test("path containing null byte is rejected", () => {
    assert.equal(
      resolveRepoScriptPath("runtime/sync\x00.sh", repoRoot),
      null,
      "Null byte in script path must be rejected",
    );
  });
});

// ---------------------------------------------------------------------------
// validateNumber
// ---------------------------------------------------------------------------

describe("validateNumber — sanitizes input", () => {
  test("valid number passes through", () => {
    assert.equal(validateNumber(2000, 1000), 2000);
  });

  test("numeric string is coerced", () => {
    assert.equal(validateNumber("3000", 1000), 3000);
  });

  test("non-numeric string returns fallback", () => {
    assert.equal(validateNumber("100; whoami", 2000), 2000);
  });

  test("undefined returns fallback", () => {
    assert.equal(validateNumber(undefined, 2000), 2000);
  });

  test("null coerces to 0 (Number(null) === 0)", () => {
    assert.equal(validateNumber(null, 2000), 0);
  });

  test("NaN returns fallback", () => {
    assert.equal(validateNumber(NaN, 2000), 2000);
  });

  test("Infinity returns fallback", () => {
    assert.equal(validateNumber(Infinity, 2000), 2000);
  });
});
