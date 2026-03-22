// Intent lexicon definitions — mutable data, not code.
// The self-improvement reflector can append new patterns
// without modifying the resolution engine.

export const definitions = [
  {
    patterns: ['review this repository', 'review the repo', 'review repo', 'review this repo', 'audit this repo'],
    taskType: 'review_repository',
    workTitle: 'Repository review',
    routeHints: {},
    goal: 'Review repository',
    confidence: 1.0,
  },
  {
    patterns: ['review this pr', 'review the pull request', 'review pr #*', 'check this pr'],
    taskType: 'review_repository',
    workTitle: 'Repository review',
    routeHints: { prefer_route: 'github_pr' },
    goal: 'Review pull request',
    confidence: 1.0,
  },
  {
    patterns: ['check this diff', 'review this diff', 'look at this diff'],
    taskType: 'review_repository',
    workTitle: 'Repository review',
    routeHints: { prefer_route: 'pasted_diff' },
    goal: 'Review diff',
    confidence: 0.9,
  },
  {
    patterns: ['review this bundle', 'check this archive', 'review uploaded code'],
    taskType: 'review_repository',
    workTitle: 'Repository review',
    routeHints: { prefer_route: 'uploaded_bundle' },
    goal: 'Review uploaded code bundle',
    confidence: 0.9,
  },
];
