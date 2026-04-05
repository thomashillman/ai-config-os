# Task Command Store Implementation Progress

**Last updated:** 2026-04-05

## Reality check (corrected)

Earlier progress notes overstated cutover completion. The repository now reflects the actual architecture for the three narrow mutation commands:

- `task.select_route`
- `task.transition_state`
- `task.append_finding`

For those commands, TaskObject `/apply-command` is now the authoritative write path in `authoritative` mode, and KV is projection-only for those mutations.

## Delivered in this correction pass

1. Added explicit command store mode switch (`shadow` vs `authoritative`) in runtime wiring.
2. Moved narrow-command writes in `DualWriteTaskStore` to TaskObject-first authoritative apply, followed by KV projection update.
3. Added truthful projection status handling (`applied` vs `pending`) when KV projection write fails after authoritative success.
4. Removed `Date.now()`-based idempotency key generation for migrated command handlers; added deterministic idempotency generation with optional caller key override.
5. Stopped defaulting `resolved_context` to `request_context`; handlers now pass server-validated resolved context explicitly.
6. Updated narrow mutation handlers to return compact receipts by default (action/version/replay/projection status).
7. Wired projection metadata into live task reads (`projection` object on task reads when authoritative commits exist).
8. Added invokable projection repair path via `POST /v1/tasks/:taskId/projection-repair` (authoritative mode only).
9. Reworked drift validators and validator tests to inspect live module behavior/contracts instead of static constant lists.

## Scope intentionally unchanged

- Non-migrated mutation commands remain on existing behavior.
- Existing read endpoints for full task state remain available.
