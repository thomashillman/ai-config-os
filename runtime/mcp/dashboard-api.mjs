import fs from 'node:fs';
import { ActionValidationError, createRuntimeActionDispatcher } from '../lib/runtime-action-dispatcher.mjs';

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

  app.get('/api/analytics', (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    const metricsFile = `${repoRoot}/.claude/metrics.jsonl`;
    try {
      const lines = fs.readFileSync(metricsFile, 'utf8').trim().split('\n').filter(Boolean);
      const metrics = lines.map((line) => JSON.parse(line));
      res.json({ metrics, success: true, effectiveOutcomeContract });
    } catch {
      res.json({ metrics: [], success: true, note: 'No metrics collected yet', effectiveOutcomeContract });
    }
  });

  app.get('/api/skill-analytics', (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    const outcomesFile = `${process.env.HOME}/.claude/skill-analytics/skill-outcomes.jsonl`;
    try {
      const lines = fs.readFileSync(outcomesFile, 'utf8').trim().split('\n').filter(Boolean);
      const events = lines.map((line) => JSON.parse(line));
      const totals = {};
      for (const e of events) {
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
      res.json({ skills, total_events: events.length, success: true, effectiveOutcomeContract });
    } catch {
      res.json({ skills: [], total_events: 0, success: true, note: 'No skill outcome data yet', effectiveOutcomeContract });
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
