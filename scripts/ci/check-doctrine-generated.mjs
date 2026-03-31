#!/usr/bin/env node
import { spawnSync } from "child_process";

const result = spawnSync(
  process.execPath,
  ["scripts/build/emit-agent-entrypoints.mjs", "--check"],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
