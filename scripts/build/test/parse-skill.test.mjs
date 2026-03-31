// Tests for scripts/build/lib/parse-skill.mjs

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseSkill } from "../lib/parse-skill.mjs";

describe("parseSkill — frontmatter extraction", () => {
  test("extracts frontmatter and body from valid input", () => {
    const content =
      "---\nskill: my-skill\ndescription: A test skill\n---\n\n# My Skill\n\nBody text.";
    const result = parseSkill("/fake/SKILL.md", content);
    assert.equal(result.frontmatter.skill, "my-skill");
    assert.equal(result.frontmatter.description, "A test skill");
    assert.ok(result.body.includes("Body text."));
    assert.equal(result.filePath, "/fake/SKILL.md");
  });

  test("handles CRLF line endings", () => {
    const content = "---\r\nskill: crlf-skill\r\n---\r\nBody here.";
    const result = parseSkill("/fake/SKILL.md", content);
    assert.equal(result.frontmatter.skill, "crlf-skill");
  });

  test("trims whitespace from body", () => {
    const content = "---\nskill: s\n---\n\n  Body  \n";
    const result = parseSkill("/fake/SKILL.md", content);
    assert.equal(result.body, "Body");
  });

  test("empty body is returned as empty string", () => {
    const content = "---\nskill: s\n---\n";
    const result = parseSkill("/fake/SKILL.md", content);
    assert.equal(result.body, "");
  });

  test("throws when no frontmatter delimiters present", () => {
    assert.throws(
      () => parseSkill("/fake/SKILL.md", "Just plain text without delimiters."),
      /No YAML frontmatter found/,
    );
  });

  test("throws when frontmatter is malformed YAML", () => {
    const content = "---\nkey: {unclosed\n---\nBody.";
    assert.throws(
      () => parseSkill("/fake/SKILL.md", content),
      /Failed to parse YAML/,
    );
  });

  test("preserves filePath in result", () => {
    const content = "---\nskill: s\n---\n";
    const result = parseSkill("/absolute/path/SKILL.md", content);
    assert.equal(result.filePath, "/absolute/path/SKILL.md");
  });

  test("parses nested frontmatter objects", () => {
    const content = [
      "---",
      "skill: complex",
      "capabilities:",
      "  required:",
      "    - fs.read",
      "  optional:",
      "    - shell.exec",
      "---",
      "Body.",
    ].join("\n");
    const result = parseSkill("/fake/SKILL.md", content);
    assert.deepEqual(result.frontmatter.capabilities.required, ["fs.read"]);
    assert.deepEqual(result.frontmatter.capabilities.optional, ["shell.exec"]);
  });

  test("parses frontmatter with multiple scalar fields", () => {
    const content = [
      "---",
      "skill: multi",
      "type: prompt",
      "status: stable",
      'version: "1.2.0"',
      "---",
    ].join("\n");
    const result = parseSkill("/fake/SKILL.md", content);
    assert.equal(result.frontmatter.type, "prompt");
    assert.equal(result.frontmatter.status, "stable");
    assert.equal(result.frontmatter.version, "1.2.0");
  });
});
