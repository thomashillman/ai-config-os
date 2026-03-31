#!/usr/bin/env node
import {
  loadSkillModels,
  validateDependencies,
} from "./lib/ops-skill-model.mjs";
import { parseRepoRootArg, printErrorsAndExit } from "./lib/ops-cli-utils.mjs";

function main() {
  const repoRoot = parseRepoRootArg(process.argv.slice(2));
  console.log("==> Validating skill dependencies...");
  console.log("");

  const { models, errors: loadErrors } = loadSkillModels(repoRoot);
  const dependencyErrors = validateDependencies(models);
  const errors = [...loadErrors, ...dependencyErrors];

  if (errors.length > 0) {
    printErrorsAndExit(errors);
    return;
  }

  console.log(`[ok] Validated ${models.length} skill(s)`);
  console.log("[ok] All dependencies valid");
}

main();
