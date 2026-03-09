// Shared runtime helper: reads the canonical release version from VERSION file.
// Consumed by runtime/mcp/server.js so the MCP server's advertised version
// always matches the build system's authoritative source.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function getReleaseVersion() {
  return readFileSync(resolve(ROOT, 'VERSION'), 'utf8').trim();
}
