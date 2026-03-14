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
import type { Env } from './types';

export type { Env };

export default createWorkerHandler(REGISTRY_JSON as { version: string; built_at?: string; skills: unknown[] }, CLAUDE_CODE_PLUGIN_JSON) satisfies ExportedHandler<Env>;
