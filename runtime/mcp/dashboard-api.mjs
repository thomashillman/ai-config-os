import fs from 'node:fs';
import path from 'node:path';
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

  app.get('/api/autoresearch-runs', (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    const skillsDir = path.join(repoRoot, 'shared', 'skills');
    const runs = [];
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
            const data = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
            runs.push({
              skill: skillName,
              run_dir: runDir,
              status: data.status || 'unknown',
              baseline_score: data.baseline_score ?? null,
              best_score: data.best_score ?? null,
              current_experiment: data.current_experiment ?? 0,
              experiment_count: (data.experiments || []).length,
              improved_by: data.baseline_score != null && data.best_score != null
                ? Math.round(data.best_score - data.baseline_score)
                : null,
            });
          } catch {
            // results.json missing or malformed - skip
          }
        }
      }
      runs.sort((a, b) => (b.best_score ?? 0) - (a.best_score ?? 0));
      res.json({ runs, success: true, effectiveOutcomeContract });
    } catch {
      res.json({ runs: [], success: true, note: 'Could not scan skill directories', effectiveOutcomeContract });
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
