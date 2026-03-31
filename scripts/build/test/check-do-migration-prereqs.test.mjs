import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT_PATH = resolve("scripts/deploy/check-do-migration-prereqs.sh");

function createFixtureRepo({
  stagingBindingActive = false,
  stagingDualWrite = "false",
  exportTaskObject = true,
} = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), "do-prereq-"));
  const workerDir = join(repoRoot, "worker");
  const workerSrcDir = join(workerDir, "src");
  const binDir = join(repoRoot, "bin");

  mkdirSync(workerSrcDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });

  const wranglerToml = [
    "[env.staging]",
    "",
    "[env.staging.vars]",
    `TASK_DO_DUAL_WRITE = "${stagingDualWrite}"`,
    "",
    ...(stagingBindingActive
      ? [
          "[env.staging.durable_objects]",
          'bindings = [{ name = "TASK_OBJECT", class_name = "TaskObject" }]',
        ]
      : [
          "# [env.staging.durable_objects]",
          '# bindings = [{ name = "TASK_OBJECT", class_name = "TaskObject" }]',
        ]),
    "",
  ].join("\n");

  const indexTs = exportTaskObject
    ? "export { TaskObject } from './task-object';\n"
    : "export default {};\n";

  writeFileSync(join(workerDir, "wrangler.toml"), wranglerToml);
  writeFileSync(join(workerSrcDir, "index.ts"), indexTs);

  const wranglerShim = join(binDir, "wrangler");
  writeFileSync(wranglerShim, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(wranglerShim, 0o755);

  runGit("git init", repoRoot);
  runGit('git config user.name "Test Bot"', repoRoot);
  runGit('git config user.email "test@example.com"', repoRoot);
  runGit("git add .", repoRoot);
  runGit('git commit -m "fixture"', repoRoot);

  return { repoRoot, binDir };
}

function runGit(cmd, cwd) {
  const result = spawnSync("bash", ["-lc", cmd], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${cmd}\n${result.stderr || result.stdout}`,
    );
  }
}

function runCheck({ repoRoot, binDir, pathOverride } = {}) {
  const pathValue = pathOverride ?? `${binDir}:${process.env.PATH}`;
  return spawnSync("bash", [SCRIPT_PATH], {
    encoding: "utf8",
    env: {
      ...process.env,
      REPO_ROOT: repoRoot,
      PATH: pathValue,
    },
  });
}

test("check-do-migration-prereqs: passes when all preconditions are met", () => {
  const fixture = createFixtureRepo();
  const result = runCheck(fixture);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /All preconditions passed/);
});

test("check-do-migration-prereqs: fails when staging durable_objects binding is active", () => {
  const fixture = createFixtureRepo({ stagingBindingActive: true });
  const result = runCheck(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /active \[env\.staging\.durable_objects\] block/);
});

test("check-do-migration-prereqs: fails when staging dual-write flag is true", () => {
  const fixture = createFixtureRepo({ stagingDualWrite: "true" });
  const result = runCheck(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TASK_DO_DUAL_WRITE = "false"/);
});

test("check-do-migration-prereqs: fails when TaskObject export is missing", () => {
  const fixture = createFixtureRepo({ exportTaskObject: false });
  const result = runCheck(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no longer exports TaskObject/);
});

test("check-do-migration-prereqs: fails when git working tree is dirty", () => {
  const fixture = createFixtureRepo();
  writeFileSync(join(fixture.repoRoot, "dirty.txt"), "uncommitted\n");

  const result = runCheck(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Git working tree is not clean/);
  assert.match(result.stderr, /\?\? dirty\.txt/);
});

test("check-do-migration-prereqs: fails when wrangler command is unavailable", () => {
  const fixture = createFixtureRepo();
  const result = runCheck({
    ...fixture,
    pathOverride: process.env.PATH,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Required command is missing: wrangler/);
});
