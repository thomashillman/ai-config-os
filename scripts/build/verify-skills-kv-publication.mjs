#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import TOML from "@iarna/toml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const DEFAULT_DIST_DIR =
  process.env.AI_CONFIG_OS_DIST_CLAUDE_CODE_DIR ??
  join(REPO_ROOT, "dist", "clients", "claude-code");
const WRANGLER_PATH = join(REPO_ROOT, "worker", "wrangler.toml");
const PACKAGE_KEYS = (version) => [
  `claude-code-package:${version}`,
  "claude-code-package:latest",
];

function readExpectedVersion(distDir) {
  const pluginPath = join(distDir, ".claude-plugin", "plugin.json");
  const plugin = JSON.parse(readFileSync(pluginPath, "utf8"));

  if (!plugin.version) {
    throw new Error(`plugin.json missing version field: ${pluginPath}`);
  }

  return plugin.version;
}

function readProductionManifestNamespaceId() {
  const wrangler = TOML.parse(readFileSync(WRANGLER_PATH, "utf8"));
  const namespaces = Array.isArray(wrangler.kv_namespaces)
    ? wrangler.kv_namespaces
    : [];
  const manifestNamespace = namespaces.find(
    (entry) => entry?.binding === "MANIFEST_KV",
  );

  if (!manifestNamespace?.id) {
    throw new Error(
      "worker/wrangler.toml missing production MANIFEST_KV binding id",
    );
  }

  return manifestNamespace.id;
}

function downloadKey(key, { accountId, apiToken, kvNamespaceId, runner }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${encodeURIComponent(key)}`;

  return runner(
    "curl",
    [
      "-s",
      "-S",
      "--fail-with-body",
      url,
      "-H",
      `Authorization: Bearer ${apiToken}`,
    ],
    {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    },
  );
}

export function verifyPublication({
  expectedVersion,
  env = process.env,
  runner = spawnSync,
  logger = console.log,
} = {}) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const kvNamespaceId = env.MANIFEST_KV_NAMESPACE_ID;

  if (!accountId || !apiToken || !kvNamespaceId) {
    throw new Error(
      "Missing required env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, MANIFEST_KV_NAMESPACE_ID",
    );
  }

  const configuredNamespace = readProductionManifestNamespaceId();
  if (configuredNamespace !== kvNamespaceId) {
    throw new Error(
      `MANIFEST_KV_NAMESPACE_ID mismatch. workflow=${kvNamespaceId}, worker/wrangler.toml=${configuredNamespace}`,
    );
  }

  logger(`Verifying published package keys in MANIFEST_KV ${kvNamespaceId}...`);

  for (const key of PACKAGE_KEYS(expectedVersion)) {
    const result = downloadKey(key, {
      accountId,
      apiToken,
      kvNamespaceId,
      runner,
    });

    if (result.status !== 0) {
      const detail =
        typeof result.stderr === "string" && result.stderr.trim().length > 0
          ? result.stderr.trim()
          : `curl exited with status ${result.status}`;
      throw new Error(`Failed to fetch key ${key}: ${detail}`);
    }

    let pkg;
    try {
      pkg = JSON.parse(result.stdout);
    } catch {
      throw new Error(`KV key ${key} does not contain valid JSON`);
    }

    if (pkg.version !== expectedVersion) {
      throw new Error(
        `KV key ${key} has version ${pkg.version}; expected ${expectedVersion}`,
      );
    }

    if (
      !pkg.skills ||
      typeof pkg.skills !== "object" ||
      Array.isArray(pkg.skills)
    ) {
      throw new Error(`KV key ${key} is missing skills payload`);
    }

    logger(`  ✓ ${key}`);
  }
}

export async function main({
  argv = process.argv.slice(2),
  logger = console.log,
  errorLogger = console.error,
} = {}) {
  try {
    const versionFlag = argv.find((arg) => arg.startsWith("--version="));
    const expectedVersion = versionFlag
      ? versionFlag.split("=", 2)[1]
      : readExpectedVersion(DEFAULT_DIST_DIR);

    if (!expectedVersion) {
      throw new Error("Expected version is empty");
    }

    verifyPublication({ expectedVersion, logger });
    logger(
      `✓ Claude package publication verified for version ${expectedVersion}`,
    );
  } catch (err) {
    errorLogger(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
