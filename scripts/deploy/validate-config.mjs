import fs from "fs";
import path from "path";
import * as TOML from "@iarna/toml";

/**
 * Checks if a value is a placeholder (unsafe for production).
 * @param {string} value - Value to check
 * @param {string} environment - 'production' or 'staging' for URL-specific checks
 * @returns {boolean} true if value looks like a placeholder
 */
export function isPlaceholder(value, environment = "production") {
  if (!value) return false;
  const value_str = String(value);

  // Always reject REPLACE_WITH_* patterns
  if (value_str.includes("REPLACE_WITH")) {
    return true;
  }

  // Environment-specific placeholder URLs
  if (
    environment === "staging" &&
    value_str === "https://executor-staging.example.com"
  ) {
    return true;
  }
  if (
    environment === "production" &&
    value_str === "https://remote-executor.example.com"
  ) {
    return true;
  }

  return false;
}

/**
 * Validates service binding configuration for Phase 1 executor
 * @param {Object} config - Parsed TOML config object
 * @param {string} environment - 'production' or 'staging'
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateServiceBindingsForEnv(
  config,
  environment = "production",
) {
  const errors = [];
  const envConfig =
    environment === "staging" ? config.env?.staging || {} : config;
  const services = envConfig.services || [];
  const executorService = services.find((s) => s.binding === "EXECUTOR");

  if (!executorService) {
    errors.push(`Missing EXECUTOR service binding for ${environment}`);
  } else {
    const expectedServiceName =
      environment === "production"
        ? "ai-config-os-executor"
        : "ai-config-os-executor-staging";

    if (executorService.service !== expectedServiceName) {
      errors.push(
        `Service binding for ${environment} should point to ${expectedServiceName}, got ${executorService.service}`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates wrangler.toml configuration for a specific environment (production or staging).
 * @param {Object} config - Parsed TOML config object
 * @param {string} environment - 'production' or 'staging'
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateWranglerConfigForEnv(
  config,
  environment = "production",
) {
  const errors = [];

  // Determine which config section to use
  let envConfig;
  if (environment === "staging") {
    envConfig = config.env?.staging || {};
  } else if (environment === "production") {
    envConfig = config;
  } else {
    errors.push(`Unknown environment: ${environment}`);
    return { valid: false, errors };
  }

  // Check required top-level fields in root config
  if (!config.name) errors.push("Missing required field: name");
  if (!config.main) errors.push("Missing required field: main");

  // Get vars from the target environment
  const vars = envConfig.vars || {};

  // PHASE 1 PRIMARY PATH: Service binding is required or strongly preferred
  // EXECUTOR_PROXY_URL is optional, only for Phase 0 backward compat or Phase 2 future
  const sbResult = validateServiceBindingsForEnv(config, environment);
  const hasServiceBinding = sbResult.valid;
  const executorUrl = vars.EXECUTOR_PROXY_URL;
  const hasValidProxyUrl =
    !!executorUrl && !isPlaceholder(executorUrl, environment);

  if (!hasServiceBinding && !hasValidProxyUrl) {
    if (!executorUrl) {
      errors.push(
        `Missing executor configuration for Phase 1: service binding [[services]] required for ${environment}. ` +
          `(EXECUTOR_PROXY_URL is optional, for Phase 0 backward compat or Phase 2 only.)`,
      );
    } else if (isPlaceholder(executorUrl, environment)) {
      errors.push(
        `Invalid EXECUTOR_PROXY_URL for ${environment}: "${executorUrl}" is a placeholder. ` +
          `For Phase 1, configure service binding [[services]]. ` +
          `EXECUTOR_PROXY_URL is only for backward compatibility.`,
      );
    }
  }

  // Add service binding errors if any
  if (
    !hasServiceBinding &&
    !sbResult.errors.every((e) => e.includes("Missing EXECUTOR"))
  ) {
    // Only add non-critical service binding errors if we don't already have a valid proxy URL
    if (!hasValidProxyUrl) {
      errors.push(...sbResult.errors);
    }
  }

  // EXECUTOR_TIMEOUT_MS should be a valid number if present
  const timeout = vars.EXECUTOR_TIMEOUT_MS;
  if (timeout && isNaN(parseInt(timeout, 10))) {
    errors.push(
      `Invalid EXECUTOR_TIMEOUT_MS: "${timeout}" is not a valid number`,
    );
  }

  // Check KV bindings
  const kvBindings = envConfig.kv_namespaces || [];
  const manifestKv = kvBindings.find((b) => b.binding === "MANIFEST_KV");

  if (!manifestKv) {
    errors.push(
      `Missing KV binding: MANIFEST_KV in [${environment === "staging" ? "env.staging.kv_namespaces" : "kv_namespaces"}]`,
    );
  } else if (isPlaceholder(manifestKv.id)) {
    errors.push(
      `Invalid KV namespace ID for ${environment}: "${manifestKv.id}" appears to be a placeholder. Set a real KV namespace ID.`,
    );
  }

  // Check R2 bindings
  const r2Bindings = envConfig.r2_buckets || [];
  const artefactsR2 = r2Bindings.find((b) => b.binding === "ARTEFACTS_R2");

  if (!artefactsR2) {
    errors.push(
      `Missing R2 binding: ARTEFACTS_R2 in [${environment === "staging" ? "env.staging.r2_buckets" : "r2_buckets"}]`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates wrangler.toml configuration structure and required fields.
 * This is a basic structural check. Environment-specific validation
 * (which checks Phase 1 service binding or Phase 0 proxy) is done separately
 * in validateWranglerConfigForEnv.
 * @param {Object} config - Parsed TOML config object
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateWranglerConfig(config) {
  const errors = [];

  // Check required top-level fields
  if (!config.name) errors.push("Missing required field: name");
  if (!config.main) errors.push("Missing required field: main");

  // EXECUTOR_TIMEOUT_MS should be a valid number if present
  const vars = config.vars || {};
  const stagingVars = config.env?.staging?.vars || {};
  const timeout = vars.EXECUTOR_TIMEOUT_MS || stagingVars.EXECUTOR_TIMEOUT_MS;
  if (timeout && isNaN(parseInt(timeout, 10))) {
    errors.push(
      `Invalid EXECUTOR_TIMEOUT_MS: "${timeout}" is not a valid number`,
    );
  }

  // Check KV and R2 bindings exist (they can be placeholders but should be defined)
  // Check both root level and staging level
  const hasRootKvBinding =
    config.kv_namespaces && config.kv_namespaces.length > 0;
  const hasStagingKvBinding =
    config.env?.staging?.kv_namespaces &&
    config.env.staging.kv_namespaces.length > 0;
  const hasKvBinding = hasRootKvBinding || hasStagingKvBinding;

  const hasRootR2Binding = config.r2_buckets && config.r2_buckets.length > 0;
  const hasStagingR2Binding =
    config.env?.staging?.r2_buckets && config.env.staging.r2_buckets.length > 0;
  const hasR2Binding = hasRootR2Binding || hasStagingR2Binding;

  if (!hasKvBinding) {
    errors.push(
      'Missing KV namespace binding (add [[kv_namespaces]] section with binding="MANIFEST_KV")',
    );
  }

  if (!hasR2Binding) {
    errors.push(
      'Missing R2 bucket binding (add [[r2_buckets]] section with binding="ARTEFACTS_R2")',
    );
  }

  // Note: EXECUTOR_PROXY_URL is NOT required here. Phase 1 uses service binding
  // which is checked in validateWranglerConfigForEnv.

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates worker secrets that must be set via `wrangler secret put`.
 * @param {Object} secrets - Map of secret names to values
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateWorkerSecrets(secrets) {
  const errors = [];
  const required = ["AUTH_TOKEN", "EXECUTOR_SHARED_SECRET"];

  for (const secret of required) {
    if (!secrets[secret] || secrets[secret].trim() === "") {
      errors.push(
        `Missing required secret: ${secret} (set with: wrangler secret put ${secret})`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
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
  if (
    !env.REMOTE_EXECUTOR_SHARED_SECRET ||
    env.REMOTE_EXECUTOR_SHARED_SECRET.trim() === ""
  ) {
    errors.push("Missing required env var: REMOTE_EXECUTOR_SHARED_SECRET");
  }

  // REMOTE_EXECUTOR_PORT should be a valid port number if present
  const port = env.REMOTE_EXECUTOR_PORT || "8788";
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    errors.push(
      `Invalid REMOTE_EXECUTOR_PORT: "${port}" must be a number between 1 and 65535`,
    );
  }

  // REMOTE_EXECUTOR_TIMEOUT_MS should be a valid number if present
  const timeout = env.REMOTE_EXECUTOR_TIMEOUT_MS;
  if (timeout && isNaN(parseInt(timeout, 10))) {
    errors.push(
      `Invalid REMOTE_EXECUTOR_TIMEOUT_MS: "${timeout}" is not a valid number`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Load and validate wrangler.toml from worker directory.
 * @param {string} workerDir - Path to worker directory (default: worker/)
 * @returns {{valid: boolean, errors: string[], config?: Object}}
 */
