#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseRepoRootArg, printErrorsAndExit } from "./lib/ops-cli-utils.mjs";
import {
  loadSkillModels,
  validateDocsMetadata,
} from "./lib/ops-skill-model.mjs";

function toStringValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
}

function renderTable(headers, rows) {
  const lines = [];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(
      `| ${row.map((cell) => toStringValue(cell).replace(/\|/g, "\\|")).join(" | ")} |`,
    );
  }
  return lines.join("\n");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildReadme(model) {
  const frontmatter = model.frontmatter ?? {};
  const inputs = asArray(frontmatter.inputs);
  const outputs = asArray(frontmatter.outputs);
  const variants = model.variants;

  const sections = [];
  sections.push(`# ${model.name}`);
  sections.push("");
  sections.push(model.description);
  sections.push("");

  if (inputs.length > 0) {
    sections.push("## Inputs");
    sections.push("");
    sections.push(
      renderTable(
        ["Name", "Type", "Required", "Description"],
        inputs.map((input) => [
          input?.name,
          input?.type,
          input?.required,
          input?.description,
        ]),
      ),
    );
    sections.push("");
  }

  if (outputs.length > 0) {
    sections.push("## Outputs");
    sections.push("");
    sections.push(
      renderTable(
        ["Name", "Type", "Description"],
        outputs.map((output) => [
          output?.name,
          output?.type,
          output?.description,
        ]),
      ),
    );
    sections.push("");
  }

  if (variants.length > 0) {
    sections.push("## Variants");
    sections.push("");
    sections.push(
      renderTable(
        [
          "Variant",
          "Prompt File",
          "Description",
          "Cost Factor",
          "Latency (ms)",
        ],
        variants.map((variant) => [
          variant.name,
          variant.promptFile,
          variant.config?.description,
          variant.config?.cost_factor,
          variant.config?.latency_baseline_ms,
        ]),
      ),
    );
    sections.push("");
  }

  sections.push("## Integration");
  sections.push("");
  sections.push(
    "This skill is available through the core-skills plugin and can be:",
  );
  sections.push("- Invoked directly by Claude Code");
  sections.push("- Composed into workflows");
  sections.push("- Used with different model variants");
  sections.push("- Monitored for performance metrics");
  sections.push("");
  sections.push("---");
  sections.push("");
  sections.push(
    "*This README was auto-generated from SKILL.md frontmatter. Edit the SKILL.md file, then run `ops/generate-docs.sh` to update.*",
  );
  sections.push("");

  return sections.join("\n");
}

function main() {
  const repoRoot = parseRepoRootArg(process.argv.slice(2));
  const { models, errors: loadErrors } = loadSkillModels(repoRoot);
  const docsErrors = validateDocsMetadata(models);
  const errors = [...loadErrors, ...docsErrors];

  if (errors.length > 0) {
    printErrorsAndExit(
      errors.map((error) => `missing required metadata: ${error}`),
    );
    return;
  }

  console.log("==> Auto-generating skill documentation...");
  console.log("");

  let generatedCount = 0;
  for (const model of models) {
    const readmePath = join(model.skillDir, "README.md");
    writeFileSync(readmePath, buildReadme(model), "utf8");
    generatedCount += 1;
    console.log(`[ok] Generated: ${model.name}/README.md`);
  }

  console.log("");
  console.log(`[info] Generated ${generatedCount} README files`);
}

main();
