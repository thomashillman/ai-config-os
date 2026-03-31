---
skill: "web-search"
description: "Search the web for information and synthesize results.

  Use when the user needs current information, facts, or context from online sources.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "query"
    type: "string"
    description: "Search query string"
    required: true
  - name: "num_results"
    type: "integer"
    description: "Number of results to retrieve (1-10)"
    required: false
  - name: "filter_by_date"
    type: "string"
    description: "Filter results (latest_day, latest_week, latest_month)"
    required: false
outputs:
  - name: "results"
    type: "array"
    description: "Array of search results with title, url, snippet"
dependencies:
  skills: []
  apis:
    - "web-search-api"
  models:
    - "sonnet"
    - "opus"
examples:
  - input: "Search for latest Claude model updates"
    output: "Recent announcements show Claude 4.6 released with improved reasoning..."
    expected_model: "sonnet"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Comprehensive search with detailed synthesis of results"
    cost_factor: 3
    latency_baseline_ms: 1200
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Default variant; fast and accurate search synthesis"
    cost_factor: 1
    latency_baseline_ms: 500
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Quick search result summaries"
    cost_factor: 0.3
    latency_baseline_ms: 200
  fallback_chain:
    - "sonnet"
    - "opus"
    - "haiku"
tests:
  - id: "test-basic-search"
    type: "prompt-validation"
    input: "Search for Python programming tutorial"
    expected_substring: "Python"
    max_latency_ms: 2000
    models_to_test:
      - "sonnet"
      - "opus"
  - id: "test-current-events"
    type: "prompt-validation"
    input: "What are the latest AI news?"
    expected_not_null: true
    models_to_test:
      - "sonnet"
  - id: "test-no-results"
    type: "prompt-validation"
    input: "xyzabc123invalidquery"
    expected_not_null: true
  - id: "test-performance"
    type: "performance"
    iterations: 5
    model: "sonnet"
    track_metrics:
      - "latency"
      - "token_count"
      - "cost"
composition:
  personas:
    - name: "researcher"
      description: "In-depth research persona"
      skills:
        - "web-search"
        - "research-assistant"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "examples"
    - "dependencies"
    - "variants"
  help_text: "Search the web for current information about {query}."
  keywords:
    - "search"
    - "web"
    - "information"
    - "research"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "token_count"
    - "cost"
    - "variant_selected"
  alert_threshold_latency_ms: 3000
  public_metrics: true
version: "1.0.0"
changelog:
  1.0.0: "Initial release with Opus/Sonnet/Haiku variants"
tags:
  - "core"
  - "utility"
  - "information-gathering"
capabilities:
  required:
    - "network.http"
  optional:
    - "browser.fetch"
  fallback_mode: "manual"
  fallback_notes: "Can analyse URLs or pasted results when network access is unavailable."
---

# web-search

Search the web for current information using available APIs and synthesize results for the user.

## When to use

When the user needs:

- Current information or recent news
- Factual data not in your training data
- Sources for specific claims
- Multiple perspectives on a topic

## Instructions

1. Understand the user's search intent from their query
2. Call the web-search API with appropriate parameters
3. Retrieve and analyze the top results
4. Synthesize findings into a coherent answer
5. Include citations with source URLs
6. Note any conflicting information or uncertainty

## Examples

### Example 1: Recent News

**Input:** "What are the latest developments in AI?"
**Output:**

```
Recent AI developments include:
- Claude 4.6 released with improved reasoning capabilities
- New multimodal models emerging from major labs
- Growing focus on AI safety and alignment research

Sources:
- Anthropic blog (latest)
- AI research publications
```

### Example 2: Technical Information

**Input:** "How do transformers work in machine learning?"
**Output:**

```
Transformers are neural network architectures that:
1. Use self-attention mechanisms to process sequences in parallel
2. Rely on positional encoding to maintain order information
3. Stack multiple attention and feed-forward layers

Key papers:
- "Attention Is All You Need" (Vaswani et al., 2017)
- [more recent papers]
```
