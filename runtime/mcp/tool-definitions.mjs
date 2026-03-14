/**
 * Canonical MCP-exposed tools for ai-config-os runtime.
 */

export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'resolve_outcome_contract',
    description: 'Resolve EffectiveOutcomeContract for a target tool before execution',
    executionClass: 'local',
    requiredCapabilities: [],
    inputSchema: {
      type: 'object',
      required: ['tool_name'],
      properties: {
        tool_name: { type: 'string', description: 'Tool name to resolve' }
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Inspect the runtime route resolver directly.' }
  },
  {
    name: 'sync_tools',
    description: 'Sync desired tool config to live Claude Code environment',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'fs.write', 'shell.exec'],
    inputSchema: {
      type: 'object',
      properties: {
        dry_run: { type: 'boolean', description: 'Preview changes without applying', default: false }
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Run runtime/sync.sh directly and inspect output.' }
  },
  {
    name: 'list_tools',
    description: 'List installed tools and their status from the runtime manifest',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Run runtime/manifest.sh status directly.' }
  },
  {
    name: 'get_config',
    description: 'Get the merged runtime config (global + machine + project)',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Run shared/lib/config-merger.sh directly.' }
  },
  {
    name: 'skill_stats',
    description: 'Get a summary table of all skills with type, status, variants, and test count',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Run ops/skill-stats.sh directly.' }
  },
  {
    name: 'context_cost',
    description: 'Analyse token footprint of all skills',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', description: 'Token threshold for warnings', default: 2000 }
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Run ops/context-cost.sh with --threshold.' }
  },
  {
    name: 'validate_all',
    description: 'Run the full validation suite (dependencies, variants, structure tests, docs, plugin)',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Run ops/validate-all.sh directly.' }
  },
  {
    name: 'mcp_list',
    description: 'List MCP servers currently configured in ~/.claude/mcp.json',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Run runtime/adapters/mcp-adapter.sh list directly.' }
  },
  {
    name: 'mcp_add',
    description: 'Add an MCP server entry',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'fs.write', 'shell.exec'],
    inputSchema: {
      type: 'object',
      required: ['name', 'command'],
      properties: {
        name: { type: 'string', description: 'MCP server name' },
        command: { type: 'string', description: 'Command to run the server' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' }
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Edit ~/.claude/mcp.json directly.' }
  },
  {
    name: 'mcp_remove',
    description: 'Remove an MCP server entry',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'fs.write', 'shell.exec'],
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'MCP server name to remove' }
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Edit ~/.claude/mcp.json directly.' }
  },
  {
    name: 'task_start_review_repository',
    description: 'Start a review_repository portable task from route-specific inputs',
    executionClass: 'local',
    requiredCapabilities: [],
    inputSchema: {
      type: 'object',
      required: ['task_id', 'goal', 'route_inputs'],
      properties: {
        task_id: { type: 'string' },
        goal: { type: 'string' },
        route_inputs: { type: 'object' },
        capability_profile: { type: 'object' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker /v1/tasks route directly.' }
  },
  {
    name: 'task_resume_review_repository',
    description: 'Resume an existing review_repository task and re-evaluate route strength',
    executionClass: 'local',
    requiredCapabilities: [],
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
        capability_profile: { type: 'object' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker /v1/tasks/:taskId/readiness after resume.' }
  },
  {
    name: 'task_get_readiness',
    description: 'Get task readiness projection and route-upgrade availability',
    executionClass: 'local',
    requiredCapabilities: [],
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker /v1/tasks/:taskId/readiness directly.' }
  }
];

export const MCP_TOOL_MAP = new Map(MCP_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
