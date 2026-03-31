import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { readSkillOutcomes } from "../../../runtime/lib/observation-sources/skill-outcomes.mjs";

test("skill outcomes adapter - output_used outcome maps to canonical event", () => {
  const tmpDir = join(tmpdir(), "skill-outcomes-test-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });
  const filePath = join(tmpDir, "skill-outcomes.jsonl");

  try {
    const line = JSON.stringify({
      skill_name: "code-review",
      outcome: "output_used",
      timestamp: "2026-03-23T10:30:00Z",
      session_id: "session_001",
    });
    writeFileSync(filePath, line + "\n");

    const events = readSkillOutcomes(filePath);

    assert.equal(events.length, 1);
    assert.equal(events[0].type, "skill_outcome");
    assert.equal(events[0].skill_name, "code-review");
    assert.equal(events[0].outcome, "output_used");
    assert.equal(events[0].timestamp, "2026-03-23T10:30:00Z");
    assert.equal(events[0].session_id, "session_001");
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test("skill outcomes adapter - output_replaced outcome maps to canonical event", () => {
  const tmpDir = join(tmpdir(), "skill-outcomes-test-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });
  const filePath = join(tmpDir, "skill-outcomes.jsonl");

  try {
    const line = JSON.stringify({
      skill_name: "debug",
      outcome: "output_replaced",
      timestamp: "2026-03-23T11:00:00Z",
      session_id: "session_002",
    });
    writeFileSync(filePath, line + "\n");

    const events = readSkillOutcomes(filePath);

    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, "output_replaced");
    assert.equal(events[0].skill_name, "debug");
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test("skill outcomes adapter - multiple valid lines return multiple events", () => {
  const tmpDir = join(tmpdir(), "skill-outcomes-test-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });
  const filePath = join(tmpDir, "skill-outcomes.jsonl");

  try {
    const lines = [
      JSON.stringify({
        skill_name: "skill-a",
        outcome: "output_used",
        timestamp: "2026-03-23T10:00:00Z",
      }),
      JSON.stringify({
        skill_name: "skill-b",
        outcome: "output_replaced",
        timestamp: "2026-03-23T10:01:00Z",
      }),
      JSON.stringify({
        skill_name: "skill-a",
        outcome: "output_used",
        timestamp: "2026-03-23T10:02:00Z",
      }),
    ];
    writeFileSync(filePath, lines.join("\n") + "\n");

    const events = readSkillOutcomes(filePath);

    assert.equal(events.length, 3);
    assert.equal(events[0].skill_name, "skill-a");
    assert.equal(events[1].skill_name, "skill-b");
    assert.equal(events[2].skill_name, "skill-a");
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test("skill outcomes adapter - malformed line is skipped", () => {
  const tmpDir = join(tmpdir(), "skill-outcomes-test-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });
  const filePath = join(tmpDir, "skill-outcomes.jsonl");

  try {
    const lines = [
      JSON.stringify({
        skill_name: "skill-a",
        outcome: "output_used",
        timestamp: "2026-03-23T10:00:00Z",
      }),
      "this is not valid json",
      JSON.stringify({
        skill_name: "skill-b",
        outcome: "output_replaced",
        timestamp: "2026-03-23T10:01:00Z",
      }),
    ];
    writeFileSync(filePath, lines.join("\n") + "\n");

    const events = readSkillOutcomes(filePath);

    assert.equal(events.length, 2);
    assert.equal(events[0].skill_name, "skill-a");
    assert.equal(events[1].skill_name, "skill-b");
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test("skill outcomes adapter - missing file returns empty array", () => {
  const filePath = join(tmpdir(), "nonexistent-" + Date.now() + ".jsonl");

  const events = readSkillOutcomes(filePath);

  assert.equal(events.length, 0);
});

test("skill outcomes adapter - empty file returns empty array", () => {
  const tmpDir = join(tmpdir(), "skill-outcomes-test-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });
  const filePath = join(tmpDir, "skill-outcomes.jsonl");

  try {
    writeFileSync(filePath, "");

    const events = readSkillOutcomes(filePath);

    assert.equal(events.length, 0);
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test("skill outcomes adapter - preserves all fields from input", () => {
  const tmpDir = join(tmpdir(), "skill-outcomes-test-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });
  const filePath = join(tmpDir, "skill-outcomes.jsonl");

  try {
    const line = JSON.stringify({
      skill_name: "code-review",
      outcome: "output_used",
      timestamp: "2026-03-23T10:30:00Z",
      session_id: "session_001",
      invocation_id: "inv_123",
      extra_field: "preserved",
    });
    writeFileSync(filePath, line + "\n");

    const events = readSkillOutcomes(filePath);

    assert.equal(events.length, 1);
    assert.equal(events[0].skill_name, "code-review");
    assert.equal(events[0].outcome, "output_used");
    assert.equal(events[0].invocation_id, "inv_123");
    assert.equal(events[0].extra_field, "preserved");
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});
