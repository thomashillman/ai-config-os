---
skill: rtl-query-patterns
description: |
  Authoritative reference for React Testing Library query semantics — how
  getByText, findByText, getByRole, and within resolve against real DOM structures.
  Answers "which query should I use?" and "why isn't this matcher finding my element?"
  without requiring a test run.

type: prompt
status: stable

capabilities:
  required: []
  optional:
    - fs.read
  fallback_mode: prompt-only
  fallback_notes: Pure reference — no filesystem access required. fs.read is optional for reading component source to identify the exact DOM structure.

inputs:
  - name: query_question
    type: string
    description: The matcher question or failing assertion to diagnose
    required: false
  - name: component_snippet
    type: string
    description: Optional JSX snippet showing the DOM structure being queried
    required: false

outputs:
  - name: query_recommendation
    type: string
    description: The recommended RTL query with explanation of why it works for the given DOM structure

dependencies:
  skills: []
  apis: []

examples:
  - input: "Does getByText('Degraded') match <p><span>Status:</span> Degraded</p>?"
    output: "No. The <p> textContent is 'Status: Degraded', not 'Degraded'. Use getByText(/Degraded/) or target a leaf element with exactly that text."
    expected_model: sonnet
  - input: "How do I assert text inside a specific table row?"
    output: "Use within(row).getByText('stable') where row = screen.getByTestId('skill-row-...'). within() scopes all queries to that subtree."
    expected_model: sonnet

tests:
  - id: test-explains-textcontent-matching
    type: prompt-validation
    input: "Why doesn't getByText('Foo') match <p><span>Label:</span> Foo</p>?"
    expected_substring: "textContent"
    max_latency_ms: 3000
    models_to_test:
      - sonnet

version: "1.0.0"
changelog:
  "1.0.0": "Initial release — born from multi-pass RTL uncertainty during PR #256 test fixes"

tags:
  - library-api-reference
  - testing
  - react
---

# rtl-query-patterns

Authoritative reference for React Testing Library query semantics. Eliminates multi-pass uncertainty about which query to use and why a matcher isn't finding an element — without needing a test run to verify.

Introduced after extended planning uncertainty about whether `getByText("Degraded")` would match a `<p>` containing `<span>Status:</span> Degraded` (it does not — see rules below).

## Capability contract

No capabilities required. Pure reference — works from pasted JSX or component source.
Optional: `fs.read` to read component source and identify the exact DOM structure.

## When to use

- Writing a new test assertion and unsure which RTL query to use
- A test assertion is not finding an element and the reason isn't obvious
- Planning test fixes without being able to run the test suite
- Reviewing tests for brittle or incorrect matcher choices

## Instructions

### Core matching rule

RTL's `getByText(string)` with `exact: true` (the default) matches elements whose **full normalised `textContent`** equals the string exactly.

`textContent` of an element is the concatenation of all descendant text nodes, with whitespace collapsed. A bare text node is never a query target — only the nearest wrapping element is tested.

### Rule table

| DOM structure                          | Query                             | Matches? | Reason                                                       |
| -------------------------------------- | --------------------------------- | -------- | ------------------------------------------------------------ |
| `<div>Foo</div>`                       | `getByText("Foo")`                | ✓        | textContent = "Foo" exactly                                  |
| `<p><span>Label:</span> Foo</p>`       | `getByText("Foo")`                | ✗        | textContent = "Label: Foo"                                   |
| `<p><span>Label:</span> Foo</p>`       | `getByText(/Foo/)`                | ✓        | regex — matches any element whose textContent contains "Foo" |
| `<p><span>Label:</span> Foo</p>`       | `getByText("Label: Foo")`         | ✓        | exact match on full textContent                              |
| `<li>worker_unreachable</li>`          | `getByText("worker_unreachable")` | ✓        | `<li>` textContent is exactly that string                    |
| `<span>Degraded</span>`                | `getByText("Degraded")`           | ✓        | `<span>` textContent = exactly "Degraded"                    |
| `<p><span>Status:</span> Degraded</p>` | `getByText("Degraded")`           | ✗        | `<p>` textContent = "Status: Degraded"; `<span>` = "Status:" |
| `<p><span>Status:</span> Degraded</p>` | `getByText(/Degraded/)`           | ✓        | regex matches `<p>`                                          |

### Choosing a query

1. **Exact text in a leaf element** (`<li>`, `<span>`, `<td>`, `<button>`) → `getByText("exact text")`. Most stable — prefer this when you control the component.

2. **Text is part of a mixed-content element** (label + value in the same `<p>`) → use regex `getByText(/value/)` or the full string `getByText("Label: value")`.

3. **Scoping to a container** (e.g. a table row) → `within(container).getByText(...)`:

   ```js
   const row = screen.getByTestId("skill-row-code-review");
   within(row).getByText("stable");
   ```

4. **Async data** (element appears after fetch/state update) → `findByText(...)` or `waitFor(...)`:

   ```js
   expect(await screen.findByText("loop")).toBeInTheDocument();
   // or
   await waitFor(() => expect(screen.getByText("loop")).toBeInTheDocument(), {
     timeout: 5000,
   });
   ```

5. **Assert absence** → `queryByText(...)` returns `null` instead of throwing:

   ```js
   expect(screen.queryByText("No data")).not.toBeInTheDocument();
   ```

6. **Interactive elements** → prefer `getByRole("button", { name: "Sync Now" })` — more resilient than `getByText`.

### Diagnosing a failing assertion

1. Add `screen.debug()` before the failing line to print the current DOM.
2. Find the element containing your target text and note its tag.
3. Does the element's **full** textContent equal your query string? (Including all child element text?)
4. If not: use regex, the full textContent, `within()` to scope, or add a `data-testid` to the component.

## Examples

### Example 1 — mixed-content paragraph

**Input:** "Does `getByText('Degraded')` match `<p><span>Status:</span> Degraded</p>`?"

**Output:**
No. The `<p>` has textContent `"Status: Degraded"`. The `<span>` has `"Status:"`. Neither equals `"Degraded"`.

Fix options:

- `getByText(/Degraded/)` — regex matches `<p>` whose textContent contains "Degraded"
- `getByText("Status: Degraded")` — exact match on the full `<p>` text
- Add `<span data-testid="status-value">Degraded</span>` to the component, use `getByTestId`

### Example 2 — scoping to a table row

**Input:** "How do I assert the status cell inside a specific skill row?"

**Output:**

```js
const row = screen.getByTestId("skill-row-code-review");
expect(within(row).getByText("stable")).toBeInTheDocument();
```

Without `within`, `getByText("stable")` might match the wrong row if multiple rows share the same value.

### Example 3 — async data

**Input:** "My `getByText('loop')` fails — the data loads after render."

**Output:**

```js
expect(await screen.findByText("loop")).toBeInTheDocument();
```

`findByText` is `getByText` wrapped in `waitFor` and returns a Promise. Always use it (or `waitFor`) when the element appears after a fetch, `setTimeout`, or React state update.
