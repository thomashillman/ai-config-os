/**
 * ai-config-os Cloudflare Worker
 *
 * Route wiring entrypoint only. Business logic is split into focused modules:
 * - auth handling
 * - artifact/manifest handlers
 * - task control-plane handlers
 * - remote execution proxy handler
 */

// Bundled at deploy time by wrangler from dist/
// @ts-ignore - generated at build time
import REGISTRY_JSON from '../../dist/registry/index.json';
// @ts-ignore - generated at build time
import CLAUDE_CODE_PLUGIN_JSON from '../../dist/clients/claude-code/.claude-plugin/plugin.json';
import { createWorkerHandler } from './router';
import { cleanupExpiredRetrospectives } from './retrospectives/cleanup';
import type { Env } from './types';

export type { Env };
export { TaskObject } from './task-object';

const _handler = createWorkerHandler(REGISTRY_JSON as { version: string; built_at?: string; skills: unknown[] }, CLAUDE_CODE_PLUGIN_JSON);

export default {
  ..._handler,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (env.MANIFEST_KV && env.ARTEFACTS_R2) {
      ctx.waitUntil(cleanupExpiredRetrospectives(env.MANIFEST_KV, env.ARTEFACTS_R2, 60));
    }
  },
} satisfies ExportedHandler<Env>;
