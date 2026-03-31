import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const REPO_ROOT = resolve(process.cwd());
const SCRIPT_PATH = join(
  REPO_ROOT,
  "scripts",
  "build",
  "emit-agent-entrypoints.mjs",
);

function writeFixtureFile(rootDir, relativePath, content) {
  const fullPath = join(rootDir, relativePath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

test("emit-agent-entrypoints includes base doctrine in both root files and keeps surfaces isolated", () => {
  const repoDir = mkdtempSync(join(tmpdir(), "agent-entrypoints-test-"));

  try {
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/base/20-second.md",
      "Base B",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/base/10-first.md",
      "Base A",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/surfaces/claude.md",
      "Claude-only guidance",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/surfaces/codex.md",
      "Codex-only guidance",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/repos/ai-config-os/20-second.overlay.md",
      "Overlay B",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/repos/ai-config-os/10-first.overlay.md",
      "Overlay A",
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: repoDir,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const claude = readFileSync(join(repoDir, "CLAUDE.md"), "utf8");
    const codex = readFileSync(join(repoDir, "AGENTS.md"), "utf8");

    assert.match(
      claude,
      /^> Generated file\. Edit doctrine fragments, not this file\./,
    );
    assert.ok(
      !/Built:|Timestamp:|Generated at:/i.test(claude),
      "Output must not contain timestamps",
    );
    assert.ok(
      claude.indexOf("Base A") < claude.indexOf("Base B"),
      "Base fragments must be sorted",
    );
    assert.ok(
      claude.indexOf("Overlay A") < claude.indexOf("Overlay B"),
      "Overlay fragments must be sorted",
    );
    assert.match(claude, /Base A/);
    assert.match(codex, /Base A/);
    assert.match(claude, /Claude-only guidance/);
    assert.match(codex, /Codex-only guidance/);
    assert.equal(
      claude.includes("Codex-only guidance"),
      false,
      "Codex guidance must not leak into CLAUDE.md",
    );
    assert.equal(
      codex.includes("Claude-only guidance"),
      false,
      "Claude guidance must not leak into AGENTS.md",
    );
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test("emit-agent-entrypoints output is byte-identical across repeated runs", () => {
  const repoDir = mkdtempSync(join(tmpdir(), "agent-entrypoints-repeat-"));

  try {
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/base/10-first.md",
      "Base A",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/surfaces/claude.md",
      "Claude-only guidance",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/surfaces/codex.md",
      "Codex-only guidance",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/repos/ai-config-os/10-first.overlay.md",
      "Overlay A",
    );

    const first = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: repoDir,
      encoding: "utf8",
    });
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const firstClaude = readFileSync(join(repoDir, "CLAUDE.md"), "utf8");
    const firstCodex = readFileSync(join(repoDir, "AGENTS.md"), "utf8");

    const second = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: repoDir,
      encoding: "utf8",
    });
    assert.equal(second.status, 0, second.stderr || second.stdout);

    const secondClaude = readFileSync(join(repoDir, "CLAUDE.md"), "utf8");
    const secondCodex = readFileSync(join(repoDir, "AGENTS.md"), "utf8");

    assert.equal(hashContent(firstClaude), hashContent(secondClaude));
    assert.equal(hashContent(firstCodex), hashContent(secondCodex));
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test("emit-agent-entrypoints emits size warnings when configured threshold is exceeded", () => {
  const repoDir = mkdtempSync(
    join(tmpdir(), "agent-entrypoints-size-warning-"),
  );

  try {
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/base/10-first.md",
      "# Base\n\n" + "x".repeat(200),
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/surfaces/claude.md",
      "Claude-only guidance",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/surfaces/codex.md",
      "Codex-only guidance",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/repos/ai-config-os/10-first.overlay.md",
      "Overlay A",
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: repoDir,
      encoding: "utf8",
      env: {
        ...process.env,
        DOCTRINE_ENTRYPOINT_WARN_BYTES: "80",
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /\[warn\] CLAUDE\.md is \d+ bytes \(> 80\)/);
    assert.match(result.stderr, /\[warn\] AGENTS\.md is \d+ bytes \(> 80\)/);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test("emit-agent-entrypoints --check fails when generated output drifts", () => {
  const repoDir = mkdtempSync(join(tmpdir(), "agent-entrypoints-check-"));

  try {
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/base/10-first.md",
      "Base A",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/surfaces/claude.md",
      "Surface Claude",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/surfaces/codex.md",
      "Surface Codex",
    );
    writeFixtureFile(
      repoDir,
      "shared/agent-doctrine/repos/ai-config-os/10-first.overlay.md",
      "Overlay A",
    );

    writeFixtureFile(repoDir, "CLAUDE.md", "stale\n");
    writeFixtureFile(repoDir, "AGENTS.md", "stale\n");

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check"], {
      cwd: repoDir,
      encoding: "utf8",
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /\[drift\] CLAUDE\.md is out of date/);
    assert.match(result.stderr, /\[drift\] AGENTS\.md is out of date/);
    assert.equal(readFileSync(join(repoDir, "CLAUDE.md"), "utf8"), "stale\n");
    assert.equal(readFileSync(join(repoDir, "AGENTS.md"), "utf8"), "stale\n");
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});
