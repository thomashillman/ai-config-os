---
skill: "security-review"
description:
  "Perform OWASP-aware security review of code, dependencies, and configuration.

  Identifies injection risks, auth/authn flaws, secrets exposure, CVEs.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "code_or_config"
    type: "string"
    description: "Code snippet, config file, or dependency list to review"
    required: true
  - name: "context"
    type: "string"
    description: '"web" (HTTP APIs), "cli" (command-line tools), "data" (databases), "general"'
    required: false
  - name: "scope"
    type: "string"
    description: '"quick" (top issues), "thorough" (all OWASP categories)'
    required: false
outputs:
  - name: "findings"
    type: "string"
    description: "Severity-tagged findings (CRITICAL/HIGH/MEDIUM/LOW) with remediation"
  - name: "risk_score"
    type: "number"
    description: "1-10 security risk assessment"
dependencies:
  skills:
    - name: "code-review"
      version: "^1.0"
      optional: true
  apis: []
  models:
    - "sonnet"
examples:
  - input: 'SQL query: SELECT * FROM users WHERE id = " + userId'
    output: "CRITICAL: SQL injection vulnerability; use parameterized queries"
    expected_model: "sonnet"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Full OWASP analysis, threat modeling"
    cost_factor: 2.5
    latency_baseline_ms: 700
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Default; top security issues with fixes"
    cost_factor: 1
    latency_baseline_ms: 400
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Critical issues only"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "opus"
    - "sonnet"
    - "haiku"
tests:
  - id: "test-injection"
    type: "prompt-validation"
    input: "SQL code with string interpolation"
    expected_substring: "injection"
    models_to_test:
      - "sonnet"
  - id: "test-secrets"
    type: "prompt-validation"
    input: "Code logging API key to console"
    expected_substring: "secret"
    models_to_test:
      - "sonnet"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "examples"
  keywords:
    - "security"
    - "owasp"
    - "vulnerabilities"
    - "injection"
    - "secrets"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "findings_count"
    - "risk_score"
version: "1.0.0"
changelog:
  1.0.0: "Initial release; OWASP security review"
tags:
  - "security"
  - "code-quality"
capabilities:
  required: []
  optional:
    - "fs.read"
    - "network.http"
  fallback_mode: "prompt-only"
  fallback_notes: "Can review pasted code or configs without live lookups."
---

# Security Review

Perform OWASP-aware security review of code, dependencies, and configuration.

Identifies injection risks, authentication flaws, secrets exposure, and CVEs.

## When to use

Before deploying to production, reviewing third-party code, or when security is a concern.

## Instructions

1. Paste code, config, or dependency manifest
2. Specify context (web API, CLI tool, data processing, etc.) if known
3. Specify scope: "quick" (critical issues) or "thorough" (all OWASP categories)
4. Receive severity-tagged findings with concrete remediation steps

## Examples

### Example 1: SQL Injection

**Input:**

```python
user_id = request.args.get('id')
query = f"SELECT * FROM users WHERE id = {user_id}"
result = db.execute(query)
```

**Output:**

```
CRITICAL: SQL Injection
- Issue: User input directly interpolated into SQL query
- Risk: Attacker can execute arbitrary SQL, exfiltrate data, delete tables
- Fix: Use parameterized queries
  query = "SELECT * FROM users WHERE id = ?"
  result = db.execute(query, (user_id,))
```

### Example 2: Exposed Secrets

**Input:**

```javascript
const apiKey = "sk-abc123...";
console.log("API Key:", apiKey);
```

**Output:**

```
CRITICAL: Hardcoded Secret
- Issue: API key visible in logs and source code
- Risk: Anyone with access to logs/repo can use the key
- Fix: Load from environment variable or secrets manager
  const apiKey = process.env.API_KEY;
```