export function loadAndValidateWranglerConfig(workerDir = "worker") {
  const wranglerPath = path.join(workerDir, "wrangler.toml");

  if (!fs.existsSync(wranglerPath)) {
    return {
      valid: false,
      errors: [`wrangler.toml not found at ${wranglerPath}`],
      config: null,
    };
  }

  try {
    const content = fs.readFileSync(wranglerPath, "utf8");
    const config = TOML.parse(content);
    const result = validateWranglerConfig(config);

    return {
      ...result,
      config,
    };
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to parse wrangler.toml: ${err.message}`],
      config: null,
    };
  }
}

/**
 * Main CLI entry point.
 */
export function validateDeploymentConfig(options = {}) {
  const {
    workerDir = "worker",
    checkSecrets = false,
    checkExecutor = false,
    secrets = {},
    executorEnv = {},
  } = options;

  const results = [];
  let allValid = true;

  // Validate wrangler config
  const wranglerResult = loadAndValidateWranglerConfig(workerDir);
  results.push({
    name: "Wrangler Config",
    ...wranglerResult,
  });
  if (!wranglerResult.valid) allValid = false;

  // Validate worker secrets if requested
  if (checkSecrets) {
    const secretResult = validateWorkerSecrets(secrets);
    results.push({
      name: "Worker Secrets",
      ...secretResult,
    });
    if (!secretResult.valid) allValid = false;
  }

  // Validate executor env if requested
  if (checkExecutor) {
    const executorResult = validateExecutorEnv(executorEnv);
    results.push({
      name: "Remote Executor Env",
      ...executorResult,
    });
    if (!executorResult.valid) allValid = false;
  }

  return {
    valid: allValid,
    results,
  };
}

// CLI invocation
if (import.meta.url === `file://${process.argv[1]}`) {
  const workerDir = process.argv[2] || "worker";
  const environment = process.argv[3] || "production";

  // Validate environment parameter
  if (!["production", "staging"].includes(environment)) {
    console.error(`\n✗ Unknown environment: "${environment}"`);
    console.error("Valid environments: production, staging\n");
    process.exit(1);
  }

  // Load and validate config for the specified environment
  const wranglerResult = loadAndValidateWranglerConfig(workerDir);

  if (!wranglerResult.valid) {
    console.log("\nDeployment Configuration Validation\n");
    console.log("------------------------------------\n");
    console.log("Wrangler Config:");
    console.log("  ✗ Invalid");
    for (const err of wranglerResult.errors) {
      console.log(`    - ${err}`);
    }
    console.log();
    process.exit(1);
  }

  // Validate for the specific environment
  const envResult = validateWranglerConfigForEnv(
    wranglerResult.config,
    environment,
  );

  console.log("\nDeployment Configuration Validation\n");
  console.log("------------------------------------\n");
  console.log(`Environment: ${environment}`);
  console.log(`Worker Config: ${workerDir}/wrangler.toml\n`);

  console.log("Wrangler Config Structure:");
  if (wranglerResult.valid) {
    console.log("  ✓ Valid\n");
  } else {
    console.log("  ✗ Invalid");
    for (const err of wranglerResult.errors) {
      console.log(`    - ${err}`);
    }
    console.log();
  }

  console.log(`Configuration for [${environment}]:`);
  if (envResult.valid) {
    console.log("  ✓ Valid\n");
  } else {
    console.log("  ✗ Invalid");
    for (const err of envResult.errors) {
      console.log(`    - ${err}`);
    }
    console.log();
  }

  if (wranglerResult.valid && envResult.valid) {
    console.log("All checks passed. Ready to deploy to " + environment + ".");
    process.exit(0);
  } else {
    console.log("Some checks failed. Fix the issues above before deploying.");
    process.exit(1);
  }
}
