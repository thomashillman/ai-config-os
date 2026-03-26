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
import { MCP_TOOL_DEFINITIONS } from './tool-definitions.mjs';
import { TaskStore } from "../lib/task-store.mjs";
import { createTaskControlPlaneService } from "../lib/task-control-plane-service.mjs";
import { createMomentumEngine } from "../lib/momentum-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const WORKER_BASE_URL = (process.env.AI_CONFIG_OS_WORKER_URL || process.env.WORKER_URL || '').replace(/\/+$/, '');
const WORKER_AUTH_TOKEN = process.env.AI_CONFIG_OS_WORKER_TOKEN || process.env.AUTH_TOKEN || '';

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
const taskStore = new TaskStore();
const taskService = createTaskControlPlaneService({ taskStore });
const momentumEngine = createMomentumEngine({ taskStore });

async function callWorkerTaskApi({ method, path: routePath, body }) {
  if (!WORKER_BASE_URL) {
    throw new Error('AI_CONFIG_OS_WORKER_URL (or WORKER_URL) is required for Worker-first task tools');
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(WORKER_AUTH_TOKEN ? { Authorization: `Bearer ${WORKER_AUTH_TOKEN}` } : {}),
  };
  const response = await fetch(`${WORKER_BASE_URL}${routePath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Worker request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

const server = new Server(
  { name: "ai-config-os", version: getReleaseVersion() },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: MCP_TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
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
  taskService,
  momentumEngine,
  callWorkerTaskApi,
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
    taskService,
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
