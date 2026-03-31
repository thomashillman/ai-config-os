/**
 * Smoke tests for validating Worker deployment.
 * Run against a deployed staging or production Worker.
 *
 * Usage:
 *   export AI_CONFIG_WORKER_URL="https://your-worker.example.com/v1"
 *   export AI_CONFIG_WORKER_TOKEN="your-bearer-token"
 *   node scripts/deploy/smoke-tests.mjs
 */

/**
 * Get Worker base URL from environment.
 * @returns {string} Worker base URL (e.g., https://worker.example.com/v1)
 * @throws {Error} If AI_CONFIG_WORKER_URL is not set
 */
export function getWorkerUrl() {
  const url = process.env.AI_CONFIG_WORKER_URL;
  if (!url) {
    throw new Error("AI_CONFIG_WORKER_URL environment variable is required");
  }
  return url;
}

/**
 * Get Worker bearer token from environment.
 * @returns {string} Bearer token
 * @throws {Error} If AI_CONFIG_WORKER_TOKEN is not set
 */
export function getWorkerToken() {
  const token = process.env.AI_CONFIG_WORKER_TOKEN;
  if (!token) {
    throw new Error("AI_CONFIG_WORKER_TOKEN environment variable is required");
  }
  return token;
}

/**
 * Build Authorization header value.
 * @param {string} token - Bearer token
 * @returns {string} "Bearer <token>"
 */
export function buildAuthHeader(token) {
  return `Bearer ${token}`;
}

/**
 * Build a fetch request object.
 * @param {string} url - Full request URL
 * @param {string} method - HTTP method
 * @param {string} token - Bearer token
 * @param {object} body - Optional request body (will be JSON.stringify'd for POST)
 * @returns {{url: string, options: object}}
 */
export function buildRequest(url, method, token, body) {
  const options = {
    method,
    headers: {
      Authorization: buildAuthHeader(token),
      "Content-Type": "application/json",
    },
  };

  if (body && (method === "POST" || method === "PATCH")) {
    options.body = JSON.stringify(body);
  }

  return { url, options };
}

/**
 * Format test result message.
 * @param {string} endpoint - Endpoint name (e.g., "health")
 * @param {string} method - HTTP method
 * @param {number} status - HTTP status code
 * @param {object} data - Response data (optional)
 * @param {string} error - Error message (optional)
 * @returns {string} Formatted message
 */
export function formatResult(endpoint, method, status, data, error) {
  let msg = `${method} /${endpoint}`;

  if (status < 300) {
    msg += ` ✓ ${status}`;
  } else {
    msg += ` ✗ ${status}`;
  }

  if (error) {
    msg += ` (${error})`;
  } else if (data && status < 300) {
    msg += " - OK";
  }

  return msg;
}

/**
 * Run a single smoke test against the Worker.
 * @param {string} name - Test name
 * @param {string} endpoint - Endpoint path (without /v1 prefix)
 * @param {string} method - HTTP method
 * @param {object} body - Optional request body
 * @param {object} options - Test options
 * @returns {Promise<{passed: boolean, message: string}>}
 */
async function runTest(name, endpoint, method, body, options = {}) {
  const {
    expectStatus = 200,
    expectStatusRange = [200, 299], // Accept any 2xx by default
    expectError = false,
    allowedStatuses = [], // Additional acceptable statuses (e.g., [503] for optional KV)
  } = options;

  try {
    const url = getWorkerUrl();
    const token = getWorkerToken();
    const req = buildRequest(`${url}/${endpoint}`, method, token, body);
    const response = await fetch(req.url, req.options);
    const status = response.status;

    // Check if status is acceptable
    let isAcceptable = false;
    if (allowedStatuses.includes(status)) {
      isAcceptable = true;
    } else if (expectError) {
      // Error was expected; 4xx or 5xx is fine
      isAcceptable = status >= 400 && status < 600;
    } else {
      // Success expected; check 2xx range
      isAcceptable =
        status >= expectStatusRange[0] && status <= expectStatusRange[1];
    }

    if (!isAcceptable && expectStatus !== null) {
      return {
        passed: false,
        message: formatResult(
          endpoint,
          method,
          status,
          null,
          `Expected ${expectStatusRange[0]}-${expectStatusRange[1]}, got ${status}`,
        ),
      };
    }

    // Try to parse response
    let data = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    return {
      passed: isAcceptable,
      message: formatResult(endpoint, method, status, data),
    };
  } catch (error) {
    return {
      passed: false,
      message: `${method} /${endpoint} ✗ (${error.message})`,
    };
  }
}

/**
 * Run all smoke tests.
 * @returns {Promise<{passed: number, failed: number, tests: Array}>}
 */
export async function runAllTests() {
  console.log("\nSmoke Tests — Deployment Readiness Check\n");
  console.log("------------------------------------------\n");

  const tests = [
    {
      name: "Health check",
      endpoint: "health",
      method: "GET",
    },
    {
      name: "Latest manifest (or fallback)",
      endpoint: "manifest/latest",
      method: "GET",
      allowedStatuses: [503], // KV namespace might not be configured
    },
    {
      name: "Claude Code client info",
      endpoint: "client/claude-code/latest",
      method: "GET",
    },
    {
      name: "Create task (minimal payload)",
      endpoint: "tasks",
      method: "POST",
      body: {}, // Empty object is valid
      expectStatusRange: [200, 201],
    },
    {
      name: "Execute (with valid auth, expect executor unavailable)",
      endpoint: "execute",
      method: "POST",
      body: {
        tool: "test-tool",
        args: [],
        request_id: "test-req-123",
      },
      allowedStatuses: [502, 504, 500], // Executor might not be reachable or configured
    },
  ];

  const results = [];
  for (const test of tests) {
    const result = await runTest(
      test.name,
      test.endpoint,
      test.method,
      test.body,
      {
        expectStatusRange: test.expectStatusRange || [200, 299],
        allowedStatuses: test.allowedStatuses || [],
      },
    );
    results.push(result);
    console.log(result.message);
  }

  console.log();

  // Test auth requirement
  console.log("Auth Requirement Tests\n");

  try {
    const url = getWorkerUrl();
    const response = await fetch(`${url}/health`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // No Authorization header
    });

    if (response.status === 401) {
      console.log("GET /health (no auth) ✓ 401 - Auth required");
      results.push({ passed: true, message: "Auth requirement validated" });
    } else {
      console.log(`GET /health (no auth) ✗ ${response.status} - Expected 401`);
      results.push({
        passed: false,
        message: "Auth requirement not validated",
      });
    }
  } catch (error) {
    console.log(`Auth check ✗ (${error.message})`);
    results.push({
      passed: false,
      message: "Auth check failed: " + error.message,
    });
  }

  console.log();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return { passed, failed, tests: results };
}

// CLI invocation
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then((result) => {
      console.log(`\n${result.passed} passed, ${result.failed} failed\n`);

      if (result.failed === 0) {
        console.log("✓ All smoke tests passed. Deployment is ready.");
        process.exit(0);
      } else {
        console.log("✗ Some tests failed. Check configuration and try again.");
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error(`Fatal error: ${error.message}`);
      process.exit(1);
    });
}
