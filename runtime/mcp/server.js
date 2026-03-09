#!/usr/bin/env node
// ai-config-os MCP server
// Exposes runtime management and skill library operations as MCP tools

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import fs from "fs";
import YAML from "yaml";
import { validateName, validateNumber } from "./validators.mjs";
import { isCommandNameSafe } from "../adapters/shell-safe.mjs";
import { resolveRepoScriptPath } from "./path-utils.mjs";
import { getReleaseVersion } from "../lib/release-version.mjs";
import { toToolResponse, toolError } from "./tool-response.mjs";
import { assertRuntimePrereqs } from "./runtime-prereqs.mjs";
import { createCallToolHandler } from "./handlers.mjs";
import { validateManifestFeatureFlags } from "../../scripts/build/lib/versioning.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

function buildApiResponse(result, selectedRoute) {
  const base = {
    output: result.output,
    success: result.success,
    status: result.success ? "Full" : "Degraded",
    selectedRoute,
  };

  if (result.success) {
    return base;
  }

  return {
    ...base,
    missingCapabilities: ["local-runtime-script-execution"],
    requiredUserInput: [
      "Inspect the error details and confirm whether to run the equivalent route manually.",
    ],
    guidanceEquivalentRoute:
      "Run the corresponding runtime script directly in a shell (for example via npm scripts or the repo script path) and capture the output.",
    guidanceFullWorkflowHigherCapabilityEnvironment:
      "Re-run this dashboard action in an environment with full local runtime script execution enabled so the complete workflow can run end-to-end.",
  };
}

function runScript(script, args = []) {
  const scriptPath = resolveRepoScriptPath(script, REPO_ROOT);
  if (!scriptPath) {
    return { success: false, output: "", error: "Script path escapes repository root" };
  }

  try {
    const output = execFileSync("bash", [scriptPath, ...args], {
      encoding: "utf8",
      timeout: 30000,
      cwd: REPO_ROOT,
    });
    return { success: true, output, error: null };
  } catch (err) {
    return {
      success: false,
      output: String(err.stdout || ""),
      error: String(err.stderr || err.message || "Unknown process error"),
    };
  }
}

function getFeatureFlags() {
  const manifestPath = path.join(REPO_ROOT, "runtime", "manifest.yaml");
  if (!fs.existsSync(manifestPath)) {
    return validateManifestFeatureFlags({});
  }

  const manifestRaw = fs.readFileSync(manifestPath, "utf8");
  const manifest = YAML.parse(manifestRaw) || {};
  return validateManifestFeatureFlags(manifest.feature_flags || {});
}

const server = new Server(
  { name: "ai-config-os", version: getReleaseVersion() },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "manifest_feature_flags",
      description: "Show validated manifest-controlled MCP feature flags",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "sync_tools",
      description: "Sync desired tool config to live Claude Code environment",
      inputSchema: {
        type: "object",
        properties: {
          dry_run: { type: "boolean", description: "Preview changes without applying", default: false }
        }
      }
    },
    {
      name: "run_script",
      description: "Legacy route-less script execution (disabled when explicit contract is enforced)",
      inputSchema: {
        type: "object",
        required: ["script"],
        properties: {
          script: { type: "string", description: "Repository-relative script path" },
          args: { type: "array", items: { type: "string" }, description: "Script arguments" }
        }
      }
    },
    {
      name: "remote_exec",
      description: "Execute a command through remote executor (feature-flag gated)",
      inputSchema: {
        type: "object",
        required: ["command"],
        properties: {
          command: { type: "string", description: "Command name" },
          args: { type: "array", items: { type: "string" }, description: "Command arguments" }
        }
      }
    },
    {
      name: "list_tools",
      description: "List installed tools and their status from the runtime manifest",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "get_config",
      description: "Get the merged runtime config (global + machine + project)",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "skill_stats",
      description: "Get a summary table of all skills with type, status, variants, and test count",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "context_cost",
      description: "Analyse token footprint of all skills",
      inputSchema: {
        type: "object",
        properties: {
          threshold: { type: "number", description: "Token threshold for warnings", default: 2000 }
        }
      }
    },
    {
      name: "validate_all",
      description: "Run the full validation suite (dependencies, variants, structure tests, docs, plugin)",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "mcp_list",
      description: "List MCP servers currently configured in ~/.claude/mcp.json",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "mcp_add",
      description: "Add an MCP server entry",
      inputSchema: {
        type: "object",
        required: ["name", "command"],
        properties: {
          name: { type: "string", description: "MCP server name" },
          command: { type: "string", description: "Command to run the server" },
          args: { type: "array", items: { type: "string" }, description: "Command arguments" }
        }
      }
    },
    {
      name: "mcp_remove",
      description: "Remove an MCP server entry",
      inputSchema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "MCP server name to remove" }
        }
      }
    }
  ]
}));

