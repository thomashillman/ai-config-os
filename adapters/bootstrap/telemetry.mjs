import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function resolveTelemetryPath({ env = process.env, home, provider = 'unknown' } = {}) {
  const resolvedHome = home || env.HOME || env.USERPROFILE || process.cwd();
  return env.AI_CONFIG_BOOTSTRAP_TELEMETRY_FILE || join(
    resolvedHome,
    '.ai-config-os',
    'logs',
    `bootstrap-${provider}.jsonl`
  );
}

export function createTelemetrySink({ env = process.env, home, provider = 'unknown' } = {}) {
  const telemetryPath = resolveTelemetryPath({ env, home, provider });

  return {
    telemetryPath,
    emit(event) {
      const line = `${JSON.stringify(event)}\n`;
      mkdirSync(dirname(telemetryPath), { recursive: true });
      appendFileSync(telemetryPath, line, 'utf8');

      if (env.AI_CONFIG_BOOTSTRAP_STDOUT !== '0') {
        process.stdout.write(line);
      }
    },
  };
}
