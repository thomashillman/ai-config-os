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
import { validateName, validateNumber } from "./validators.mjs";
import { isCommandNameSafe } from "../adapters/shell-safe.mjs";
import { resolveRepoScriptPath } from "./path-utils.mjs";
import { getReleaseVersion } from "../lib/release-version.mjs";
import { toToolResponse, toolError } from "./tool-response.mjs";
import { assertRuntimePrereqs } from "./runtime-prereqs.mjs";
import { createCallToolHandler } from "./handlers.mjs";
import { resolveEffectiveOutcomeContract } from "../lib/outcome-resolver.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

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

const capabilityProfileResolver = createCapabilityProfileResolver();

const server = new Server(
  { name: "ai-config-os", version: getReleaseVersion() },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "resolve_outcome_contract",
      description: "Resolve EffectiveOutcomeContract for a target tool before execution",
      inputSchema: {
        type: "object",
        required: ["tool_name"],
        properties: {
          tool_name: { type: "string", description: "Tool name to resolve" }
        }
      }
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
  validateName,
  validateNumber,
  isCommandNameSafe,
  resolveEffectiveOutcomeContract,
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

  function executeWithOutcomeContract(toolName, run) {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({
      toolName,
      executionChannel: 'dashboard',
    });

    const result = run();

    return {
      ...result,
      effectiveOutcomeContract,
    };
  }

  // Dashboard data endpoints
  function respondWithOutcome(res, result) {
    const capabilityProfile = capabilityProfileResolver.getCachedProfile();
    res.json({ output: result.output, success: result.success, capability_profile: capabilityProfile || null });
  }

  app.get("/api/manifest", (req, res) => {
    const response = executeWithOutcomeContract('list_tools', () => runScript("runtime/manifest.sh", ["status"]));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
  });

  app.get("/api/skill-stats", (req, res) => {
    const response = executeWithOutcomeContract('skill_stats', () => runScript("ops/skill-stats.sh"));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
  });

  app.get("/api/context-cost", (req, res) => {
    const threshold = validateNumber(req.query.threshold, 2000);
    const response = executeWithOutcomeContract('context_cost', () => runScript("ops/context-cost.sh", ["--threshold", String(threshold)]));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
  });

  app.get("/api/config", (req, res) => {
    const response = executeWithOutcomeContract('get_config', () => runScript("shared/lib/config-merger.sh"));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
  });

  app.get("/api/analytics", (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    const metricsFile = `${REPO_ROOT}/.claude/metrics.jsonl`;
    try {
      const lines = fs.readFileSync(metricsFile, "utf8").trim().split("\n").filter(Boolean);
      const metrics = lines.map(l => JSON.parse(l));
      res.json({ metrics, success: true, effectiveOutcomeContract });
    } catch {
      res.json({ metrics: [], success: true, note: "No metrics collected yet", effectiveOutcomeContract });
    }
  });

  app.post("/api/sync", (req, res) => {
    const response = executeWithOutcomeContract('sync_tools', () => runScript("runtime/sync.sh", req.body?.dry_run ? ["--dry-run"] : []));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
  });

  app.get("/api/validate-all", (req, res) => {
    const response = executeWithOutcomeContract('validate_all', () => runScript("ops/validate-all.sh"));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
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
