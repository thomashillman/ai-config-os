import fs from 'node:fs';

const ALLOWED_DASHBOARD_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:4242',
];

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
  repoRoot,
  port,
}) {
  app.use(corsMiddleware({ origin: ALLOWED_DASHBOARD_ORIGINS }));
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

  app.get('/api/manifest', (req, res) => {
    const response = executeWithOutcomeContract('list_tools', () => runScript('runtime/manifest.sh', ['status']));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
  });

  app.get('/api/skill-stats', (req, res) => {
    const response = executeWithOutcomeContract('skill_stats', () => runScript('ops/skill-stats.sh'));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
  });

  app.get('/api/context-cost', (req, res) => {
    const threshold = validateNumber(req.query.threshold, 2000);
    const response = executeWithOutcomeContract('context_cost', () => runScript('ops/context-cost.sh', ['--threshold', String(threshold)]));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
  });

  app.get('/api/config', (req, res) => {
    const response = executeWithOutcomeContract('get_config', () => runScript('shared/lib/config-merger.sh'));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
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

  app.post('/api/sync', (req, res) => {
    const response = executeWithOutcomeContract('sync_tools', () => runScript('runtime/sync.sh', req.body?.dry_run ? ['--dry-run'] : []));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
  });

  app.get('/api/validate-all', (req, res) => {
    const response = executeWithOutcomeContract('validate_all', () => runScript('ops/validate-all.sh'));
    res.json({ output: response.output, success: response.success, effectiveOutcomeContract: response.effectiveOutcomeContract });
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
