/**
 * tool-registry.mjs
 *
 * Single source of truth for MCP tools.
 * Each entry defines its schema, metadata, and dispatch handler.
 */

const EMPTY_OBJECT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

export const TOOL_REGISTRY = {
  sync_tools: {
    description: 'Sync desired tool config to live Claude Code environment',
    schema: {
      type: 'object',
      properties: {
        dry_run: { type: 'boolean', description: 'Preview changes without applying', default: false }
      },
      additionalProperties: false,
    },
    run: ({ runScript }, args) => runScript('runtime/sync.sh', args.dry_run ? ['--dry-run'] : []),
  },
  list_tools: {
    description: 'List installed tools and their status from the runtime manifest',
    schema: EMPTY_OBJECT_SCHEMA,
    run: ({ runScript }) => runScript('runtime/manifest.sh', ['status']),
  },
  get_config: {
    description: 'Get the merged runtime config (global + machine + project)',
    schema: EMPTY_OBJECT_SCHEMA,
    run: ({ runScript }) => runScript('shared/lib/config-merger.sh'),
  },
  skill_stats: {
    description: 'Get a summary table of all skills with type, status, variants, and test count',
    schema: EMPTY_OBJECT_SCHEMA,
    run: ({ runScript }) => runScript('ops/skill-stats.sh'),
  },
  context_cost: {
    description: 'Analyse token footprint of all skills',
    schema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', description: 'Token threshold for warnings', default: 2000 }
      },
      additionalProperties: false,
    },
    run: ({ runScript }, args) => {
      const threshold = args.threshold ?? 2000;
      return runScript('ops/context-cost.sh', ['--threshold', String(threshold)]);
    },
  },
  validate_all: {
    description: 'Run the full validation suite (dependencies, variants, structure tests, docs, plugin)',
    schema: EMPTY_OBJECT_SCHEMA,
    run: ({ runScript }) => runScript('ops/validate-all.sh'),
  },
  mcp_list: {
    description: 'List MCP servers currently configured in ~/.claude/mcp.json',
    schema: EMPTY_OBJECT_SCHEMA,
    run: ({ runScript }) => runScript('runtime/adapters/mcp-adapter.sh', ['list']),
  },
  mcp_add: {
    description: 'Add an MCP server entry',
    schema: {
      type: 'object',
      required: ['name', 'command'],
      properties: {
        name: { type: 'string', description: 'MCP server name' },
        command: { type: 'string', description: 'Command to run the server' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' }
      },
      additionalProperties: false,
    },
    run: ({ runScript }, args) => runScript(
      'runtime/adapters/mcp-adapter.sh',
      ['add', args.name, args.command, ...(args.args ?? [])]
    ),
  },
  mcp_remove: {
    description: 'Remove an MCP server entry',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'MCP server name to remove' }
      },
      additionalProperties: false,
    },
    run: ({ runScript }, args) => runScript('runtime/adapters/mcp-adapter.sh', ['remove', args.name]),
  },
  task_start_review_repository: {
    description: 'Start a review_repository portable task from route-specific inputs',
    schema: {
      type: 'object',
      required: ['task_id', 'goal', 'route_inputs'],
      properties: {
        task_id: { type: 'string' },
        goal: { type: 'string' },
        route_inputs: { type: 'object' },
        capability_profile: { type: 'object' },
      },
      additionalProperties: false,
    },
    run: ({ taskService }, args) => taskService.startReviewRepositoryTask({
      taskId: args.task_id,
      goal: args.goal,
      routeInputs: args.route_inputs,
      capabilityProfile: args.capability_profile,
    }),
  },
  task_resume_review_repository: {
    description: 'Resume an existing review_repository task and re-evaluate route strength',
    schema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
        capability_profile: { type: 'object' },
      },
      additionalProperties: false,
    },
    run: ({ taskService }, args) => taskService.resumeReviewRepositoryTask({
      taskId: args.task_id,
      capabilityProfile: args.capability_profile,
    }),
  },
  task_get_readiness: {
    description: 'Get task readiness projection and route-upgrade availability',
    schema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
      },
      additionalProperties: false,
    },
    run: ({ taskService }, args) => ({
      readiness: taskService.getReadiness(args.task_id),
    }),
  }
};

export function getToolList() {
  return Object.entries(TOOL_REGISTRY).map(([name, config]) => ({
    name,
    description: config.description,
    inputSchema: config.schema,
  }));
}
