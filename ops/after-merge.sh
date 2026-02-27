#!/usr/bin/env bash
# Run this after merging a PR to prompt yourself through docs maintenance.
echo "==> Post-merge docs checklist"
echo ""
echo "  [ ] PLAN.md — tick completed acceptance criteria"
echo "  [ ] PLAN.md — update ## Current State (phase statuses)"
echo "  [ ] PLAN.md — refresh ## Recommended next"
echo "  [ ] shared/manifest.md — update skills table if skills changed"
echo "  [ ] CLAUDE.md — update if conventions, structure, or constraints changed"
echo "  [ ] README.md — update if install steps or capabilities changed"
echo ""
echo "  Then run: adapters/claude/dev-test.sh"
