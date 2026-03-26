import fs from 'node:fs';
import path from 'node:path';
import { ActionValidationError, createRuntimeActionDispatcher } from '../lib/runtime-action-dispatcher.mjs';
import { loadObservationSnapshot } from '../lib/observation-read-model.mjs';
import { createCapability, createErrorEnvelope, createSuccessEnvelope } from '../lib/contracts/envelope.mjs';

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

  function dashboardCapability() {
    return createCapability({
      worker_backed: false,
      local_only: true,
      remote_safe: false,
      tunnel_required: true,
      unavailable_on_surface: false,
    });
  }

  function ok(resource, data, summary, meta = undefined) {
    return createSuccessEnvelope({ resource, data, summary, capability: dashboardCapability(), meta });
  }

  function fail(resource, status, error, meta = undefined) {
    return {
      status,
      body: createErrorEnvelope({
        resource,
        data: null,
        summary: 'Dashboard API request failed.',
        capability: dashboardCapability(),
        error,
        meta,
      }),
    };
  }

  app.use(
    corsMiddleware({
      origin(origin, callback) {
        callback(null, tunnelPolicy.isOriginAllowed(origin));
      },
    })
  );
  app.use(jsonMiddleware({ limit: '10kb' }));
  app.use(tunnelGuardFactory(tunnelPolicy));

  function executeRuntimeAction(toolName, actionArgs, res) {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({
      toolName,
      executionChannel: 'dashboard',
    });

    try {
      const result = runtimeActionDispatcher.dispatch(toolName, actionArgs);
      res.json(ok(toolName, { output: result.output, success: result.success }, 'Runtime action completed.', {
        effective_outcome_contract: effectiveOutcomeContract,
      }));
    } catch (error) {
      if (error instanceof ActionValidationError) {
        const failure = fail(toolName, 400, { code: 'invalid_arguments', message: error.message, hint: 'Correct the request arguments and retry.' }, {
          effective_outcome_contract: effectiveOutcomeContract,
        });
        res.status(failure.status).json(failure.body);
        return;
      }
      const failure = fail(toolName, 500, {
        code: 'dashboard_action_failed',
        message: error instanceof Error ? error.message : 'failed to run dashboard action',
        hint: 'Retry the request. If this persists, inspect dashboard runtime logs.',
      }, {
        effective_outcome_contract: effectiveOutcomeContract,
      });
      res.status(failure.status).json(failure.body);
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
      res.json(ok('analytics.tool_usage', { metrics, success: true }, 'Loaded analytics metrics.', {
        effective_outcome_contract: effectiveOutcomeContract,
      }));
    } catch {
      res.json(ok('analytics.tool_usage', { metrics: [], success: true, note: 'No metrics collected yet' }, 'No analytics metrics available yet.', {
        effective_outcome_contract: effectiveOutcomeContract,
      }));
    }
  });

  app.get('/api/skill-analytics', async (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });

    if (!process.env.HOME) {
      { const failure = fail('analytics.skill_outcomes', 503, { code: 'home_missing', message: '$HOME is not set', hint: 'Set HOME in the dashboard process environment.' }, { effective_outcome_contract: effectiveOutcomeContract }); res.status(failure.status).json(failure.body); }
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

      res.json(ok('analytics.skill_outcomes', { skills, total_events: outcomeEvents.length, success: true }, 'Loaded skill analytics.', {
        effective_outcome_contract: effectiveOutcomeContract,
      }));
    } catch (err) {
      { const failure = fail('analytics.skill_outcomes', 500, { code: 'analytics_failed', message: err instanceof Error ? err.message : 'unexpected error', hint: 'Retry the request or inspect dashboard logs.' }, { effective_outcome_contract: effectiveOutcomeContract }); res.status(failure.status).json(failure.body); }
    }
  });

  app.get('/api/retrospectives-summary', (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });
    const empty = { artifact_count: 0, signal_breakdown: {}, top_recommendations: [], success: true };

    if (!process.env.HOME) { res.json(ok('retrospectives.summary', empty, 'Loaded retrospective summary.', { effective_outcome_contract: effectiveOutcomeContract })); return; }

    const cacheFile = path.join(
      process.env.HOME, '.ai-config-os', 'cache', 'claude-code', 'retrospectives-aggregate.json'
    );
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      res.json(ok('retrospectives.summary', {
        artifact_count: typeof data.artifact_count === 'number' ? data.artifact_count : 0,
        signal_breakdown: data.signal_breakdown && typeof data.signal_breakdown === 'object' && !Array.isArray(data.signal_breakdown) ? data.signal_breakdown : {},
        top_recommendations: Array.isArray(data.top_recommendations) ? data.top_recommendations : [],
        success: true,
      }, 'Loaded retrospective summary.', { effective_outcome_contract: effectiveOutcomeContract }));
    } catch {
      res.json(ok('retrospectives.summary', empty, 'Loaded retrospective summary.', { effective_outcome_contract: effectiveOutcomeContract }));
    }
  });

  app.get('/api/autoresearch-runs', (req, res) => {
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: 'skill_stats', executionChannel: 'dashboard' });

    if (!repoRoot) {
      { const failure = fail('autoresearch.runs', 503, { code: 'repo_root_missing', message: 'repoRoot not configured', hint: 'Set repoRoot for the dashboard API process.' }, { effective_outcome_contract: effectiveOutcomeContract }); res.status(failure.status).json(failure.body); }
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
      res.json(ok('autoresearch.runs', { runs, success: true }, 'Loaded autoresearch runs.', {
        effective_outcome_contract: effectiveOutcomeContract,
      }));
    } catch (err) {
      { const failure = fail('autoresearch.runs', 500, { code: 'autoresearch_failed', message: err instanceof Error ? err.message : 'unexpected error', hint: 'Retry the request or inspect dashboard logs.' }, { effective_outcome_contract: effectiveOutcomeContract }); res.status(failure.status).json(failure.body); }
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
    res.json(ok('outcome.contract.resolve', { effectiveOutcomeContract, success: true }, 'Resolved outcome contract.'));
  });

  app.post('/api/tasks/review/start', (req, res) => {
    if (!taskService) {
      { const failure = fail('tasks.review.start', 503, { code: 'task_service_unavailable', message: 'task service unavailable', hint: 'Enable taskService in dashboard runtime.' }); res.status(failure.status).json(failure.body); }
      return;
    }

    try {
      const result = taskService.startReviewRepositoryTask({
        taskId: req.body?.task_id,
        goal: req.body?.goal,
        routeInputs: req.body?.route_inputs,
        capabilityProfile: req.body?.capability_profile,
      });
      res.status(201).json(ok('tasks.review.start', { success: true, ...result }, 'Started review task.'));
    } catch (error) {
      { const failure = fail('tasks.review.start', 400, { code: 'task_start_failed', message: error instanceof Error ? error.message : 'failed to start task', hint: 'Check task input fields and retry.' }); res.status(failure.status).json(failure.body); }
    }
  });

  app.post('/api/tasks/:taskId/review/resume', (req, res) => {
    if (!taskService) {
      { const failure = fail('tasks.review.resume', 503, { code: 'task_service_unavailable', message: 'task service unavailable', hint: 'Enable taskService in dashboard runtime.' }); res.status(failure.status).json(failure.body); }
      return;
    }

    try {
      const result = taskService.resumeReviewRepositoryTask({
        taskId: req.params.taskId,
        capabilityProfile: req.body?.capability_profile,
      });
      res.json(ok('tasks.review.resume', { success: true, ...result }, 'Resumed review task.'));
    } catch (error) {
      { const failure = fail('tasks.review.resume', 400, { code: 'task_resume_failed', message: error instanceof Error ? error.message : 'failed to resume task', hint: 'Check task id and retry.' }); res.status(failure.status).json(failure.body); }
    }
  });

  app.get('/api/tasks/:taskId/readiness', (req, res) => {
    if (!taskService) {
      { const failure = fail('tasks.readiness', 503, { code: 'task_service_unavailable', message: 'task service unavailable', hint: 'Enable taskService in dashboard runtime.' }); res.status(failure.status).json(failure.body); }
      return;
    }

    try {
      res.json(ok('tasks.readiness', { success: true, readiness: taskService.getReadiness(req.params.taskId) }, 'Loaded task readiness.'));
    } catch (error) {
      { const failure = fail('tasks.readiness', 400, { code: 'task_readiness_failed', message: error instanceof Error ? error.message : 'failed to load readiness', hint: 'Check task id and retry.' }); res.status(failure.status).json(failure.body); }
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