const handleCallTool = createCallToolHandler({
  runScript,
  getFeatureFlags,
  validateName,
  validateNumber,
  isCommandNameSafe,
  toToolResponse,
  toolError,
  getCapabilityProfile: () => capabilityProfileResolver.getProfile(),
});

server.setRequestHandler(CallToolRequestSchema, handleCallTool);

// Dashboard API server (Express)
function startDashboardApi() {
  const app = express();
  app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173", "http://localhost:4242"] }));
  app.use(express.json({ limit: "10kb" }));

  // Dashboard data endpoints
  function respondWithOutcome(res, result) {
    const capabilityProfile = capabilityProfileResolver.getCachedProfile();
    res.json({ output: result.output, success: result.success, capability_profile: capabilityProfile || null });
  }

  app.get("/api/manifest", (req, res) => {
    const result = runScript("runtime/manifest.sh", ["status"]);
    res.json(buildApiResponse(result, "manifest-status"));
  });

  app.get("/api/skill-stats", (req, res) => {
    const result = runScript("ops/skill-stats.sh");
    res.json(buildApiResponse(result, "skill-stats"));
  });

  app.get("/api/context-cost", (req, res) => {
    const threshold = validateNumber(req.query.threshold, 2000);
    const result = runScript("ops/context-cost.sh", ["--threshold", String(threshold)]);
    res.json(buildApiResponse(result, "context-cost"));
  });

  app.get("/api/config", (req, res) => {
    const result = runScript("shared/lib/config-merger.sh");
    res.json(buildApiResponse(result, "merged-config"));
  });

  app.get("/api/analytics", (req, res) => {
    const metricsFile = `${REPO_ROOT}/.claude/metrics.jsonl`;
    try {
      const lines = fs.readFileSync(metricsFile, "utf8").trim().split("\n").filter(Boolean);
      const metrics = lines.map(l => JSON.parse(l));
      res.json({ metrics, success: true, status: "Full", selectedRoute: "analytics-metrics" });
    } catch {
      res.json({ metrics: [], success: true, note: "No metrics collected yet", status: "Full", selectedRoute: "analytics-metrics" });
    }
  });

  app.post("/api/sync", (req, res) => {
    const result = runScript("runtime/sync.sh", req.body?.dry_run ? ["--dry-run"] : []);
    res.json(buildApiResponse(result, req.body?.dry_run ? "sync-tools-dry-run" : "sync-tools"));
  });

  app.get("/api/validate-all", (req, res) => {
    const result = runScript("ops/validate-all.sh");
    res.json(buildApiResponse(result, "validate-all"));
  });

  const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 4242;
  app.listen(DASHBOARD_PORT, () => {
    console.error(`[ai-config-os dashboard API] Listening on http://localhost:${DASHBOARD_PORT}`);
  });
}

async function main() {
  assertRuntimePrereqs();
  await capabilityProfileResolver.getProfile();
  startDashboardApi();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ai-config-os MCP] Server running on stdio");
}

main().catch(console.error);
