import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntent } from '../../../runtime/lib/intent-lexicon.mjs';

test('exact match: "review this repository" resolves to review_repository', () => {
  const result = resolveIntent('review this repository');

  assert.equal(result.resolved, true);
  assert.equal(result.taskType, 'review_repository');
  assert.deepEqual(result.routeHints, {});
  assert.equal(result.goal, 'Review repository');
  assert.equal(result.confidence, 1.0);
});

test('exact match: "review the repo" resolves to review_repository', () => {
  const result = resolveIntent('review the repo');

  assert.equal(result.resolved, true);
  assert.equal(result.taskType, 'review_repository');
});

test('exact match: "audit this repo" resolves to review_repository', () => {
  const result = resolveIntent('audit this repo');

  assert.equal(result.resolved, true);
  assert.equal(result.taskType, 'review_repository');
});

test('PR route: "review this pr" resolves with github_pr hint', () => {
  const result = resolveIntent('review this pr');

  assert.equal(result.resolved, true);
  assert.equal(result.taskType, 'review_repository');
  assert.equal(result.routeHints.prefer_route, 'github_pr');
  assert.equal(result.goal, 'Review pull request');
});

test('PR route: "check this pr" resolves with github_pr hint', () => {
  const result = resolveIntent('check this pr');

  assert.equal(result.resolved, true);
  assert.equal(result.routeHints.prefer_route, 'github_pr');
});

test('diff route: "check this diff" resolves with pasted_diff hint', () => {
  const result = resolveIntent('check this diff');

  assert.equal(result.resolved, true);
  assert.equal(result.taskType, 'review_repository');
  assert.equal(result.routeHints.prefer_route, 'pasted_diff');
  assert.equal(result.confidence, 0.9);
});

test('bundle route: "review this bundle" resolves with uploaded_bundle hint', () => {
  const result = resolveIntent('review this bundle');

  assert.equal(result.resolved, true);
  assert.equal(result.routeHints.prefer_route, 'uploaded_bundle');
});

test('case-insensitive matching works', () => {
  const result = resolveIntent('Review This Repository');

  assert.equal(result.resolved, true);
  assert.equal(result.taskType, 'review_repository');
});

test('case-insensitive with mixed case', () => {
  const result = resolveIntent('CHECK THIS DIFF');

  assert.equal(result.resolved, true);
  assert.equal(result.routeHints.prefer_route, 'pasted_diff');
});

test('wildcard pattern captures PR number', () => {
  const result = resolveIntent('review pr #42');

  assert.equal(result.resolved, true);
  assert.equal(result.taskType, 'review_repository');
  assert.equal(result.routeHints.prefer_route, 'github_pr');
  assert.equal(result.routeHints.captures.pr_number, '42');
});

test('unknown phrase returns resolved: false with suggestions', () => {
  const result = resolveIntent('something unknown');

  assert.equal(result.resolved, false);
  assert.ok(Array.isArray(result.suggestions));
  assert.ok(result.suggestions.length > 0);
  assert.ok(result.suggestions[0].phrase);
  assert.ok(result.suggestions[0].taskType);
});

test('suggestions are ordered by relevance (edit distance)', () => {
  const result = resolveIntent('review this repos'); // close to "review this repository"

  assert.equal(result.resolved, false);
  // "review this repository" should be among top suggestions
  const topSuggestion = result.suggestions[0];
  assert.ok(topSuggestion.phrase.includes('review'));
});

test('empty input returns resolved: false', () => {
  const result = resolveIntent('');
  assert.equal(result.resolved, false);
  assert.deepEqual(result.suggestions, []);
});

test('null input returns resolved: false', () => {
  const result = resolveIntent(null);
  assert.equal(result.resolved, false);
  assert.deepEqual(result.suggestions, []);
});

test('undefined input returns resolved: false', () => {
  const result = resolveIntent(undefined);
  assert.equal(result.resolved, false);
  assert.deepEqual(result.suggestions, []);
});

test('multiple definitions with different routeHints resolve distinctly', () => {
  const prResult = resolveIntent('review this pr');
  const diffResult = resolveIntent('check this diff');
  const bundleResult = resolveIntent('review this bundle');

  assert.equal(prResult.routeHints.prefer_route, 'github_pr');
  assert.equal(diffResult.routeHints.prefer_route, 'pasted_diff');
  assert.equal(bundleResult.routeHints.prefer_route, 'uploaded_bundle');
});

test('custom definitions can be injected', () => {
  const customDefs = [
    {
      patterns: ['deploy to staging'],
      taskType: 'deploy',
      routeHints: { environment: 'staging' },
      goal: 'Deploy to staging',
      confidence: 1.0,
    },
  ];

  const result = resolveIntent('deploy to staging', { definitions: customDefs });

  assert.equal(result.resolved, true);
  assert.equal(result.taskType, 'deploy');
  assert.equal(result.routeHints.environment, 'staging');
});

test('whitespace normalisation works', () => {
  const result = resolveIntent('  review   this   repository  ');

  assert.equal(result.resolved, true);
  assert.equal(result.taskType, 'review_repository');
});
