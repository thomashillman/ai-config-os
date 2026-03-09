import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_REGISTRY_PATH = resolve(__dirname, 'tool-registry.yaml');

const ADAPTER_TO_EXECUTION_CLASS = {
  cli: 'local',
  file: 'local',
  shell: 'local',
};

const ADAPTER_TO_REQUIRED_CAPABILITIES = {
  cli: ['shell.exec'],
  file: ['fs.read', 'fs.write'],
  shell: ['shell.exec'],
};

/**
 * Canonical definition format for runtime tools.
 *
 * @typedef {object} ToolDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {'local'|'edge'|'remote-privileged'} executionClass
 * @property {string[]} requiredCapabilities
 * @property {object} inputSchema
 * @property {object} outputSchema
 * @property {object} limits
 * @property {object} fallbackPolicy
 * @property {object} extensions
 */

/**
 * @param {string} [registryPath]
 * @returns {ToolDefinition[]}
 */
export function loadCanonicalToolDefinitions(registryPath = DEFAULT_REGISTRY_PATH) {
  const raw = readFileSync(registryPath, 'utf8');
  const parsed = parseYaml(raw, { strict: false }) || {};
  const tools = Array.isArray(parsed.tools) ? parsed.tools : [];

  return tools.map((tool) => {
    const adapter = tool.adapter;
    const executionClass = ADAPTER_TO_EXECUTION_CLASS[adapter] ?? 'remote-privileged';

    return {
      id: tool.id,
      name: tool.name,
      description: tool.description || '',
      executionClass,
      requiredCapabilities: ADAPTER_TO_REQUIRED_CAPABILITIES[adapter] ?? [],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            type: 'string',
            enum: ['check', 'sync', 'list'],
          },
          dry_run: {
            type: 'boolean',
            default: false,
          },
        },
        required: ['action'],
      },
      outputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          output: { type: 'string' },
          error: { type: ['string', 'null'] },
        },
        required: ['success', 'output', 'error'],
      },
      limits: {
        timeoutMs: 30_000,
        maxOutputBytes: 1_000_000,
      },
      fallbackPolicy: {
        mode: 'manual',
        notes: 'If adapter operations fail, report status and provide manual remediation steps.',
      },
      extensions: {
        adapter,
        adapterConfig: {
          cli_command: tool.cli_command,
          install_script: tool.install_script,
          paths: tool.paths,
        },
      },
    };
  });
}

export function registeredToolIds(registryPath = DEFAULT_REGISTRY_PATH) {
  return new Set(loadCanonicalToolDefinitions(registryPath).map((tool) => tool.id));
}
