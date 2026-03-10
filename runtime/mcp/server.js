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
import { validateName, validateNumber } from "./validators.mjs";
import { isCommandNameSafe } from "../adapters/shell-safe.mjs";
import { resolveRepoScriptPath } from "./path-utils.mjs";
import { getReleaseVersion } from "../lib/release-version.mjs";
import { createCapabilityProfileResolver } from "../lib/capability-profile.mjs";
import { toToolResponse, toolError } from "./tool-response.mjs";
import { assertRuntimePrereqs } from "./runtime-prereqs.mjs";
import { createCallToolHandler } from "./handlers.mjs";
import { resolveEffectiveOutcomeContract } from "../lib/outcome-resolver.mjs";
import { createTunnelPolicy, tunnelGuardMiddleware } from "./tunnel-security.mjs";
import { createDashboardApi } from "./dashboard-api.mjs";

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

function startDashboardApi() {
  const dashboardPort = Number(process.env.DASHBOARD_PORT || 4242);
  const api = createDashboardApi({
    app: express(),
    corsMiddleware: cors,
    jsonMiddleware: express.json,
    tunnelPolicy: createTunnelPolicy(process.env),
    tunnelGuardFactory: tunnelGuardMiddleware,
    runScript,
    resolveEffectiveOutcomeContract,
    validateNumber,
    capabilityProfileResolver,
    repoRoot: REPO_ROOT,
    port: Number.isFinite(dashboardPort) && dashboardPort > 0 ? dashboardPort : 4242,
  });
  api.start();
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
