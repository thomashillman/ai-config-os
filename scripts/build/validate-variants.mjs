#!/usr/bin/env node
import { loadSkillModels, validateVariants } from './lib/ops-skill-model.mjs';
import { parseRepoRootArg, printErrorsAndExit } from './lib/ops-cli-utils.mjs';

function main() {
  const repoRoot = parseRepoRootArg(process.argv.slice(2));
  console.log('==> Validating skill variant definitions...');
  console.log('');

  const { models, errors: loadErrors } = loadSkillModels(repoRoot);
  const variantErrors = validateVariants(models);
  const errors = [...loadErrors, ...variantErrors];

  if (errors.length > 0) {
    printErrorsAndExit(errors);
    return;
  }

  console.log(`[ok] Validated variants for ${models.length} skill(s)`);
  console.log('[ok] All variant definitions valid');
}

main();
