#!/usr/bin/env node
/**
 * CI entry: reads MERGE_GIT, CHANGES, MERGE_NODE from env (GitHub needs.*.result)
 * and exits 0 only when evaluateMergeGateStatusResults accepts the tuple.
 */
import { evaluateMergeGateStatusResults } from "./lib/merge-gate-status-logic.mjs";

const mergeGit = process.env.MERGE_GIT ?? "";
const changes = process.env.CHANGES ?? "";
const mergeNode = process.env.MERGE_NODE ?? "";

if (mergeGit === "" && changes === "" && mergeNode === "") {
  console.error(
    "::error::Missing merge gate job results (MERGE_GIT, CHANGES, MERGE_NODE are all empty). Expected GitHub Actions needs.*.result env.",
  );
  process.exit(1);
}

const tupleLine = `merge-git=${mergeGit} changes=${changes} merge-node=${mergeNode}`;
console.log(tupleLine);

const r = evaluateMergeGateStatusResults(mergeGit, changes, mergeNode);
console.log(r.detail);
if (!r.ok) {
  console.error(`::error::${r.detail}`);
  process.exit(1);
}
process.exit(0);
