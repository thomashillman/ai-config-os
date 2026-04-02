/**
 * Pure logic for the merge-gate-status aggregate job (mirrors inline shell in
 * .github/workflows/pr-mergeability-gate.yml). CI does not run this file — the
 * workflow uses trusted inline bash so PRs cannot swap scripts/ci and bypass the gate.
 * GitHub job results: success | failure | cancelled | skipped
 * @see https://docs.github.com/en/actions/learn-github-actions/contexts#needs-context
 */

/**
 * @param {string} mergeGit
 * @param {string} changes
 * @param {string} mergeNode
 * @returns {{ ok: true; detail: string } | { ok: false; detail: string }}
 */
export function evaluateMergeGateStatusResults(mergeGit, changes, mergeNode) {
  const tuple = `merge-git=${mergeGit} changes=${changes} merge-node=${mergeNode}`;

  if (
    mergeGit === "failure" ||
    mergeGit === "cancelled" ||
    changes === "failure" ||
    changes === "cancelled" ||
    mergeNode === "failure" ||
    mergeNode === "cancelled"
  ) {
    return {
      ok: false,
      detail: `Merge gate failed (${tuple})`,
    };
  }

  if (
    mergeGit === "skipped" &&
    changes === "skipped" &&
    mergeNode === "skipped"
  ) {
    return {
      ok: true,
      detail: "Merge gate jobs skipped (e.g. draft PR) — OK",
    };
  }

  if (
    mergeGit === "success" &&
    changes === "success" &&
    mergeNode === "success"
  ) {
    return {
      ok: true,
      detail: "Merge gate passed",
    };
  }

  return {
    ok: false,
    detail: `Unexpected merge gate job states: ${tuple}`,
  };
}
