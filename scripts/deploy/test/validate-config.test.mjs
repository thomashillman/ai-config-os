import test from "node:test";
import assert from "node:assert/strict";
import {
  validateWranglerConfig,
  validateWorkerSecrets,
  validateExecutorEnv,
  validateWranglerConfigForEnv,
} from "../validate-config.mjs";

test("validateWranglerConfig - passes with all required fields", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      ENVIRONMENT: "staging",
      EXECUTOR_PROXY_URL: "https://executor.example.com",
      EXECUTOR_TIMEOUT_MS: "10000",
    },
    kv_namespaces: [{ binding: "MANIFEST_KV", id: "placeholder-id" }],
    r2_buckets: [
      { binding: "ARTEFACTS_R2", bucket_name: "ai-config-os-artefacts" },
    ],
    env: {
      staging: {
        vars: {
          ENVIRONMENT: "staging",
          EXECUTOR_PROXY_URL: "https://executor.example.com",
          EXECUTOR_TIMEOUT_MS: "10000",
        },
      },
    },
  };

  const result = validateWranglerConfig(config);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateWranglerConfig - passes even without EXECUTOR_PROXY_URL (Phase 1 uses service binding)", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      ENVIRONMENT: "staging",
      EXECUTOR_TIMEOUT_MS: "10000",
    },
    kv_namespaces: [{ binding: "MANIFEST_KV", id: "kv-id" }],
    r2_buckets: [{ binding: "ARTEFACTS_R2", bucket_name: "bucket" }],
  };

  const result = validateWranglerConfig(config);
  assert.equal(
    result.valid,
    true,
    "Phase 1 does not require EXECUTOR_PROXY_URL; service binding is primary",
  );
});

test("validateWranglerConfig - fails when EXECUTOR_TIMEOUT_MS is not a number", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      ENVIRONMENT: "staging",
      EXECUTOR_PROXY_URL: "https://executor.example.com",
      EXECUTOR_TIMEOUT_MS: "not-a-number",
    },
  };

  const result = validateWranglerConfig(config);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (e) => e.includes("EXECUTOR_TIMEOUT_MS") && e.includes("number"),
    ),
  );
});

test("validateWranglerConfig - allows optional ENVIRONMENT field", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      EXECUTOR_PROXY_URL: "https://executor.example.com",
      EXECUTOR_TIMEOUT_MS: "10000",
    },
    kv_namespaces: [{ binding: "MANIFEST_KV", id: "placeholder-id" }],
    r2_buckets: [
      { binding: "ARTEFACTS_R2", bucket_name: "ai-config-os-artefacts" },
    ],
  };

  const result = validateWranglerConfig(config);
  assert.equal(result.valid, true);
});

test("validateWorkerSecrets - fails when AUTH_TOKEN is missing", () => {
  const secrets = {};
  const result = validateWorkerSecrets(secrets);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("AUTH_TOKEN")));
});

test("validateWorkerSecrets - fails when EXECUTOR_SHARED_SECRET is missing", () => {
  const secrets = { AUTH_TOKEN: "token123" };
  const result = validateWorkerSecrets(secrets);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("EXECUTOR_SHARED_SECRET")));
});

test("validateWorkerSecrets - passes with required secrets", () => {
  const secrets = {
    AUTH_TOKEN: "token123",
    EXECUTOR_SHARED_SECRET: "secret123",
  };
  const result = validateWorkerSecrets(secrets);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateWorkerSecrets - allows optional AUTH_TOKEN_NEXT", () => {
  const secrets = {
    AUTH_TOKEN: "token123",
    EXECUTOR_SHARED_SECRET: "secret123",
  };
  const result = validateWorkerSecrets(secrets);

  assert.equal(result.valid, true);
});

test("validateExecutorEnv - fails when REMOTE_EXECUTOR_SHARED_SECRET is missing", () => {
  const env = {
    REMOTE_EXECUTOR_PORT: "8788",
    REMOTE_EXECUTOR_TIMEOUT_MS: "15000",
  };
  const result = validateExecutorEnv(env);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes("REMOTE_EXECUTOR_SHARED_SECRET")),
  );
});

test("validateExecutorEnv - passes with required vars", () => {
  const env = {
    REMOTE_EXECUTOR_SHARED_SECRET: "secret123",
    REMOTE_EXECUTOR_PORT: "8788",
  };
  const result = validateExecutorEnv(env);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateExecutorEnv - fails when REMOTE_EXECUTOR_PORT is not a valid port number", () => {
  const env = {
    REMOTE_EXECUTOR_SHARED_SECRET: "secret123",
    REMOTE_EXECUTOR_PORT: "not-a-port",
  };
  const result = validateExecutorEnv(env);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (e) => e.includes("REMOTE_EXECUTOR_PORT") && e.includes("number"),
    ),
  );
});

test("validateExecutorEnv - allows optional REMOTE_EXECUTOR_SIGNATURE_PUBLIC_KEY_PEM", () => {
  const env = {
    REMOTE_EXECUTOR_SHARED_SECRET: "secret123",
    REMOTE_EXECUTOR_PORT: "8788",
  };
  const result = validateExecutorEnv(env);

  assert.equal(result.valid, true);
});

