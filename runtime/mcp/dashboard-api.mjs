import fs from 'node:fs';
import path from 'node:path';
import { ActionValidationError, createRuntimeActionDispatcher } from '../lib/runtime-action-dispatcher.mjs';
import { loadObservationSnapshot } from '../lib/observation-read-model.mjs';

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
        success: result.success,
        data: result.parsed?.data ?? {},
        schema_ids: result.parsed?.schemaIds ?? [],
        capability: result.parsed?.capability ?? { local_only: true, worker_backed: false },
        capability_by_schema: result.parsed?.capabilityBySchema ?? {},
        diagnostics: result.output ? { raw_output: result.output } : undefined,
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

    const skillsDir = path.join(repoRoot, 'shared', 'skills');
    const runs = [];
    const MAX_RESULTS_BYTES = 512 * 1024; // 512 KB per results.json - sanity limit

    try {
      const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const skillName of skillDirs) {
        const skillPath = path.join(skillsDir, skillName);
        let runDirs;
        try {
          runDirs = fs.readdirSync(skillPath, { withFileTypes: true })
            .filter(d => d.isDirectory() && d.name.startsWith('autoresearch-'))
            .map(d => d.name);
        } catch {
          continue;
        }
        for (const runDir of runDirs) {
          const resultsFile = path.join(skillPath, runDir, 'results.json');
          try {
            const stat = fs.statSync(resultsFile);
            if (stat.size > MAX_RESULTS_BYTES) continue; // skip oversized files
            const data = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
            runs.push({
              skill: skillName,
              run_dir: runDir,
              status: typeof data.status === 'string' ? data.status : 'unknown',
              control_score: typeof data.control_score === 'number' ? data.control_score : null,
              baseline_score: typeof data.baseline_score === 'number' ? data.baseline_score : null,
              best_score: typeof data.best_score === 'number' ? data.best_score : null,
              current_experiment: typeof data.current_experiment === 'number' ? data.current_experiment : 0,
              experiment_count: Array.isArray(data.experiments) ? data.experiments.length : 0,
              improved_by: typeof data.baseline_score === 'number' && typeof data.best_score === 'number'
                ? Math.round(data.best_score - data.baseline_score)
                : null,
            });
          } catch {
            // results.json missing, malformed, or oversized - skip silently
          }
        }
      }
      runs.sort((a, b) => (b.best_score ?? 0) - (a.best_score ?? 0));
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
