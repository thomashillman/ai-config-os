# Engineering Principles

Core design, code quality, delivery, and process principles for this repo.

## Design

- KISS: simplest solution that fully solves the problem. No speculative features (YAGNI).
- DRY: one authoritative representation of every piece of logic.
- High cohesion, low coupling: changes should be local, not system-wide.
- SOLID as a refactoring lens, not an upfront prescription:
  - SRP: one reason to change per class/module; extract when responsibilities diverge.
  - OCP: extend via new implementations, not edits to existing core logic.
  - LSP: subtypes must honour the contract of their base; prefer composition when they can't.
  - ISP: depend only on the interface slice you actually need; split fat interfaces.
  - DIP: inject abstractions into business logic; wire concrete implementations at the composition root.

## Code quality

- Readability over cleverness. Code is read far more than it is written.
- TDD by default: tests drive design, prevent regressions, and make refactoring safe.
- Refactor continuously in small, test-backed steps rather than letting entropy accumulate.
- Conform to codebase conventions: follow existing patterns, helpers, naming, and formatting; state explicitly if you must diverge.
- Cover all relevant surfaces: ensure behaviour stays consistent across the application, not just at the point of change.
- Tight error handling: no broad try/catch blocks or silent defaults; propagate or surface errors explicitly, consistent with repo patterns.
- Read enough context before editing a file; batch logical changes together rather than many small patches.
- Search for prior art before adding new helpers or logic; reuse or extract a shared helper instead of duplicating.

## Delivery

- Ship in small, frequent increments to reduce risk and tighten feedback loops.
- Instrument for observability: issues should be visible before users report them.
- Quality is built in: testing, monitoring, and resilience are not afterthoughts.

## Process

- Source control is the source of truth. Automate repetitive tasks.
- Features are done when they deliver value in production, not when they pass QA.
- Fix the system, not the person, when things go wrong.