/* Environment-specific validation tests */

test("validateWranglerConfigForEnv - staging with valid staging config", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      EXECUTOR_PROXY_URL: "https://production.example.com",
      EXECUTOR_TIMEOUT_MS: "10000",
    },
    kv_namespaces: [{ binding: "MANIFEST_KV", id: "prod-kv-id" }],
    r2_buckets: [{ binding: "ARTEFACTS_R2", bucket_name: "prod-bucket" }],
    env: {
      staging: {
        vars: {
          EXECUTOR_PROXY_URL: "https://real-executor-staging.example.com",
          EXECUTOR_TIMEOUT_MS: "10000",
        },
        kv_namespaces: [{ binding: "MANIFEST_KV", id: "staging-real-kv-id" }],
        r2_buckets: [
          { binding: "ARTEFACTS_R2", bucket_name: "real-staging-bucket" },
        ],
      },
    },
  };

  const result = validateWranglerConfigForEnv(config, "staging");
  assert.equal(result.valid, true, "Should validate staging with real values");
});

test("validateWranglerConfigForEnv - staging rejects placeholder EXECUTOR_PROXY_URL", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    env: {
      staging: {
        vars: {
          EXECUTOR_PROXY_URL: "https://executor-staging.example.com",
          EXECUTOR_TIMEOUT_MS: "10000",
        },
        kv_namespaces: [{ binding: "MANIFEST_KV", id: "staging-kv-id" }],
        r2_buckets: [
          { binding: "ARTEFACTS_R2", bucket_name: "staging-bucket" },
        ],
      },
    },
  };

  const result = validateWranglerConfigForEnv(config, "staging");
  assert.equal(result.valid, false, "Should reject placeholder executor URL");
  assert.ok(
    result.errors.some(
      (e) =>
        e.includes("EXECUTOR_PROXY_URL") ||
        e.includes("executor-staging.example.com"),
    ),
    "Error should mention placeholder executor URL",
  );
});

test("validateWranglerConfigForEnv - staging rejects placeholder KV ID", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    env: {
      staging: {
        vars: {
          EXECUTOR_PROXY_URL: "https://real-executor.example.com",
          EXECUTOR_TIMEOUT_MS: "10000",
        },
        kv_namespaces: [
          { binding: "MANIFEST_KV", id: "REPLACE_WITH_STAGING_MANIFEST_KV_ID" },
        ],
        r2_buckets: [
          { binding: "ARTEFACTS_R2", bucket_name: "staging-bucket" },
        ],
      },
    },
  };

  const result = validateWranglerConfigForEnv(config, "staging");
  assert.equal(result.valid, false, "Should reject placeholder KV ID");
  assert.ok(
    result.errors.some((e) =>
      e.includes("REPLACE_WITH_STAGING_MANIFEST_KV_ID"),
    ),
    "Error should mention placeholder KV ID",
  );
});

test("validateWranglerConfigForEnv - production with valid production config", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      EXECUTOR_PROXY_URL: "https://real-production-executor.example.com",
      EXECUTOR_TIMEOUT_MS: "10000",
    },
    kv_namespaces: [{ binding: "MANIFEST_KV", id: "prod-real-kv-id" }],
    r2_buckets: [{ binding: "ARTEFACTS_R2", bucket_name: "prod-real-bucket" }],
  };

  const result = validateWranglerConfigForEnv(config, "production");
  assert.equal(
    result.valid,
    true,
    "Should validate production with real values",
  );
});

test("validateWranglerConfigForEnv - production rejects placeholder EXECUTOR_PROXY_URL", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      EXECUTOR_PROXY_URL: "https://remote-executor.example.com",
      EXECUTOR_TIMEOUT_MS: "10000",
    },
    kv_namespaces: [{ binding: "MANIFEST_KV", id: "prod-kv-id" }],
    r2_buckets: [{ binding: "ARTEFACTS_R2", bucket_name: "prod-bucket" }],
  };

  const result = validateWranglerConfigForEnv(config, "production");
  assert.equal(
    result.valid,
    false,
    "Should reject placeholder production executor URL",
  );
  assert.ok(
    result.errors.some(
      (e) =>
        e.includes("EXECUTOR_PROXY_URL") ||
        e.includes("remote-executor.example.com"),
    ),
    "Error should mention placeholder executor URL",
  );
});

test("validateWranglerConfigForEnv - production rejects placeholder KV ID", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      EXECUTOR_PROXY_URL: "https://real-production.example.com",
      EXECUTOR_TIMEOUT_MS: "10000",
    },
    kv_namespaces: [
      { binding: "MANIFEST_KV", id: "REPLACE_WITH_MANIFEST_KV_ID" },
    ],
    r2_buckets: [{ binding: "ARTEFACTS_R2", bucket_name: "prod-bucket" }],
  };

  const result = validateWranglerConfigForEnv(config, "production");
  assert.equal(result.valid, false, "Should reject placeholder KV ID");
  assert.ok(
    result.errors.some((e) => e.includes("REPLACE_WITH_MANIFEST_KV_ID")),
    "Error should mention placeholder KV ID",
  );
});

