import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(__filename, "..", "..", "..", "..");
const PROBE_SCRIPT = resolve(REPO_ROOT, "ops", "capability-probe.sh");

const EXPECTED_CAPABILITIES = [
  "fs.read",
  "fs.write",
  "shell.exec",
  "shell.long-running",
  "git.read",
  "git.write",
  "network.http",
  "mcp.client",
  "env.read",
];

const bashProbe = spawnSync("bash", ["--version"], { stdio: "ignore" });
const BASH_AVAILABLE = !bashProbe.error && bashProbe.status === 0;
const SKIP_REASON = BASH_AVAILABLE
  ? false
  : "bash not available on this platform";

describe("capability-probe.sh output", { skip: SKIP_REASON }, () => {
  let probeOutput;

  it("produces valid JSON", () => {
    const raw = execFileSync("bash", [PROBE_SCRIPT, "--quiet"], {
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, HOME: process.env.HOME },
    });
    probeOutput = JSON.parse(raw);
    assert.ok(probeOutput, "should parse as JSON");
  });

  it("contains all required top-level fields", () => {
    assert.ok(probeOutput.probe_version);
    assert.ok(probeOutput.probed_at);
    assert.ok(probeOutput.platform_hint);
    assert.ok(probeOutput.hostname !== undefined);
    assert.ok(probeOutput.results);
    assert.ok(typeof probeOutput.duration_ms === "number");
  });

  it("contains all 9 capability results", () => {
    for (const cap of EXPECTED_CAPABILITIES) {
      assert.ok(probeOutput.results[cap], `missing capability: ${cap}`);
      assert.ok(
        ["supported", "unsupported"].includes(probeOutput.results[cap].status),
        `${cap} has unexpected status: ${probeOutput.results[cap].status}`,
      );
      assert.ok(
        typeof probeOutput.results[cap].latency_ms === "number",
        `${cap} missing latency_ms`,
      );
    }
  });
});
