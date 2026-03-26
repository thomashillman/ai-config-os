#!/usr/bin/env node
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicKey, verify } from 'node:crypto';
import { ExecutorHttpError, toErrorResponse } from './errors.mjs';
import { parseRuntimeActionOutput } from '../lib/runtime-action-output.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TOOL_SCRIPT_MAP = {
  sync_tools: 'runtime/sync.sh',
  list_tools: 'runtime/manifest.sh',
  get_config: 'shared/lib/config-merger.sh',
  skill_stats: 'ops/skill-stats.sh',
  context_cost: 'ops/context-cost.sh',
  validate_all: 'ops/validate-all.sh',
};

export function getEnv() {
  const timeoutMs = Number(process.env.REMOTE_EXECUTOR_TIMEOUT_MS ?? '15000');
  return {
    port: Number(process.env.REMOTE_EXECUTOR_PORT ?? '8788'),
    sharedSecret: process.env.REMOTE_EXECUTOR_SHARED_SECRET ?? '',
    signaturePublicKey: process.env.REMOTE_EXECUTOR_SIGNATURE_PUBLIC_KEY_PEM ?? '',
    requireSignature: process.env.REMOTE_EXECUTOR_REQUIRE_SIGNATURE === 'true',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
  };
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new ExecutorHttpError(400, 'BAD_REQUEST', 'Request body must be valid JSON'));
      }
    });
  });
}

function validateContract(body) {
  if (typeof body !== 'object' || body === null) {
    throw new ExecutorHttpError(400, 'BAD_REQUEST', 'Payload must be an object');
  }

  if (typeof body.tool !== 'string' || body.tool.length === 0) {
    throw new ExecutorHttpError(400, 'BAD_REQUEST', "Field 'tool' must be a non-empty string");
  }

  if (body.args !== undefined && (!Array.isArray(body.args) || body.args.some(v => typeof v !== 'string'))) {
    throw new ExecutorHttpError(400, 'BAD_REQUEST', "Field 'args' must be an array of strings");
  }

  if (body.timeout_ms !== undefined && (!Number.isInteger(body.timeout_ms) || body.timeout_ms <= 0)) {
    throw new ExecutorHttpError(400, 'BAD_REQUEST', "Field 'timeout_ms' must be a positive integer");
  }
}

function verifyRequestSignature(body, rawSignature, publicKeyPem) {
  if (!rawSignature) return false;
  const signature = Buffer.from(rawSignature, 'base64');
  const canonical = JSON.stringify({
    request_id: body.request_id ?? null,
    tool: body.tool,
    args: body.args ?? [],
    metadata: body.metadata ?? null,
  });
  const key = createPublicKey(publicKeyPem);
  return verify(null, Buffer.from(canonical), key, signature);
}

function resolveScript(tool) {
  const relativeScript = TOOL_SCRIPT_MAP[tool];
  if (!relativeScript) {
    throw new ExecutorHttpError(400, 'BAD_REQUEST', `Unsupported tool '${tool}'`);
  }
  const scriptPath = path.resolve(REPO_ROOT, relativeScript);
  if (!scriptPath.startsWith(REPO_ROOT + path.sep)) {
    throw new ExecutorHttpError(500, 'EXECUTOR_ERROR', 'Resolved script path is outside repository root');
  }
  return scriptPath;
}

async function executeTool(body, timeoutMs) {
  const scriptPath = resolveScript(body.tool);
  const args = body.tool === 'list_tools' ? ['status'] : (body.args ?? []);
  let result;
  try {
    result = await execFileAsync('bash', [scriptPath, ...args], {
      cwd: REPO_ROOT,
      timeout: Math.min(timeoutMs, body.timeout_ms ?? timeoutMs),
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });
  } catch (error) {
    throw new ExecutorHttpError(500, 'EXECUTOR_ERROR', error instanceof Error ? error.message : String(error));
  }

  const rawOutput = result.stdout?.trimEnd() ?? '';
  const parsed = parseRuntimeActionOutput(body.tool, rawOutput, { normalizedArgs: {} });

  return {
    ok: true,
    status: 200,
    result: {
      tool: body.tool,
      data: parsed.data,
      schema_ids: parsed.schemaIds,
      capability: { local_only: parsed.capability.local_only, worker_backed: true },
      capability_by_schema: parsed.capabilityBySchema ?? {},
      diagnostics: rawOutput ? { raw_output: rawOutput } : undefined,
      stderr: result.stderr?.trimEnd() ?? '',
    },
  };
}

function createExecuteTool(timeoutMs) {
  return async function execute(body) {
    return executeTool(body, timeoutMs);
  };
}

export function createRemoteExecutorHandler({
  env,
  executeToolImpl = createExecuteTool(env.timeoutMs),
} = {}) {
  return async function handler(req, res) {
    if (req.method === 'GET' && req.url === '/v1/health') {
      return json(res, 200, { ok: true, service: 'remote-executor' });
    }

    if (req.method !== 'POST' || req.url !== '/v1/execute') {
      return json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
    }

    const proxySecret = req.headers['x-executor-shared-secret'];
    if (proxySecret !== env.sharedSecret) {
      return json(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid proxy secret' } });
    }

    try {
      const body = await parseBody(req);
      validateContract(body);

      const signature = typeof req.headers['x-request-signature'] === 'string' ? req.headers['x-request-signature'] : '';
      const signatureVerified = env.signaturePublicKey
        ? verifyRequestSignature(body, signature, env.signaturePublicKey)
        : null;

      if (env.requireSignature && !signatureVerified) {
        return json(res, 401, {
          ok: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Request signature verification failed' },
        });
      }

      const response = await executeToolImpl(body);
      return json(res, 200, {
        ...response,
        signature_verified: signatureVerified,
        request_id: body.request_id ?? null,
      });
    } catch (error) {
      const err = toErrorResponse(error);
      return json(res, err.status, err.payload);
    }
  };
}

export function createRemoteExecutorServer({
  env = getEnv(),
  executeToolImpl,
  readFlags = null,
} = {}) {
  if (!env.sharedSecret) {
    throw new Error('REMOTE_EXECUTOR_SHARED_SECRET is required');
  }
  if (readFlags !== null) {
    const flags = readFlags();
    if (!flags.remote_executor_enabled) {
      throw new Error(
        'remote_executor_enabled flag is false in manifest; refusing to start remote executor'
      );
    }
  }
  return createServer(createRemoteExecutorHandler({ env, executeToolImpl }));
}

export function startRemoteExecutor({
  env = getEnv(),
  host = '0.0.0.0',
  executeToolImpl,
  readFlags = null,
} = {}) {
  const server = createRemoteExecutorServer({ env, executeToolImpl, readFlags });
  server.listen(env.port, host, () => {
    console.log(`[remote-executor] listening on http://${host}:${env.port}`);
  });
  return server;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  startRemoteExecutor();
}
