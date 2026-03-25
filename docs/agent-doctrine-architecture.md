# Agent Doctrine Architecture (Internal)

This document explains how agent doctrine content is organized, why certain generated files are committed, and how to materialise the doctrine into another repository.

## 1) Base vs Surface vs Overlay split

- **Base**: shared doctrine fragments that are platform-agnostic and represent the core operating model.
- **Surface**: delivery-specific fragments for each agent surface (for example Claude vs Codex) that adapt the same intent to platform capabilities and UX constraints.
- **Overlay**: environment or repository-specific additions layered last (team conventions, branch policy, local safety rails, integration notes).

Think of this as:

`base (shared intent) + surface (platform adaptation) + overlay (local policy) => generated root instruction files`

This split keeps doctrine consistent while still allowing different delivery channels and local repos to enforce different operational details.

## 2) Claude/Codex delivery differences

- **Claude delivery** typically includes Claude-specific structure and lifecycle expectations (for example command/hook framing and Claude-oriented runtime instructions).
- **Codex delivery** targets Codex execution behavior and tooling assumptions, while preserving the same core doctrine outcomes.
- Both should derive from the same **base** semantics so policy drift is intentional, reviewable, and minimized.

In short: behavior goals stay aligned; rendering and operational wording differ by surface.

## 3) Why committed generated root files exist

Generated root files are committed on purpose to provide:

- **Determinism for contributors and CI**: everyone sees the exact rendered doctrine without requiring local build steps first.
- **Reviewability**: PRs show both source fragment edits and rendered output deltas.
- **Operational portability**: downstream repos can consume already-materialised root files immediately.
- **Drift detection**: generated file diffs make doctrine-build regressions visible.

## 4) Enforcement-vs-guidance principle

Doctrine should clearly separate:

- **Enforcement**: hard safety/mergeability rules that must be followed and are expected to be checkable.
- **Guidance**: best-practice recommendations that improve outcomes but allow context-dependent judgment.

Use enforcement sparingly and explicitly; keep guidance practical and concise.

## 5) Materialising into another repo

High-level process:

1. Copy or vendor the doctrine source fragments/build tooling into the target repo.
2. Run the doctrine materialisation/build command in that repo.
3. Commit both fragment sources and generated root files.
4. Validate with the target repo's policy checks/CI.

This preserves the same base/surface/overlay mechanics while allowing per-repo overlays.

## 6) Minimal update flow

1. **Edit fragment** (base/surface/overlay source).
2. **Run doctrine build** (materialise/generate root outputs).
3. **Commit generated root files** along with the source fragment change.

