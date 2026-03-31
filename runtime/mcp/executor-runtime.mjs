import { execFileSync } from "child_process";
import { resolveRepoScriptPath } from "./path-utils.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_STDIO_BYTES = 64 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 96 * 1024;

function readPositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function truncateToBytes(value, maxBytes, streamName) {
  const text = String(value ?? "");
  const totalBytes = Buffer.byteLength(text, "utf8");
  if (totalBytes <= maxBytes) {
    return { text, truncated: false, bytesDropped: 0 };
  }

  const sourceBuffer = Buffer.from(text, "utf8");
  const keptBuffer = sourceBuffer.subarray(0, maxBytes);
  const bytesDropped = totalBytes - maxBytes;
  const marker = `\n...[${streamName} truncated: ${bytesDropped} bytes dropped]\n`;

  return {
    text: `${keptBuffer.toString("utf8")}${marker}`,
    truncated: true,
    bytesDropped,
  };
}

function limitResponsePayload(text, maxBytes) {
  const totalBytes = Buffer.byteLength(text, "utf8");
  if (totalBytes <= maxBytes) {
    return { text, truncated: false, bytesDropped: 0 };
  }

  const keptBuffer = Buffer.from(text, "utf8").subarray(0, maxBytes);
  const bytesDropped = totalBytes - maxBytes;
  const marker = `\n...[response payload truncated: ${bytesDropped} bytes dropped]\n`;
  return {
    text: `${keptBuffer.toString("utf8")}${marker}`,
    truncated: true,
    bytesDropped,
  };
}

export function getExecutorGuardrails() {
  return {
    timeoutMs: readPositiveIntEnv("EXECUTOR_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    maxStdioBytes: readPositiveIntEnv(
      "EXECUTOR_MAX_STDIO_BYTES",
      DEFAULT_MAX_STDIO_BYTES,
    ),
    maxResponseBytes: readPositiveIntEnv(
      "EXECUTOR_MAX_RESPONSE_BYTES",
      DEFAULT_MAX_RESPONSE_BYTES,
    ),
  };
}

export function runScriptWithGuardrails(script, args = [], repoRoot) {
  const scriptPath = resolveRepoScriptPath(script, repoRoot);
  if (!scriptPath) {
    return {
      success: false,
      stdout: "",
      stderr: "Script path escapes repository root",
      metadata: {
        timeout_ms: getExecutorGuardrails().timeoutMs,
        stdout_truncated: false,
        stderr_truncated: false,
        response_truncated: false,
        timed_out: false,
        bytes_dropped: 0,
      },
    };
  }

  const guardrails = getExecutorGuardrails();
  let stdout = "";
  let stderr = "";
  let success = false;
  let timedOut = false;

  try {
    stdout = execFileSync("bash", [scriptPath, ...args], {
      encoding: "utf8",
      timeout: guardrails.timeoutMs,
      cwd: repoRoot,
      maxBuffer: guardrails.maxStdioBytes * 64,
      stdio: ["ignore", "pipe", "pipe"],
    });
    success = true;
  } catch (err) {
    stdout = String(err.stdout || "");
    stderr = String(err.stderr || err.message || "Unknown process error");
    timedOut = err?.code === "ETIMEDOUT" || err?.signal === "SIGTERM";
  }

  const stdoutLimited = truncateToBytes(
    stdout,
    guardrails.maxStdioBytes,
    "stdout",
  );
  const stderrLimited = truncateToBytes(
    stderr,
    guardrails.maxStdioBytes,
    "stderr",
  );

  return {
    success,
    stdout: stdoutLimited.text,
    stderr: stderrLimited.text,
    metadata: {
      timeout_ms: guardrails.timeoutMs,
      stdout_truncated: stdoutLimited.truncated,
      stderr_truncated: stderrLimited.truncated,
      response_truncated: false,
      timed_out: timedOut,
      bytes_dropped: stdoutLimited.bytesDropped + stderrLimited.bytesDropped,
    },
    _maxResponseBytes: guardrails.maxResponseBytes,
  };
}

export function toBoundedToolResponse(result) {
  const parts = result.success
    ? [result.stdout ?? ""]
    : [result.stderr, result.stdout].filter(Boolean);
  const text = parts.length > 0 ? parts.join("\n\n") : "Unknown error";

  const payloadLimited = limitResponsePayload(
    text,
    result._maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES,
  );
  const metadata = {
    ...result.metadata,
    response_truncated: payloadLimited.truncated,
    bytes_dropped:
      (result.metadata?.bytes_dropped || 0) + payloadLimited.bytesDropped,
  };

  return {
    content: [{ type: "text", text: payloadLimited.text }],
    ...(result.success ? {} : { isError: true }),
    metadata,
  };
}
