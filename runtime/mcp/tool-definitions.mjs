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
    name: 'tasks.list',
    description: 'List tasks from the Worker task control plane',
    executionClass: 'edge',
    requiredCapabilities: ['network_http'],
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        updated_within: { type: 'number', minimum: 1 },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 10000, maxOutputBytes: 500000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker GET /v1/tasks directly.' }
  },
  {
    name: 'tasks.get',
    description: 'Get a task by id from the Worker task control plane',
    executionClass: 'edge',
    requiredCapabilities: ['network_http'],
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 10000, maxOutputBytes: 500000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker GET /v1/tasks/:id directly.' }
  },
  {
    name: 'tasks.events',
    description: 'Load task progress events from Worker',
    executionClass: 'edge',
    requiredCapabilities: ['network_http'],
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 10000, maxOutputBytes: 500000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker GET /v1/tasks/:id/progress-events directly.' }
  },
  {
    name: 'tasks.answer_question',
    description: 'Record an explicit answer for a blocking task question',
    executionClass: 'edge',
    requiredCapabilities: ['network_http'],
    inputSchema: {
      type: 'object',
      required: ['task_id', 'question_id', 'expected_version', 'answer'],
      properties: {
        task_id: { type: 'string' },
        question_id: { type: 'string' },
        expected_version: { type: 'integer' },
        answer: { type: 'string' },
        answered_by_route: { type: 'string' },
        answered_at: { type: 'string' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 10000, maxOutputBytes: 500000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker POST /v1/tasks/:id/questions/:questionId/answer directly.' }
  },
  {
    name: 'tasks.dismiss_question',
    description: 'Dismiss a blocking task question with explicit reason',
    executionClass: 'edge',
    requiredCapabilities: ['network_http'],
    inputSchema: {
      type: 'object',
      required: ['task_id', 'question_id', 'expected_version'],
      properties: {
        task_id: { type: 'string' },
        question_id: { type: 'string' },
        expected_version: { type: 'integer' },
        reason: { type: 'string' },
        dismissed_by_route: { type: 'string' },
        dismissed_at: { type: 'string' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 10000, maxOutputBytes: 500000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker POST /v1/tasks/:id/questions/:questionId/dismiss directly.' }
  },
  {
    name: 'tasks.continue',
    description: 'Create continuation package for a task from Worker',
    executionClass: 'edge',
    requiredCapabilities: ['network_http'],
    inputSchema: {
      type: 'object',
      required: ['task_id', 'handoff_token', 'effective_execution_contract'],
      properties: {
        task_id: { type: 'string' },
        handoff_token: { type: 'object' },
        effective_execution_contract: { type: 'object' },
        created_at: { type: 'string' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 10000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker POST /v1/tasks/:id/continuation directly.' }
  },
  {
    name: 'tasks.available_routes',
    description: 'Get available routes and best next route for a task from Worker',
    executionClass: 'edge',
    requiredCapabilities: ['network_http'],
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 10000, maxOutputBytes: 500000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker GET /v1/tasks/:id/available-routes directly.' }
  },
  {
    name: 'runtime.capabilities',
    description: 'Discover what resources are available on the active surface (Worker or local dashboard)',
    executionClass: 'edge',
    requiredCapabilities: ['network_http'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 10000, maxOutputBytes: 100000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use worker GET /v1/runtime/capabilities directly.' }
  },
  {
    name: 'skills.list',
    description: 'List all skills with type, status, variants, and test count from the local runtime',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use dashboard GET /api/contracts/skills.list directly.' }
  },
  {
    name: 'tooling.status',
    description: 'Get installed tool status and manifest from the local runtime',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use dashboard GET /api/contracts/tooling.status directly.' }
  },
  {
    name: 'config.summary',
    description: 'Get the merged runtime config summary (global + machine + project)',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Use dashboard GET /api/contracts/config.summary directly.' }
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
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Full', 'Degraded'] },
        capability: { type: 'object', properties: { local_only: { type: 'boolean' }, worker_backed: { type: 'boolean' } } },
        schema_ids: { type: 'array', items: { type: 'string', enum: ['tooling.sync'] } },
        data: {
          type: 'object',
          properties: {
            'tooling.sync': {
              type: 'object',
              properties: {
                dry_run: { type: 'boolean' },
                steps: { type: 'object' },
                warning_count: { type: 'number' },
                error_count: { type: 'number' }
              }
            }
          }
        },
        diagnostics: { type: 'object', properties: { raw_output: { type: 'string' } } }
      }
    },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Run runtime/sync.sh directly and inspect output.' }
  },
  {
    name: 'list_tools',
    description: 'List installed tools and their status from the runtime manifest',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Full', 'Degraded'] },
        capability: { type: 'object', properties: { local_only: { type: 'boolean' }, worker_backed: { type: 'boolean' } } },
        schema_ids: { type: 'array', items: { type: 'string', enum: ['runtime.capabilities', 'tooling.manifest', 'tooling.status'] } },
        data: { type: 'object' },
        diagnostics: { type: 'object', properties: { raw_output: { type: 'string' } } }
      }
    },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Run runtime/manifest.sh status directly.' }
  },
  {
    name: 'get_config',
    description: 'Get the merged runtime config (global + machine + project)',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Full', 'Degraded'] },
        capability: { type: 'object', properties: { local_only: { type: 'boolean' }, worker_backed: { type: 'boolean' } } },
        schema_ids: { type: 'array', items: { type: 'string', enum: ['config.summary'] } },
        data: { type: 'object' },
        diagnostics: { type: 'object', properties: { raw_output: { type: 'string' } } }
      }
    },
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
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Full', 'Degraded'] },
        capability: { type: 'object', properties: { local_only: { type: 'boolean' }, worker_backed: { type: 'boolean' } } },
        schema_ids: { type: 'array', items: { type: 'string', enum: ['runtime.context_cost'] } },
        data: { type: 'object' },
        diagnostics: { type: 'object', properties: { raw_output: { type: 'string' } } }
      }
    },
    limits: { timeoutMs: 30000, maxOutputBytes: 1000000 },
    fallbackPolicy: { mode: 'manual', notes: 'Run ops/context-cost.sh with --threshold.' }
  },
  {
    name: 'validate_all',
    description: 'Run the full validation suite (dependencies, variants, structure tests, docs, plugin)',
    executionClass: 'local',
    requiredCapabilities: ['fs.read', 'shell.exec'],
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Full', 'Degraded'] },
        capability: { type: 'object', properties: { local_only: { type: 'boolean' }, worker_backed: { type: 'boolean' } } },
        schema_ids: { type: 'array', items: { type: 'string', enum: ['audit.validate_all'] } },
        data: { type: 'object' },
        diagnostics: { type: 'object', properties: { raw_output: { type: 'string' } } }
      }
    },
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
  },
  {
    name: 'momentum_narrate',
    description: 'Produce a narration for a task lifecycle event (start, resume, finding evolved, upgrade available)',
    executionClass: 'local',
    requiredCapabilities: [],
    inputSchema: {
      type: 'object',
      required: ['task_id', 'narration_point'],
      properties: {
        task_id: { type: 'string', description: 'Task to narrate' },
        narration_point: {
          type: 'string',
          enum: ['onStart', 'onResume', 'onFindingEvolved', 'onUpgradeAvailable'],
          description: 'Which lifecycle event to narrate'
        },
        finding_id: { type: 'string', description: 'For onFindingEvolved: the finding that changed' },
        previous_confidence: { type: 'string', description: 'For onFindingEvolved: prior provenance status' },
        new_confidence: { type: 'string', description: 'For onFindingEvolved: new provenance status' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 5000, maxOutputBytes: 100000 },
    fallbackPolicy: { mode: 'prompt-only', notes: 'Narrator output is advisory; task proceeds without it.' }
  },
  {
    name: 'momentum_shelf',
    description: 'Get ranked continuable tasks ordered by environment-aware continuation value',
    executionClass: 'local',
    requiredCapabilities: [],
    inputSchema: {
      type: 'object',
      properties: {
        capability_profile: { type: 'object', description: 'Current capability profile for environment fit scoring' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 5000, maxOutputBytes: 100000 },
    fallbackPolicy: { mode: 'prompt-only', notes: 'Shelf is advisory; tasks can be resumed without it.' }
  },
  {
    name: 'momentum_reflect',
    description: 'Analyze narration effectiveness and produce improvement insights',
    executionClass: 'local',
    requiredCapabilities: [],
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO 8601 timestamp; look back from this point (default: 24h ago)' },
        auto_apply: { type: 'boolean', description: 'Auto-apply high-confidence insights (default: false)', default: false },
        min_confidence: { type: 'number', description: 'Minimum confidence for auto-apply (default: 0.7)', default: 0.7 },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 10000, maxOutputBytes: 500000 },
    fallbackPolicy: { mode: 'prompt-only', notes: 'Reflection is advisory; system works without it.' }
  },
  {
    name: 'momentum_resolve_intent',
    description: 'Resolve a natural language phrase to a task type and route hints',
    executionClass: 'local',
    requiredCapabilities: [],
    inputSchema: {
      type: 'object',
      required: ['phrase'],
      properties: {
        phrase: { type: 'string', description: 'Natural language user intent (e.g. "review this repository")' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 2000, maxOutputBytes: 10000 },
    fallbackPolicy: { mode: 'prompt-only', notes: 'Intent resolution is advisory; task can be started manually.' }
  },
  {
    name: 'momentum_record_response',
    description: 'Record user response to a narration event for self-improvement tracking',
    executionClass: 'local',
    requiredCapabilities: [],
    inputSchema: {
      type: 'object',
      required: ['task_id', 'narration_event_id', 'response_type'],
      properties: {
        task_id: { type: 'string' },
        narration_event_id: { type: 'string', description: 'event_id from the narration_shown progress event' },
        response_type: {
          type: 'string',
          enum: ['engaged', 'ignored', 'follow_up', 'changed_course', 'accepted_upgrade', 'declined_upgrade']
        },
        time_to_action_ms: { type: 'number', description: 'Milliseconds between narration and user action' },
        follow_up_text: { type: 'string', description: 'User follow-up text (for follow_up response type)' },
      }
    },
    outputSchema: { type: 'object' },
    limits: { timeoutMs: 2000, maxOutputBytes: 10000 },
    fallbackPolicy: { mode: 'prompt-only', notes: 'Response recording is non-critical; system works without it.' }
  },
];

export const MCP_TOOL_MAP = new Map(MCP_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
