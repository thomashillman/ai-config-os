// Momentum narration templates — mutable data, not code.
// The self-improvement reflector can propose replacements for any template
// without modifying the narrator engine.

export const TEMPLATE_VERSION = "1.0.0";

export const strengthLabels = {
  pasted_diff: {
    level: "limited",
    label: "Diff-only review",
    description:
      "Can spot patterns in changed lines; cannot verify broader impact",
  },
  github_pr: {
    level: "degraded",
    label: "PR metadata + diff",
    description: "Can see PR context and diff; cannot run local analysis",
  },
  uploaded_bundle: {
    level: "degraded",
    label: "Uploaded snapshot",
    description: "Can inspect files; cannot run tools or verify live state",
  },
  local_repo: {
    level: "full",
    label: "Full repository access",
    description: "Can verify call sites, run tests, inspect dependencies",
  },
};

export const provenancePrefixes = {
  hypothesis: "Possible",
  reused: "Previously identified",
  verified: "Confirmed",
};

export const taskTypeLabels = {
  review_repository: "repository review",
};

export const templates = {
  onStart: {
    headline: "Starting {taskTypeLabel} with {routeLabel}",
    upgrade_available:
      "If you continue in {strongerRouteLabel}, I can {upgradeUnlocks}",
  },
  onResume: {
    headline: "Continuing your {taskTypeLabel}",
    progress_with_upgrade:
      "{findingsCount} findings from earlier session, ready for {upgradeDescription}",
    progress_without_upgrade: "{findingsCount} findings from earlier session",
  },
  onFindingEvolved: {
    headline: "{provenancePrefix} {findingSummary}",
  },
  onUpgradeAvailable: {
    headline:
      "With {strongerRouteLabel}, I can verify these {findingsCount} findings against call sites and related tests",
    prompt: "Continue with deeper inspection?",
  },
  onShelfView: {
    headline_with_upgrade:
      "{taskTypeLabel} — {findingsCount} findings ready for {upgradeDescription}",
    headline_without_upgrade:
      "{taskTypeLabel} — {findingsCount} findings collected",
    continuation_with_upgrade:
      "{strongerRouteLabel} unlocks verification of {pendingCount} earlier findings",
    continuation_without_upgrade: "Resume to continue collecting findings",
  },
};

export const upgradeUnlocksDescriptions = {
  local_repo:
    "verify call sites, check related tests, inspect dependency graph",
  github_pr: "see PR context and review metadata",
  uploaded_bundle: "inspect uploaded files in context",
};
