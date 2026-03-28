function parseBooleanText(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function parseManifestStatus(rawOutput) {
  const device = rawOutput.match(/^Device:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const lastSynced = rawOutput.match(/^Last synced:\s*(.+)$/m)?.[1]?.trim() ?? null;

  const featureFlags = {};
  const trackedTools = [];

  for (const line of rawOutput.split('\n')) {
    const flagMatch = line.match(/^\s{2}([a-z0-9_]+):\s*(true|false)$/i);
    if (flagMatch) {
      const parsed = parseBooleanText(flagMatch[2]);
      if (parsed !== null) {
        featureFlags[flagMatch[1]] = parsed;
      }
      continue;
    }

    const toolMatch = line.match(/^\s{2}([^:]+):\s*([^\s]+)\s*\(updated:\s*([^\)]+)\)$/);
    if (toolMatch) {
      trackedTools.push({
        tool: toolMatch[1].trim(),
        status: toolMatch[2].trim(),
        last_updated: toolMatch[3].trim(),
      });
    }
  }

  return {
    data: {
      'tooling.manifest': {
        device,
        last_synced: lastSynced,
        feature_flags: featureFlags,
        tracked_tools: trackedTools,
      },
      'tooling.status': {
        has_manifest: !rawOutput.includes('No manifest'),
        tracked_tool_count: trackedTools.length,
      },
      'runtime.capabilities': {
        feature_flags: featureFlags,
      },
    },
    schemaIds: ['tooling.manifest', 'tooling.status', 'runtime.capabilities'],
    capability: {
      local_only: false,
      worker_backed: true,
    },
    capabilityBySchema: {
      'runtime.capabilities': { local_only: true, worker_backed: false },
      'tooling.manifest': { local_only: false, worker_backed: true },
      'tooling.status': { local_only: false, worker_backed: true },
    },
    summary: `Parsed manifest status for ${trackedTools.length} tracked tool(s).`,
  };
}

function parseSyncOutput(rawOutput, normalizedArgs = {}) {
  const steps = {
    started: /Starting sync/.test(rawOutput),
    subsystem_ran: /Running sync subsystem phase/.test(rawOutput),
    diff_ran: /Config diff/.test(rawOutput),
    mcp_sync_ran: /Syncing MCP servers/.test(rawOutput),
    complete: /Sync complete\./.test(rawOutput),
  };

  const warnings = rawOutput.split('\n').filter((line) => line.startsWith('[warn]'));
  const errors = rawOutput.split('\n').filter((line) => line.startsWith('[error]'));

  return {
    data: {
      'tooling.sync': {
        dry_run: Boolean(normalizedArgs.dry_run),
        steps,
        warning_count: warnings.length,
        error_count: errors.length,
      },
    },
    schemaIds: ['tooling.sync'],
    capability: {
      local_only: false,
      worker_backed: true,
    },
    capabilityBySchema: {
      'tooling.sync': { local_only: false, worker_backed: true },
    },
    summary: `Sync ${steps.complete ? 'completed' : 'did not complete'}${normalizedArgs.dry_run ? ' (dry-run)' : ''}.`,
  };
}

function parseConfigSummary(rawOutput) {
  const topLevelKeys = rawOutput
    .split('\n')
    .filter((line) => /^[a-zA-Z0-9_-]+:\s*/.test(line))
    .map((line) => line.split(':')[0]);

  return {
    data: {
      'config.summary': {
        top_level_keys: Array.from(new Set(topLevelKeys)),
        line_count: rawOutput.split('\n').filter(Boolean).length,
        has_mcps: /(^|\n)mcps:/m.test(rawOutput),
      },
    },
    schemaIds: ['config.summary'],
    capability: {
      local_only: false,
      worker_backed: true,
    },
    capabilityBySchema: {
      'config.summary': { local_only: false, worker_backed: true },
    },
    summary: `Parsed merged config with ${Array.from(new Set(topLevelKeys)).length} top-level key(s).`,
  };
}

function parseValidateAllOutput(rawOutput) {
  const stageMatches = [...rawOutput.matchAll(/^Step\s+([0-9]+):\s+(.+)$/gm)];
  const passCount = (rawOutput.match(/✓ Pass/g) || []).length;
  const failCount = (rawOutput.match(/✗ Fail/g) || []).length;
  const nonBlockingFailCount = (rawOutput.match(/✗ Fail \(non-blocking\)/g) || []).length;

  return {
    data: {
      'audit.validate_all': {
        stage_count: stageMatches.length,
        stages: stageMatches.map((match) => ({ id: Number(match[1]), name: match[2].trim() })),
        pass_count: passCount,
        fail_count: failCount,
        non_blocking_fail_count: nonBlockingFailCount,
        passed: /All validation stages passed/.test(rawOutput),
      },
    },
    schemaIds: ['audit.validate_all'],
    capability: {
      local_only: false,
      worker_backed: true,
    },
    capabilityBySchema: {
      'audit.validate_all': { local_only: false, worker_backed: true },
    },
    summary: `Validation suite recorded ${passCount} pass result(s) and ${failCount} fail result(s).`,
  };
}

function parseContextCostOutput(rawOutput) {
  const totalTokens = Number(rawOutput.match(/Total tokens:\s*([0-9]+)/)?.[1] || 0);
  const threshold = Number(rawOutput.match(/Threshold:\s*([0-9]+)/)?.[1] || 0);
  const overThreshold = Number(rawOutput.match(/Skills over threshold:\s*([0-9]+)/)?.[1] || 0);

  const skillEntries = [];
  for (const line of rawOutput.split('\n')) {
    const match = line.match(/^([a-z0-9_-]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)%$/i);
    if (match) {
      skillEntries.push({
        skill: match[1],
        words: Number(match[2]),
        tokens: Number(match[3]),
        percent_of_total: Number(match[4]),
      });
    }
  }

  return {
    data: {
      'runtime.context_cost': {
        total_tokens: totalTokens,
        threshold,
        skills_over_threshold: overThreshold,
        skills: skillEntries,
      },
    },
    schemaIds: ['runtime.context_cost'],
    capability: {
      local_only: false,
      worker_backed: true,
    },
    capabilityBySchema: {
      'runtime.context_cost': { local_only: false, worker_backed: true },
    },
    summary: `Context cost totals ${totalTokens} estimated token(s).`,
  };
}

export function parseRuntimeActionOutput(actionName, rawOutput, { normalizedArgs = {} } = {}) {
  const output = typeof rawOutput === 'string' ? rawOutput : '';

  switch (actionName) {
    case 'list_tools':
      return parseManifestStatus(output);
    case 'sync_tools':
      return parseSyncOutput(output, normalizedArgs);
    case 'get_config':
      return parseConfigSummary(output);
    case 'validate_all':
      return parseValidateAllOutput(output);
    case 'context_cost':
      return parseContextCostOutput(output);
    default:
      return {
        data: {},
        schemaIds: [],
        capability: {
          local_only: true,
          worker_backed: false,
        },
        capabilityBySchema: {},
        summary: 'No structured parser available for this action.',
      };
  }
}
