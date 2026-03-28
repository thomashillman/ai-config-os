import fs from 'node:fs';
import path from 'node:path';
import { ActionValidationError, createRuntimeActionDispatcher } from '../lib/runtime-action-dispatcher.mjs';
import { loadObservationSnapshot } from '../lib/observation-read-model.mjs';
import {
  buildAutoresearchRunGetContract,
  buildAutoresearchRunsContract,
  buildFrictionSignalsContract,
  buildSkillEffectivenessContract,
  buildSkillsListContract,
  buildToolUsageContract,
  parseSkillStatsOutput,
  readAutoresearchRuns,
} from '../lib/dashboard-analytics-contracts.mjs';

export function createDashboardApi({
  app,
  corsMiddleware,
  jsonMiddleware,
  tunnelPolicy,
  tunnelGuardFactory,
  runScript,
  resolveEffectiveOutcomeContract,
  validateNumber,
  capabilityProfileResolver,
  taskService,
  repoRoot,
  port,
}) {
  const runtimeActionDispatcher = createRuntimeActionDispatcher({ runScript, validateNumber });

  app.use(
    corsMiddleware({
      origin(origin, callback) {
        callback(null, tunnelPolicy.isOriginAllowed(origin));
      },
    })
  );
  app.use(jsonMiddleware({ limit: '10kb' }));
  app.use(tunnelGuardFactory(tunnelPolicy));

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

  function executeRuntimeAction(toolName, actionArgs, res) {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({
      toolName,
      executionChannel: 'dashboard',
    });

    try {
      const result = runtimeActionDispatcher.dispatch(toolName, actionArgs);
      res.json({
        output: result.output,
        success: result.success,
        effectiveOutcomeContract,
      });
    } catch (error) {
      if (error instanceof ActionValidationError) {
        res.status(400).json({ success: false, error: error.message, effectiveOutcomeContract });
        return;
      }
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'failed to run dashboard action',
        effectiveOutcomeContract,
      });
    }
  }

  app.get('/api/manifest', (req, res) => {
    executeRuntimeAction('list_tools', {}, res);
  });

  app.get('/api/skill-stats', (req, res) => {
    executeRuntimeAction('skill_stats', {}, res);
  });

  app.get('/api/context-cost', (req, res) => {
    executeRuntimeAction('context_cost', { threshold: req.query.threshold }, res);
  });

  app.get('/api/config', (req, res) => {
    executeRuntimeAction('get_config', {}, res);
  });

  app.get('/api/contracts/skills.list', (req, res) => {
    executeRuntimeAction('skill_stats', {}, {
      json(payload) {
        const skills = parseSkillStatsOutput(payload.output || '');
        res.json({ ...buildSkillsListContract(skills), effectiveOutcomeContract: payload.effectiveOutcomeContract });
      },
      status(code) {
        return res.status(code);
      },
    });
  });

  app.get('/api/contracts/skills.stats', async (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    try {
      const { events } = await loadObservationSnapshot({ home: process.env.HOME, projectDir: repoRoot });
      const outcomeEvents = events.filter((e) => e.type === 'skill_outcome');
      const totals = {};
      for (const e of outcomeEvents) {
        if (typeof e.skill !== 'string') continue;
        if (!totals[e.skill]) totals[e.skill] = { used: 0, replaced: 0 };
        if (e.outcome === 'output_used') totals[e.skill].used++;
        else if (e.outcome === 'output_replaced') totals[e.skill].replaced++;
      }
      const skills = Object.entries(totals)
        .map(([skill, c]) => ({
          skill,
          used: c.used,
          replaced: c.replaced,
          total: c.used + c.replaced,
          use_rate: c.used + c.replaced > 0 ? Math.round((c.used / (c.used + c.replaced)) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total);
      res.json({ ...buildSkillEffectivenessContract(skills, outcomeEvents.length), contract: 'skills.stats', effectiveOutcomeContract });
    } catch (err) {
      res.status(500).json({
        ...buildSkillEffectivenessContract([], 0),
        contract: 'skills.stats',
        success: false,
        error: err instanceof Error ? err.message : 'unexpected error',
        effectiveOutcomeContract,
      });
    }
  });

  app.get('/api/contracts/analytics.tool_usage', async (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    try {
      const { events } = await loadObservationSnapshot({ projectDir: repoRoot });
      const metrics = events.filter((e) => e.type === 'tool_usage');
      res.json({ ...buildToolUsageContract(metrics), effectiveOutcomeContract });
    } catch {
      res.json({ ...buildToolUsageContract([]), note: 'No metrics collected yet', effectiveOutcomeContract });
    }
  });

  app.get('/api/contracts/analytics.skill_effectiveness', async (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });

    if (!process.env.HOME) {
      res.status(503).json({ ...buildSkillEffectivenessContract([], 0), success: false, error: '$HOME is not set', effectiveOutcomeContract });
      return;
    }

    try {
      const { events } = await loadObservationSnapshot({ home: process.env.HOME, projectDir: repoRoot });
      const outcomeEvents = events.filter((e) => e.type === 'skill_outcome');

      const totals = {};
      for (const e of outcomeEvents) {
        if (typeof e.skill !== 'string') continue;
        if (!totals[e.skill]) totals[e.skill] = { used: 0, replaced: 0 };
        if (e.outcome === 'output_used') totals[e.skill].used++;
        else if (e.outcome === 'output_replaced') totals[e.skill].replaced++;
      }
      const skills = Object.entries(totals).map(([skill, c]) => ({
        skill,
        used: c.used,
        replaced: c.replaced,
        total: c.used + c.replaced,
        use_rate: c.used + c.replaced > 0 ? Math.round((c.used / (c.used + c.replaced)) * 100) : 0,
      })).sort((a, b) => b.total - a.total);

      res.json({ ...buildSkillEffectivenessContract(skills, outcomeEvents.length), effectiveOutcomeContract });
    } catch (err) {
      res.status(500).json({ ...buildSkillEffectivenessContract([], 0), success: false, error: err instanceof Error ? err.message : 'unexpected error', effectiveOutcomeContract });
    }
  });

  app.get('/api/contracts/analytics.friction_signals', (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    const emptyRetro = { artifact_count: 0, signal_breakdown: {}, top_recommendations: [] };

    if (!process.env.HOME) {
      res.json({ ...buildFrictionSignalsContract(emptyRetro), effectiveOutcomeContract });
      return;
    }

    const cacheFile = path.join(process.env.HOME, '.ai-config-os', 'cache', 'claude-code', 'retrospectives-aggregate.json');
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      const normalized = {
        artifact_count: typeof data.artifact_count === 'number' ? data.artifact_count : 0,
        signal_breakdown: data.signal_breakdown && typeof data.signal_breakdown === 'object' && !Array.isArray(data.signal_breakdown) ? data.signal_breakdown : {},
        top_recommendations: Array.isArray(data.top_recommendations) ? data.top_recommendations : [],
      };
      res.json({ ...buildFrictionSignalsContract(normalized), effectiveOutcomeContract });
    } catch {
      res.json({ ...buildFrictionSignalsContract(emptyRetro), effectiveOutcomeContract });
    }
  });

  app.get('/api/contracts/analytics.autoresearch_runs', (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });

    if (!repoRoot) {
      res.status(503).json({ ...buildAutoresearchRunsContract([]), success: false, error: 'repoRoot not configured', effectiveOutcomeContract });
      return;
    }

    try {
      const runs = readAutoresearchRuns(repoRoot);
      res.json({ ...buildAutoresearchRunsContract(runs), effectiveOutcomeContract });
    } catch (err) {
      res.status(500).json({ ...buildAutoresearchRunsContract([]), success: false, error: err instanceof Error ? err.message : 'unexpected error', effectiveOutcomeContract });
    }
  });

  app.get('/api/contracts/analytics.autoresearch_run_get', (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    const skill = typeof req.query.skill === 'string' ? req.query.skill : '';
    const runDir = typeof req.query.run_dir === 'string' ? req.query.run_dir : '';

    if (!repoRoot) {
      res.status(503).json({ ...buildAutoresearchRunGetContract([], skill, runDir), success: false, error: 'repoRoot not configured', effectiveOutcomeContract });
      return;
    }

    try {
      const runs = readAutoresearchRuns(repoRoot);
      const payload = buildAutoresearchRunGetContract(runs, skill, runDir);
      if (!payload.run) {
        res.status(404).json({ ...payload, success: false, error: 'run not found', effectiveOutcomeContract });
        return;
      }
      res.json({ ...payload, effectiveOutcomeContract });
    } catch (err) {
      res.status(500).json({ ...buildAutoresearchRunGetContract([], skill, runDir), success: false, error: err instanceof Error ? err.message : 'unexpected error', effectiveOutcomeContract });
    }
  });

  // Backward-compatible aliases for existing dashboard consumers.
  app.get('/api/analytics', async (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    try {
      const { events } = await loadObservationSnapshot({ projectDir: repoRoot });
      const metrics = events.filter((e) => e.type === 'tool_usage');
      res.json({ metrics, success: true, effectiveOutcomeContract });
    } catch {
      res.json({ metrics: [], success: true, note: 'No metrics collected yet', effectiveOutcomeContract });
    }
  });

  app.get('/api/skill-analytics', async (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });

    if (!process.env.HOME) {
      res.status(503).json({ skills: [], total_events: 0, success: false, error: '$HOME is not set', effectiveOutcomeContract });
      return;
    }

    try {
      const { events } = await loadObservationSnapshot({ home: process.env.HOME, projectDir: repoRoot });
      const outcomeEvents = events.filter((e) => e.type === 'skill_outcome');

      const totals = {};
      for (const e of outcomeEvents) {
        if (typeof e.skill !== 'string') continue;
        if (!totals[e.skill]) totals[e.skill] = { used: 0, replaced: 0 };
        if (e.outcome === 'output_used') totals[e.skill].used++;
        else if (e.outcome === 'output_replaced') totals[e.skill].replaced++;
      }
      const skills = Object.entries(totals).map(([skill, c]) => ({
        skill,
        used: c.used,
        replaced: c.replaced,
        total: c.used + c.replaced,
        use_rate: c.used + c.replaced > 0 ? Math.round((c.used / (c.used + c.replaced)) * 100) : 0,
      })).sort((a, b) => b.total - a.total);

      res.json({ skills, total_events: outcomeEvents.length, success: true, effectiveOutcomeContract });
    } catch (err) {
      res.status(500).json({ skills: [], total_events: 0, success: false, error: err instanceof Error ? err.message : 'unexpected error', effectiveOutcomeContract });
    }
  });

  app.get('/api/retrospectives-summary', (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    const empty = { artifact_count: 0, signal_breakdown: {}, top_recommendations: [], success: true, effectiveOutcomeContract };

    if (!process.env.HOME) { res.json(empty); return; }

    const cacheFile = path.join(
      process.env.HOME, '.ai-config-os', 'cache', 'claude-code', 'retrospectives-aggregate.json'
    );
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      res.json({
        artifact_count: typeof data.artifact_count === 'number' ? data.artifact_count : 0,
        signal_breakdown: data.signal_breakdown && typeof data.signal_breakdown === 'object' && !Array.isArray(data.signal_breakdown) ? data.signal_breakdown : {},
        top_recommendations: Array.isArray(data.top_recommendations) ? data.top_recommendations : [],
        success: true,
        effectiveOutcomeContract,
      });
    } catch {
      res.json(empty);
    }
  });

  app.get('/api/autoresearch-runs', (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });

    if (!repoRoot) {
      res.status(503).json({ runs: [], success: false, error: 'repoRoot not configured', effectiveOutcomeContract });
      return;
    }

    try {
      const runs = readAutoresearchRuns(repoRoot);
      res.json({ runs, success: true, effectiveOutcomeContract });
    } catch (err) {
      res.status(500).json({ runs: [], success: false, error: err instanceof Error ? err.message : 'unexpected error', effectiveOutcomeContract });
    }
  });

  app.post('/api/sync', (req, res) => {
    executeRuntimeAction('sync_tools', { dry_run: req.body?.dry_run }, res);
  });

  app.get('/api/validate-all', (req, res) => {
    executeRuntimeAction('validate_all', {}, res);
  });

  app.get('/api/outcome-contract', (req, res) => {
    const toolName = typeof req.query.tool_name === 'string' ? req.query.tool_name : '';
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName, executionChannel: 'dashboard' });
    res.json({ effectiveOutcomeContract, success: true });
  });

  app.post('/api/tasks/review/start', (req, res) => {
    if (!taskService) {
      res.status(503).json({ success: false, error: 'task service unavailable' });
      return;
    }

    try {
      const result = taskService.startReviewRepositoryTask({
        taskId: req.body?.task_id,
        goal: req.body?.goal,
        routeInputs: req.body?.route_inputs,
        capabilityProfile: req.body?.capability_profile,
      });
      res.status(201).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'failed to start task' });
    }
  });

  app.post('/api/tasks/:taskId/review/resume', (req, res) => {
    if (!taskService) {
      res.status(503).json({ success: false, error: 'task service unavailable' });
      return;
    }

    try {
      const result = taskService.resumeReviewRepositoryTask({
        taskId: req.params.taskId,
        capabilityProfile: req.body?.capability_profile,
      });
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'failed to resume task' });
    }
  });

  app.get('/api/tasks/:taskId/readiness', (req, res) => {
    if (!taskService) {
      res.status(503).json({ success: false, error: 'task service unavailable' });
      return;
    }

    try {
      res.json({ success: true, readiness: taskService.getReadiness(req.params.taskId) });
    } catch (error) {
      res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'failed to load readiness' });
    }
  });


  return {
    app,
    host: tunnelPolicy.host,
    port,
    start() {
      return app.listen(port, tunnelPolicy.host, () => {
        console.error(`[ai-config-os dashboard API] Listening on http://${tunnelPolicy.host}:${port}`);
      });
    },
  };
}
