import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveBashCommand } from './shell-test-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = join(REPO_ROOT, 'adapters', 'claude', 'materialise.sh');
const BASH_COMMAND = resolveBashCommand();
const SHELL_TEST_OPTIONS = BASH_COMMAND
  ? {}
  : { skip: 'bash is unavailable for shell integration tests' };

function makeBashEnvWithCurlStub(tmpRoot) {
  const envFile = join(tmpRoot, 'bash_env.sh');
  writeFileSync(envFile, `#!/usr/bin/env bash
set -euo pipefail
curl() {
  local status body headers_file out_file
  status="\${MATERIALISE_TEST_STATUS:-200}"
  body="\${MATERIALISE_TEST_BODY:-{}}"
  headers_file=""
  out_file=""
  local args=("\$@")
  local i
  for ((i=0; i<\${#args[@]}; i++)); do
    if [[ "\${args[i]}" == "-D" ]]; then
      headers_file="\${args[i+1]}"
    fi
    if [[ "\${args[i]}" == "-o" ]]; then
      out_file="\${args[i+1]}"
    fi
  done
  if [[ -n "\$headers_file" ]]; then
    printf 'HTTP/1.1 %s Test\\r\\nContent-Type: application/json\\r\\n\\r\\n' "\$status" > "\$headers_file"
  fi
  if [[ -n "\$out_file" ]]; then
    printf '%s' "\$body" > "\$out_file"
  else
    printf '%s' "\$body"
  fi
  if [[ "\$*" == *"/v1/client/claude-code/package"* && "\$status" != "200" ]]; then
    return 22
  fi
  return 0
}
export -f curl
`, 'utf8');
  chmodSync(envFile, 0o755);
  return envFile;
}

function runBootstrap({ status, body }) {
  if (!BASH_COMMAND) {
    throw new Error('bash is unavailable for shell integration tests');
  }
  const tmpRoot = mkdtempSync(join(tmpdir(), 'materialise-bootstrap-diag-'));
  const bashEnvFile = makeBashEnvWithCurlStub(tmpRoot);

  const result = spawnSync(BASH_COMMAND, [SCRIPT_PATH, 'bootstrap'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: join(tmpRoot, 'home'),
      BASH_ENV: bashEnvFile,
      AI_CONFIG_TOKEN: 'test-token',
      AI_CONFIG_WORKER: 'https://worker.example',
      MATERIALISE_TEST_STATUS: String(status),
      MATERIALISE_TEST_BODY: body,
    },
  });

  rmSync(tmpRoot, { recursive: true, force: true });
  return result;
}

test('materialise_bootstrap_reports_unpopulated_worker_package_kv', SHELL_TEST_OPTIONS, () => {
  const result = runBootstrap({
    status: 404,
    body: JSON.stringify({
      error: 'Not Found',
      message: 'Skills package not found. Trigger a release build to populate KV.',
    }),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Worker package KV is unpopulated/i);
  assert.match(result.stderr, /release build publication step is missing/i);
  assert.doesNotMatch(result.stderr, /Check token and network/i);
});

test('materialise_bootstrap_keeps_auth_failures_distinct', SHELL_TEST_OPTIONS, () => {
  const result = runBootstrap({
    status: 401,
    body: JSON.stringify({
      error: 'Unauthorized',
      hint: 'Bearer token rejected.',
    }),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Authentication failed \(HTTP 401\)/i);
  assert.match(result.stderr, /AI_CONFIG_TOKEN is not accepted/i);
  assert.doesNotMatch(result.stderr, /package KV is unpopulated/i);
});
