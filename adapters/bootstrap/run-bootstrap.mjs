#!/usr/bin/env node
import { executeBootstrap, formatBootstrapResult } from "./core.mjs";

const { result, exitCode } = executeBootstrap({
  env: process.env,
  cwd: process.cwd(),
});

process.stdout.write(`${formatBootstrapResult({ result, exitCode })}\n`);
process.exit(exitCode);
