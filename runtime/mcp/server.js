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
import { verifySignedRequest } from "../../shared/contracts/request-signature.mjs";

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
  tools: MCP_TOOL_DEFINITIONS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

const handleCallTool = createCallToolHandler({
  runScript,
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
  const signingSecret = process.env.SIGNING_SECRET || "";

  app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173", "http://localhost:4242"] }));
  app.use(express.json({
    limit: "10kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }));

  app.use("/api", async (req, res, next) => {
    try {
      const canonicalPath = req.originalUrl.split("?")[0];
      const result = await verifySignedRequest({
        method: req.method,
        path: canonicalPath,
        headers: new Headers(req.headers),
        body: req.rawBody || "",
        secret: signingSecret,
      });

      if (!result.ok) {
        res.status(result.error.status).json({ error: result.error });
        return;
      }

      next();
    } catch (error) {
      res.status(401).json({
        error: {
          status: 401,
          code: "signature_verification_error",
          message: error.message || "Failed to verify request signature",
          details: {},
        },
      });
    }
  });

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
