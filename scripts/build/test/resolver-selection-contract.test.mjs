import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreRoute,
  selectBestRoute,
  selectRouteOutcome,
} from '../lib/resolver-selection.mjs';

describe('resolver selection contract', () => {
  test('highest-score route is selected for a request', () => {
    const routes = [
      { id: 'route-a', score: 2 },
      { id: 'route-b', score: 10 },
      { id: 'route-c', score: 6 },
    ];

    const selected = selectBestRoute(routes);

    assert.equal(selected?.id, 'route-b');
    assert.equal(scoreRoute(selected), 10);
  });

  test('equal scores use deterministic tie-break behavior', () => {
    const routes = [
      { id: 'z-route', score: 5 },
      { id: 'a-route', score: 5 },
      { id: 'm-route', score: 5 },
    ];

    const selected = selectBestRoute(routes);

    assert.equal(selected?.id, 'a-route');
  });

  test('equivalent routes produce the same selected outcome', () => {
    const equivalentSetA = [
      { id: 'edge-a', score: 7, equivalenceKey: 'cluster-1' },
      { id: 'edge-b', score: 7, equivalenceKey: 'cluster-1' },
    ];

    const equivalentSetB = [
      { id: 'edge-b', score: 7, equivalenceKey: 'cluster-1' },
      { id: 'edge-a', score: 7, equivalenceKey: 'cluster-1' },
    ];

    assert.equal(selectRouteOutcome(equivalentSetA), 'cluster-1');
    assert.equal(selectRouteOutcome(equivalentSetB), 'cluster-1');
  });

  test('regression: ambiguous multi-route scenario remains stable', () => {
    const routes = [
      { id: 'legacy-fallback', score: 3, equivalenceKey: 'fallback' },
      { id: 'new-path-beta', score: 8, equivalenceKey: 'primary' },
      { id: 'new-path-alpha', score: 8, equivalenceKey: 'primary' },
      { id: 'experimental', score: 8, equivalenceKey: 'experimental' },
    ];

    const selected = selectBestRoute(routes);

    // Highest-score tie must remain deterministic; lexicographic id wins.
    assert.equal(selected?.id, 'experimental');
    assert.equal(selectRouteOutcome(routes), 'experimental');
  });
});
