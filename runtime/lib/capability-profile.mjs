import {
  accessSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  constants,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const CACHE_DIR = path.join(os.homedir(), ".ai-config-os", "runtime-cache");
const CACHE_FILE = path.join(CACHE_DIR, "capability-profile.json");

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function readCachedProfile() {
  try {
    const raw = readFileSync(CACHE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCachedProfile(profile) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  } catch {
    // Cache failures should not block runtime behavior.
  }
}

function hasFilesystemAccess() {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    accessSync(CACHE_DIR, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function hasShellAccess() {
  try {
    execFileSync("bash", ["-lc", "command -v bash"], {
      stdio: "ignore",
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

function hasRepoAccess() {
  try {
    const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
      timeout: 3000,
      cwd: process.cwd(),
    }).trim();
    return out === "true";
  } catch {
    return false;
  }
}

async function probeRemoteExecutor(url) {
  if (!url) {
    return { configured: false, available: false, checked: false };
  }

  if (!boolEnv("AI_CONFIG_OS_REMOTE_EXECUTOR_PROBE", false)) {
    return { configured: true, available: null, checked: false, url };
  }

  try {
    const timeoutMs = Number(
      process.env.AI_CONFIG_OS_REMOTE_EXECUTOR_TIMEOUT_MS || 1500,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return {
      configured: true,
      available: response.ok,
      checked: true,
      status: response.status,
      url,
    };
  } catch (err) {
    return {
      configured: true,
      available: false,
      checked: true,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getRuntimeMode() {
  const mode = String(
    process.env.AI_CONFIG_OS_RUNTIME_MODE || "",
  ).toLowerCase();
  if (mode === "web" || mode === "mobile" || mode === "connector") return mode;
  if (process.env.AI_CONFIG_OS_REMOTE_EXECUTOR_URL) return "connector";
  // Auto-detect from CLAUDE_CODE_ENTRYPOINT (set by the Claude Code runtime per surface)
  const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT;
  if (entrypoint === "remote_mobile") return "mobile";
  if (entrypoint === "web") return "web";
  return "local-cli";
}

export async function buildCapabilityProfile() {
  const mode = getRuntimeMode();
  const localLike = mode === "local-cli";
  const remoteUrl = process.env.AI_CONFIG_OS_REMOTE_EXECUTOR_URL || null;
  const remoteExecutor = await probeRemoteExecutor(remoteUrl);

  const profile = {
    mode,
    detected_at: new Date().toISOString(),
    cache_file: CACHE_FILE,
    capabilities: {
      local_fs: localLike ? hasFilesystemAccess() : false,
      local_shell: localLike ? hasShellAccess() : false,
      local_repo: localLike ? hasRepoAccess() : false,
      network_http: true,
      remote_executor: !!remoteUrl,
    },
    remote_executor_probe: remoteExecutor,
  };

  writeCachedProfile(profile);
  return profile;
}

export function attachCapabilityProfile(outcome, capabilityProfile) {
  if (!capabilityProfile) return outcome;
  return {
    ...outcome,
    meta: {
      ...(outcome.meta || {}),
      capability_profile: capabilityProfile,
    },
  };
}

export function createCapabilityProfileResolver() {
  let inMemoryProfile = readCachedProfile();

  return {
    async getProfile() {
      if (inMemoryProfile) return inMemoryProfile;
      inMemoryProfile = await buildCapabilityProfile();
      return inMemoryProfile;
    },
    async refreshProfile() {
      inMemoryProfile = await buildCapabilityProfile();
      return inMemoryProfile;
    },
    getCachedProfile() {
      return inMemoryProfile;
    },
  };
}
