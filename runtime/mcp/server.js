#!/usr/bin/env node
// ai-config-os MCP server
// Exposes runtime management and skill library operations as MCP tools

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

function runScript(script, args = "") {
  try {
    const result = execSync(`bash ${path.join(REPO_ROOT, script)} ${args}`, {
      encoding: "utf8",
      timeout: 30000,
      cwd: REPO_ROOT,
    });
    return { success: true, output: result };
  } catch (err) {
    return { success: false, output: err.stdout || err.message, error: err.stderr };
  }
}

const server = new Server(
  { name: "ai-config-os", version: "0.5.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "sync_tools": {
      const flags = args?.dry_run ? "--dry-run" : "";
      const result = runScript("runtime/sync.sh", flags);
      return { content: [{ type: "text", text: result.output }] };
    }

    case "list_tools": {
      const result = runScript("runtime/manifest.sh", "status");
      return { content: [{ type: "text", text: result.output }] };
    }

    case "get_config": {
      const result = runScript("shared/lib/config-merger.sh");
      return { content: [{ type: "text", text: result.success ? result.output : result.error }] };
    }

    case "skill_stats": {
      const result = runScript("ops/skill-stats.sh");
      return { content: [{ type: "text", text: result.output }] };
    }

    case "context_cost": {
      const threshold = args?.threshold || 2000;
      const result = runScript("ops/context-cost.sh", `--threshold ${threshold}`);
      return { content: [{ type: "text", text: result.output }] };
    }

    case "validate_all": {
      const result = runScript("ops/validate-all.sh");
      return { content: [{ type: "text", text: result.output }] };
    }

    case "mcp_list": {
      const result = runScript("runtime/adapters/mcp-adapter.sh", "list");
      return { content: [{ type: "text", text: result.output }] };
    }

    case "mcp_add": {
      const argsStr = (args.args || []).join(" ");
      const result = runScript(
        "runtime/adapters/mcp-adapter.sh",
        `add "${args.name}" "${args.command}" ${argsStr}`
      );
      return { content: [{ type: "text", text: result.output }] };
    }

    case "mcp_remove": {
      const result = runScript("runtime/adapters/mcp-adapter.sh", `remove "${args.name}"`);
      return { content: [{ type: "text", text: result.output }] };
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ai-config-os MCP] Server running on stdio");
}

main().catch(console.error);
