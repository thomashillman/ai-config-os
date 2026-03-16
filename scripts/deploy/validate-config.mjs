import fs from 'fs';
import path from 'path';
import * as TOML from '@iarna/toml';

/**
 * Validates wrangler.toml configuration structure and required fields.
 * @param {Object} config - Parsed TOML config object
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateWranglerConfig(config) {
  const errors = [];

  // Check required top-level fields
  if (!config.name) errors.push('Missing required field: name');
  if (!config.main) errors.push('Missing required field: main');

  // Check vars section (can be at top level or in env blocks)
  const vars = config.vars || {};
  const stagingVars = config.env?.staging?.vars || {};

  // EXECUTOR_PROXY_URL is required (root level)
  if (!vars.EXECUTOR_PROXY_URL && !stagingVars.EXECUTOR_PROXY_URL) {
    errors.push('Missing required var: EXECUTOR_PROXY_URL (set in [vars] or [env.staging.vars])');
  }

  // EXECUTOR_TIMEOUT_MS should be a valid number if present
  const timeout = vars.EXECUTOR_TIMEOUT_MS || stagingVars.EXECUTOR_TIMEOUT_MS;
  if (timeout && isNaN(parseInt(timeout, 10))) {
    errors.push(`Invalid EXECUTOR_TIMEOUT_MS: "${timeout}" is not a valid number`);
  }

  // Check KV and R2 bindings exist (they can be placeholders but should be defined)
  // Check both root level and staging level
  const hasRootKvBinding = config.kv_namespaces && config.kv_namespaces.length > 0;
  const hasStagingKvBinding = config.env?.staging?.kv_namespaces && config.env.staging.kv_namespaces.length > 0;
  const hasKvBinding = hasRootKvBinding || hasStagingKvBinding;

  const hasRootR2Binding = config.r2_buckets && config.r2_buckets.length > 0;
  const hasStagingR2Binding = config.env?.staging?.r2_buckets && config.env.staging.r2_buckets.length > 0;
  const hasR2Binding = hasRootR2Binding || hasStagingR2Binding;

  if (!hasKvBinding) {
    errors.push('Missing KV namespace binding (add [[kv_namespaces]] section with binding="MANIFEST_KV")');
  }

  if (!hasR2Binding) {
    errors.push('Missing R2 bucket binding (add [[r2_buckets]] section with binding="ARTEFACTS_R2")');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates worker secrets that must be set via `wrangler secret put`.
 * @param {Object} secrets - Map of secret names to values
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateWorkerSecrets(secrets) {
  const errors = [];
  const required = ['AUTH_TOKEN', 'EXECUTOR_SHARED_SECRET'];

  for (const secret of required) {
    if (!secrets[secret] || secrets[secret].trim() === '') {
      errors.push(`Missing required secret: ${secret} (set with: wrangler secret put ${secret})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates remote executor environment variables.
 * @param {Object} env - Map of env var names to values
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateExecutorEnv(env) {
  const errors = [];

  // Check required vars
  if (!env.REMOTE_EXECUTOR_SHARED_SECRET || env.REMOTE_EXECUTOR_SHARED_SECRET.trim() === '') {
    errors.push('Missing required env var: REMOTE_EXECUTOR_SHARED_SECRET');
  }

  // REMOTE_EXECUTOR_PORT should be a valid port number if present
  const port = env.REMOTE_EXECUTOR_PORT || '8788';
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    errors.push(`Invalid REMOTE_EXECUTOR_PORT: "${port}" must be a number between 1 and 65535`);
  }

  // REMOTE_EXECUTOR_TIMEOUT_MS should be a valid number if present
  const timeout = env.REMOTE_EXECUTOR_TIMEOUT_MS;
  if (timeout && isNaN(parseInt(timeout, 10))) {
    errors.push(`Invalid REMOTE_EXECUTOR_TIMEOUT_MS: "${timeout}" is not a valid number`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Load and validate wrangler.toml from worker directory.
 * @param {string} workerDir - Path to worker directory (default: worker/)
 * @returns {{valid: boolean, errors: string[], config?: Object}}
 */
export function loadAndValidateWranglerConfig(workerDir = 'worker') {
  const wranglerPath = path.join(workerDir, 'wrangler.toml');

  if (!fs.existsSync(wranglerPath)) {
    return {
      valid: false,
      errors: [`wrangler.toml not found at ${wranglerPath}`],
      config: null
    };
  }

  try {
    const content = fs.readFileSync(wranglerPath, 'utf8');
    const config = TOML.parse(content);
    const result = validateWranglerConfig(config);

    return {
      ...result,
      config
    };
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to parse wrangler.toml: ${err.message}`],
      config: null
    };
  }
}

/**
 * Main CLI entry point.
 */
export function validateDeploymentConfig(options = {}) {
  const {
    workerDir = 'worker',
    checkSecrets = false,
    checkExecutor = false,
    secrets = {},
    executorEnv = {}
  } = options;

  const results = [];
  let allValid = true;

  // Validate wrangler config
  const wranglerResult = loadAndValidateWranglerConfig(workerDir);
  results.push({
    name: 'Wrangler Config',
    ...wranglerResult
  });
  if (!wranglerResult.valid) allValid = false;

  // Validate worker secrets if requested
  if (checkSecrets) {
    const secretResult = validateWorkerSecrets(secrets);
    results.push({
      name: 'Worker Secrets',
      ...secretResult
    });
    if (!secretResult.valid) allValid = false;
  }

  // Validate executor env if requested
  if (checkExecutor) {
    const executorResult = validateExecutorEnv(executorEnv);
    results.push({
      name: 'Remote Executor Env',
      ...executorResult
    });
    if (!executorResult.valid) allValid = false;
  }

  return {
    valid: allValid,
    results
  };
}

// CLI invocation
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateDeploymentConfig({
    workerDir: process.argv[2] || 'worker'
  });

  console.log('\nDeployment Configuration Validation\n');
  console.log('------------------------------------\n');

  for (const check of result.results) {
    console.log(`${check.name}:`);
    if (check.valid) {
      console.log('  ✓ Valid\n');
    } else {
      console.log('  ✗ Invalid');
      for (const err of check.errors) {
        console.log(`    - ${err}`);
      }
      console.log();
    }
  }

  if (result.valid) {
    console.log('All checks passed. Ready to deploy.');
    process.exit(0);
  } else {
    console.log('Some checks failed. Fix the issues above before deploying.');
    process.exit(1);
  }
}
