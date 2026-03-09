/**
 * runtime-prereqs.mjs
 *
 * Runtime prerequisite checks for MCP server operation.
 * Ensures that required system tools are available.
 */
import { execFileSync } from 'node:child_process';

/**
 * Assert that all runtime prerequisites are met.
 * Currently checks that bash is available on PATH.
 *
 * @throws {Error} if a required tool is missing
 */
export function assertRuntimePrereqs() {
  try {
    execFileSync('bash', ['-lc', 'command -v bash'], { encoding: 'utf8', timeout: 5000 });
  } catch {
    throw new Error(
      'ai-config-os runtime requires bash on PATH. ' +
      'Build and validation may be cross-platform, but MCP runtime execution is Unix-like only.'
    );
  }
}