test("validateWranglerConfigForEnv - staging missing requires binding names", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    env: {
      staging: {
        vars: {
          EXECUTOR_PROXY_URL: "https://real-executor.example.com",
        },
        kv_namespaces: [{ binding: "WRONG_NAME", id: "staging-kv-id" }],
        r2_buckets: [
          { binding: "ARTEFACTS_R2", bucket_name: "staging-bucket" },
        ],
      },
    },
  };

  const result = validateWranglerConfigForEnv(config, "staging");
  assert.equal(result.valid, false, "Should reject wrong KV binding name");
  assert.ok(
    result.errors.some((e) => e.includes("MANIFEST_KV")),
    "Error should mention MANIFEST_KV",
  );
});

test("validateWranglerConfigForEnv - production missing required binding names", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      EXECUTOR_PROXY_URL: "https://real-executor.example.com",
    },
    kv_namespaces: [],
    r2_buckets: [{ binding: "ARTEFACTS_R2", bucket_name: "prod-bucket" }],
  };

  const result = validateWranglerConfigForEnv(config, "production");
  assert.equal(result.valid, false, "Should reject missing KV binding");
  assert.ok(
    result.errors.some((e) => e.includes("MANIFEST_KV")),
    "Error should mention MANIFEST_KV",
  );
});

/* Service Binding Tests for Phase 1 */

test("validateWranglerConfigForEnv - accepts service binding instead of EXECUTOR_PROXY_URL", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    services: [
      {
        binding: "EXECUTOR",
        service: "ai-config-os-executor",
        environment: "production",
      },
    ],
    vars: {
      EXECUTOR_TIMEOUT_MS: "10000",
      // No EXECUTOR_PROXY_URL
    },
    kv_namespaces: [{ binding: "MANIFEST_KV", id: "prod-kv-id" }],
    r2_buckets: [{ binding: "ARTEFACTS_R2", bucket_name: "prod-bucket" }],
  };

  const result = validateWranglerConfigForEnv(config, "production");
  assert.equal(
    result.valid,
    true,
    "Should accept service binding without EXECUTOR_PROXY_URL",
  );
});

test("validateWranglerConfigForEnv - accepts staging service binding with correct service name", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    env: {
      staging: {
        services: [
          {
            binding: "EXECUTOR",
            service: "ai-config-os-executor-staging",
            environment: "staging",
          },
        ],
        vars: {
          EXECUTOR_TIMEOUT_MS: "10000",
          // No EXECUTOR_PROXY_URL
        },
        kv_namespaces: [{ binding: "MANIFEST_KV", id: "staging-kv-id" }],
        r2_buckets: [
          { binding: "ARTEFACTS_R2", bucket_name: "staging-bucket" },
        ],
      },
    },
  };

  const result = validateWranglerConfigForEnv(config, "staging");
  assert.equal(
    result.valid,
    true,
    "Should accept staging service binding with correct name",
  );
});

/* Phase 1 Primary Path Tests */

test("validateWranglerConfig - accepts top-level config with service binding (Phase 1 primary)", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      ENVIRONMENT: "production",
      EXECUTOR_TIMEOUT_MS: "10000",
      // No EXECUTOR_PROXY_URL - service binding only
    },
    services: [
      {
        binding: "EXECUTOR",
        service: "ai-config-os-executor",
        environment: "production",
      },
    ],
    kv_namespaces: [{ binding: "MANIFEST_KV", id: "prod-kv-id" }],
    r2_buckets: [{ binding: "ARTEFACTS_R2", bucket_name: "prod-bucket" }],
  };

  const result = validateWranglerConfig(config);
  assert.equal(
    result.valid,
    true,
    "Phase 1 requires service binding; EXECUTOR_PROXY_URL should be optional",
  );
});

test("validateWranglerConfig - accepts staging config with service binding only", () => {
  const config = {
    name: "ai-config-os",
    main: "src/index.ts",
    vars: {
      EXECUTOR_TIMEOUT_MS: "10000",
    },
    env: {
      staging: {
        services: [
          {
            binding: "EXECUTOR",
            service: "ai-config-os-executor-staging",
            environment: "staging",
          },
        ],
        vars: {
          ENVIRONMENT: "staging",
          EXECUTOR_TIMEOUT_MS: "10000",
          // No EXECUTOR_PROXY_URL - service binding only
        },
        kv_namespaces: [{ binding: "MANIFEST_KV", id: "staging-kv-id" }],
        r2_buckets: [
          { binding: "ARTEFACTS_R2", bucket_name: "staging-bucket" },
        ],
      },
    },
  };

  const result = validateWranglerConfig(config);
  assert.equal(
    result.valid,
    true,
    "Phase 1 staging should accept service binding without EXECUTOR_PROXY_URL",
  );
});
