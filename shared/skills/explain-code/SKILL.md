---
skill: "explain-code"
description: "Explain code snippets at varying depths, from one-liners to architectural intent and design trade-offs."
type: "prompt"
status: "stable"
inputs:
  - name: "code"
    type: "string"
    description: "Code snippet to explain (function, class, algorithm, module)"
    required: true
  - name: "depth"
    type: "string"
    description: "Explanation depth level (brief, detailed, architectural); default detailed"
    required: false
outputs:
  - name: "explanation"
    type: "string"
    description: "Natural language explanation at requested depth"
dependencies:
  skills: []
  apis: []
  models:
    - "sonnet"
    - "haiku"
    - "opus"
variants:
  haiku:
    prompt_file: "prompts/one-liner.md"
    description: "One-liner summary"
    cost_factor: 0.3
    latency_baseline_ms: 100
  sonnet:
    prompt_file: "prompts/functional.md"
    description: "Functional explanation with examples (default)"
    cost_factor: 1
    latency_baseline_ms: 300
  opus:
    prompt_file: "prompts/architectural.md"
    description: "Deep dive into architectural intent, patterns, and trade-offs"
    cost_factor: 3
    latency_baseline_ms: 800
  fallback_chain:
    - "sonnet"
    - "haiku"
    - "opus"
tests:
  - id: "test-simple-function"
    type: "prompt-validation"
    input: "{\"code\": \"def add(a, b):\\n  return a + b\", \"depth\": \"brief\"}"
    expected_substring: "addition"
    models_to_test:
      - "sonnet"
  - id: "test-complex-pattern"
    type: "prompt-validation"
    input: "{\"code\": \"class Observer:\\n  def __init__(self):\\n    self.observers = []\\n  def notify(self):\\n    for obs in self.observers:\\n      obs.update()\", \"depth\": \"detailed\"}"
    expected_substring: "Observer"
    models_to_test:
      - "sonnet"
  - id: "test-architectural"
    type: "prompt-validation"
    input: "{\"code\": \"async def fetch_with_cache(key, fetcher):\\n  if cache.has(key):\\n    return cache.get(key)\\n  result = await fetcher()\\n  cache.set(key, result, ttl=3600)\\n  return result\", \"depth\": \"architectural\"}"
    expected_substring: "caching"
    models_to_test:
      - "opus"
composition:
  personas: []
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "instructions"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "token_count"
    - "cost"
    - "variant_selected"
version: "1.0.0"
changelog:
  1.0.0: "Initial release with depth-aware explanations and architectural analysis"
tags:
  - "utility"
  - "documentation"
  - "explanation"
capabilities:
  required: []
  optional:
    - "fs.read"
  fallback_mode: "prompt-only"
  fallback_notes: "Can explain pasted code."
---

## When to use

Use `explain-code` when:

- Onboarding to unfamiliar code
- Documenting business logic for future maintainers
- Debugging and need to understand call chain or control flow
- Reviewing code and want deeper insight into design decisions
- Teaching or pair programming

## Instructions

1. **Map depth to model tier**:
   - `brief` → haiku (one-liner)
   - `detailed` (default) → sonnet (functional explanation)
   - `architectural` → opus (intent, patterns, trade-offs)

2. **Explain "what" before "why"**: Start with observable behavior, then reasoning

3. **Highlight non-obvious decisions**: Async/await rationale, error handling philosophy, performance implications

4. **For architectural depth**:
   - Describe design patterns (Observer, Factory, Cache, etc.)
   - Explain trade-offs (speed vs memory, simplicity vs extensibility)
   - Fit in larger system (how does this module serve the app?)
   - Risk or future maintenance concerns

5. **Provide context clues**: Variable names, return types, external dependencies

## Examples

### Input

```json
{
  "code": "async function fetchWithRetry(url, maxRetries = 3) {\n  let lastError;\n  for (let i = 0; i < maxRetries; i++) {\n    try {\n      return await fetch(url);\n    } catch (err) {\n      lastError = err;\n      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));\n    }\n  }\n  throw lastError;\n}",
  "depth": "detailed"
}
```

### Output (sonnet)

```
This function fetches a URL with exponential backoff retry logic.

**What it does:**
1. Attempts to fetch a URL up to `maxRetries` times (default 3)
2. On fetch failure, waits before retrying: 1s, 2s, 4s (exponential backoff via 2^i)
3. Returns the successful fetch response immediately
4. Throws the last error if all retries exhaust

**Why it matters:**
- Retries handle transient network failures (flaky endpoints, temporary timeouts)
- Exponential backoff prevents overwhelming a struggling server with rapid re-requests
- Matches real-world best practice for API resilience (e.g., AWS, Firebase SDKs)

**Code flow:**
- Loop index `i` drives both retry count and backoff calculation
- `lastError` captures the final exception for rethrow if all attempts fail
- `Promise` + `setTimeout` creates the backoff delay
```

### Output (opus)

```
This function implements the **Retry with Exponential Backoff** pattern for network resilience.

**Architectural Intent:**
The design trades simplicity for robustness. Instead of failing instantly on network errors, it assumes transient failures (DNS hiccup, temporary 503) are recoverable. By waiting increasingly long between retries (1s → 2s → 4s), it:
1. Gives the remote server time to recover from load
2. Reduces noise on the wire (fewer rapid retries = less server strain)
3. Maintains user-facing availability for most real-world scenarios

**Pattern Recognition:**
- **Exponential Backoff**: `Math.pow(2, i) * 1000` is a standard resilience primitive
- **Circuit Breaker compatible**: Could be wrapped with a fallback endpoint if all retries fail
- **Jitter candidate**: Production systems often add random jitter (`Math.random()`) to prevent thundering herd

**Trade-offs:**
- ✓ Handles transient failures transparently
- ✓ Follows HTTP/gRPC best practices
- ✗ Increases latency on the happy path (always waits for first attempt before retry)
- ✗ Doesn't distinguish between timeout (worth retrying) vs 404 (not worth retrying)

**Fit in larger system:**
Typically used in API clients (REST, gRPC, database connections). Pairs well with timeout middleware, request queuing, and monitoring dashboards that track retry rates. High retry rates signal upstream problems.

**Maintenance risk:**
- `maxRetries` default of 3 may be too aggressive for slow networks; consider making it configurable per call
- No jitter means synchronized retries across concurrent requests; add `Math.random() * 0.1 * Math.pow(2, i)` for distribution
```

### Input (brief variant)

```json
{
  "code": "def fibonacci(n):\n  return fibonacci(n-1) + fibonacci(n-2) if n > 1 else n",
  "depth": "brief"
}
```

### Output (haiku)

```
Recursive Fibonacci: slow (O(2^n)) but elegant. Use memoization or DP for production.
```
