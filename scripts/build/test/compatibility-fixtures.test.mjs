/**
 * compatibility-fixtures.test.mjs
 *
 * Tests the compatibility resolution logic with in-memory fixtures.
 * Covers edge cases: all required supported, required unsupported, optional unsupported,
 * unknown capabilities, platform overrides, degraded mode, deprecated zero-emit, etc.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSkillPlatform,
  resolveAll,
} from "../lib/resolve-compatibility.mjs";

// ─── Test 1: All required capabilities supported ───

test("resolveSkillPlatform: all required capabilities supported", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["git.read", "fs.write"],
    },
  };

  const platform = {
    id: "claude-code",
    default_package: "rules",
    capabilities: {
      "git.read": { status: "supported" },
      "fs.write": { status: "supported" },
    },
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(result.status, "supported", "Should be supported");
  assert.equal(result.mode, "native", "Should be native mode");
  assert.equal(result.emit, true, "Should emit");
  assert.equal(result.package, "rules", "Should use platform default package");
});

// ─── Test 2: Required capability unsupported ───

test("resolveSkillPlatform: required capability unsupported → excluded", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["git.read", "shell.exec"],
    },
  };

  const platform = {
    id: "claude-web",
    default_package: "plugin",
    capabilities: {
      "git.read": { status: "supported" },
      "shell.exec": { status: "unsupported" },
    },
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(result.status, "excluded", "Should be excluded");
  assert.equal(result.mode, "excluded", "Should be excluded mode");
  assert.equal(result.emit, false, "Should not emit");
  assert.ok(
    result.unsupported.includes("shell.exec"),
    "Should list unsupported capability",
  );
  assert.ok(result.notes.includes("Excluded"), "Should have exclusion note");
});

// ─── Test 3: Optional capability unsupported (should still emit) ───

test("resolveSkillPlatform: optional capability unsupported → still supported", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["fs.read"],
      optional: ["shell.exec"],
    },
  };

  const platform = {
    id: "claude-web",
    default_package: "plugin",
    capabilities: {
      "fs.read": { status: "supported" },
      "shell.exec": { status: "unsupported" },
    },
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(
    result.status,
    "supported",
    "Should be supported (optional does not block)",
  );
  assert.equal(result.emit, true, "Should emit");
});

// ─── Test 4: Unknown capability → unverified ───

test("resolveSkillPlatform: unknown capability → unverified, defaults to native", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["unknown.capability"],
      fallback_mode: "none",
    },
  };

  const platform = {
    id: "cursor",
    default_package: "cursorrules",
    capabilities: {},
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(result.status, "unverified", "Should be unverified");
  assert.equal(result.mode, "native", "Should default to native (no fallback)");
  assert.equal(
    result.emit,
    false,
    "Should not emit (unverified without allow_unverified)",
  );
  assert.ok(
    result.unknown.includes("unknown.capability"),
    "Should list unknown capability",
  );
});

// ─── Test 5: Unknown capability + fallback_mode degraded → degraded ───

test("resolveSkillPlatform: unknown capability + fallback_mode → degraded mode", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["unknown.capability"],
      fallback_mode: "prompt-only",
      fallback_notes: "User can paste output manually",
    },
  };

  const platform = {
    id: "cursor",
    default_package: "cursorrules",
    capabilities: {},
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(result.status, "unverified", "Should be unverified");
  assert.equal(result.mode, "degraded", "Should be degraded (has fallback)");
  assert.equal(result.emit, false, "Should not emit by default (unverified)");
});

// ─── Test 6: Unverified with allow_unverified override ───

test("resolveSkillPlatform: unverified + allow_unverified: true → emit", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["unverified.capability"],
    },
    platforms: {
      "claude-web": {
        allow_unverified: true,
      },
    },
  };

  const platform = {
    id: "claude-web",
    default_package: "plugin",
    capabilities: {
      "unverified.capability": { status: "unknown" },
    },
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(result.status, "unverified", "Should be unverified");
  assert.equal(result.emit, true, "Should emit with allow_unverified override");
});

// ─── Test 7: Platform override forcing excluded ───

test("resolveSkillPlatform: platform override mode: excluded forces exclusion", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["git.read"],
    },
    platforms: {
      cursor: {
        mode: "excluded",
        notes: "No hook surface in Cursor",
      },
    },
  };

  const platform = {
    id: "cursor",
    default_package: "cursorrules",
    capabilities: {
      "git.read": { status: "supported" },
    },
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(result.status, "excluded", "Should be excluded (override)");
  assert.equal(result.emit, false, "Should not emit");
  assert.ok(
    result.notes.includes("hook surface"),
    "Should include override note",
  );
});

// ─── Test 8: Platform package override ───

test("resolveSkillPlatform: platform override package", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["git.read"],
    },
    platforms: {
      "claude-code": {
        package: "custom-format",
      },
    },
  };

  const platform = {
    id: "claude-code",
    default_package: "rules",
    capabilities: {
      "git.read": { status: "supported" },
    },
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(result.package, "custom-format", "Should use override package");
});

// ─── Test 9: No capabilities defined → supported ───

test("resolveSkillPlatform: no capabilities defined → supported", () => {
  const skillFrontmatter = {
    skill: "test-skill",
  };

  const platform = {
    id: "claude-code",
    default_package: "rules",
    capabilities: {},
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(
    result.status,
    "supported",
    "Should be supported (no required caps)",
  );
  assert.equal(result.emit, true, "Should emit");
});

// ─── Test 10: resolveAll produces matrix ───

test("resolveAll: produces compatibility matrix for multiple skills and platforms", () => {
  const skills = [
    {
      skillName: "skill1",
      frontmatter: {
        skill: "skill1",
        capabilities: { required: ["git.read"] },
      },
    },
    {
      skillName: "skill2",
      frontmatter: {
        skill: "skill2",
        capabilities: { required: ["unknown.cap"] },
      },
    },
  ];

  const platforms = new Map([
    [
      "claude-code",
      {
        id: "claude-code",
        default_package: "rules",
        capabilities: { "git.read": { status: "supported" } },
      },
    ],
    [
      "cursor",
      {
        id: "cursor",
        default_package: "cursorrules",
        capabilities: { "git.read": { status: "supported" } },
      },
    ],
  ]);

  const matrix = resolveAll(skills, platforms);

  // Check structure
  assert.ok(matrix instanceof Map, "Should return a Map");
  assert.equal(matrix.size, 2, "Should have 2 skills");

  // Check skill1 results
  const skill1Results = matrix.get("skill1");
  assert.ok(skill1Results instanceof Map, "Skill results should be a Map");
  assert.equal(skill1Results.size, 2, "Should have results for 2 platforms");

  // Check skill1 on claude-code: supported
  const skill1Claude = skill1Results.get("claude-code");
  assert.equal(
    skill1Claude.status,
    "supported",
    "skill1 should be supported on claude-code",
  );
  assert.equal(skill1Claude.emit, true, "skill1 should emit on claude-code");

  // Check skill2 on cursor: unverified
  const skill2Results = matrix.get("skill2");
  const skill2Cursor = skill2Results.get("cursor");
  assert.equal(
    skill2Cursor.status,
    "unverified",
    "skill2 should be unverified on cursor",
  );
  assert.equal(
    skill2Cursor.emit,
    false,
    "skill2 should not emit on cursor (unverified)",
  );
});

// ─── Test 11: Degraded mode requires fallback_mode ≠ 'none' ───

test("resolveSkillPlatform: degraded mode with fallback_mode none → native", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["unverified.cap"],
      fallback_mode: "none",
    },
    platforms: {
      cursor: {
        mode: "degraded",
      },
    },
  };

  const platform = {
    id: "cursor",
    default_package: "cursorrules",
    capabilities: { "unverified.cap": { status: "unknown" } },
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  // Degraded mode is not allowed when fallback_mode is 'none'
  assert.equal(
    result.mode,
    "native",
    "Should revert to native (degraded not allowed)",
  );
});

// ─── Test 12: Multiple unsupported capabilities listed ───

test("resolveSkillPlatform: multiple unsupported capabilities → all listed in result", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["git.read", "shell.exec", "net.http"],
    },
  };

  const platform = {
    id: "claude-web",
    default_package: "plugin",
    capabilities: {
      "git.read": { status: "supported" },
      "shell.exec": { status: "unsupported" },
      "net.http": { status: "unsupported" },
    },
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(result.unsupported.length, 2, "Should list 2 unsupported");
  assert.ok(
    result.unsupported.includes("shell.exec"),
    "Should include shell.exec",
  );
  assert.ok(result.unsupported.includes("net.http"), "Should include net.http");
});

// ─── Test 13: Cache hit — identical capability declarations ───

test("resolveAll: skills with identical capability declarations share equivalent results", () => {
  const capDecl = { required: ["git.read"], fallback_mode: "prompt-only" };
  const skills = [
    {
      skillName: "skill-a",
      frontmatter: { skill: "skill-a", capabilities: capDecl },
    },
    {
      skillName: "skill-b",
      frontmatter: { skill: "skill-b", capabilities: capDecl },
    },
  ];
  const platforms = new Map([
    [
      "claude-code",
      {
        id: "claude-code",
        default_package: "rules",
        capabilities: { "git.read": { status: "supported" } },
      },
    ],
  ]);

  const matrix = resolveAll(skills, platforms);

  const resultA = matrix.get("skill-a").get("claude-code");
  const resultB = matrix.get("skill-b").get("claude-code");

  assert.deepEqual(
    resultA,
    resultB,
    "Identical capability contracts should produce equal results",
  );
});

// ─── Test 13 (original): Mixed unknown and unsupported ───

test("resolveSkillPlatform: mixed unknown and unsupported → excluded (unsupported takes precedence)", () => {
  const skillFrontmatter = {
    skill: "test-skill",
    capabilities: {
      required: ["known.unsupported", "unknown.unknown"],
    },
  };

  const platform = {
    id: "claude-web",
    default_package: "plugin",
    capabilities: {
      "known.unsupported": { status: "unsupported" },
      "unknown.unknown": { status: "unknown" },
    },
  };

  const result = resolveSkillPlatform(skillFrontmatter, platform);

  assert.equal(
    result.status,
    "excluded",
    "Should be excluded (unsupported takes precedence)",
  );
  assert.equal(result.emit, false, "Should not emit");
  assert.ok(
    result.unsupported.includes("known.unsupported"),
    "Should list unsupported",
  );
});
