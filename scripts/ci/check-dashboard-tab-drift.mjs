#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

function normalizeLabel(label) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractTabsFromApp(appSource) {
  const tabsBlockMatch = appSource.match(
    /const\s+TABS\s*=\s*\[(?<tabsBlock>[\s\S]*?)\]\s*;?/,
  );
  if (!tabsBlockMatch?.groups?.tabsBlock) {
    throw new Error("Unable to find TABS array in dashboard/src/App.jsx.");
  }

  const labels = [];
  const labelRegex = /label\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = labelRegex.exec(tabsBlockMatch.groups.tabsBlock)) !== null) {
    labels.push(match[1]);
  }

  if (labels.length === 0) {
    throw new Error(
      "Found TABS array but no label entries in dashboard/src/App.jsx.",
    );
  }

  return labels;
}

function extractTabsFromSupportedToday(supportedTodaySource) {
  const rowMatch = supportedTodaySource.match(
    /\|\s*Dashboard tabs:\s*([^|]+)\|/,
  );
  if (!rowMatch) {
    throw new Error(
      'Unable to find "Dashboard tabs:" row in docs/SUPPORTED_TODAY.md.',
    );
  }

  const labels = rowMatch[1]
    .trim()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (labels.length === 0) {
    throw new Error("Dashboard tabs row in docs/SUPPORTED_TODAY.md is empty.");
  }

  return labels;
}

function extractTabsFromPlan(planSource) {
  const line = planSource
    .split("\n")
    .find((candidate) => candidate.includes("top-level tabs:"));

  if (!line) {
    throw new Error(
      "Unable to find runtime table top-level tab text in PLAN.md.",
    );
  }

  const tail = line.split("top-level tabs:")[1] ?? "";
  const listText = tail
    .split("(")[0]
    .replace(/\|\s*$/, "")
    .trim();

  const labels = listText
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (labels.length === 0) {
    throw new Error("PLAN.md top-level tab list is empty.");
  }

  return labels;
}

function formatList(labels) {
  return labels.join(", ");
}

function compareOrderedNormalizedSets(sourceName, appLabels, documentedLabels) {
  const normalizedApp = appLabels.map(normalizeLabel);
  const normalizedDocs = documentedLabels.map(normalizeLabel);
  const mismatch =
    normalizedApp.length !== normalizedDocs.length ||
    normalizedApp.some((label, index) => label !== normalizedDocs[index]);

  if (!mismatch) {
    return null;
  }

  return [
    `Dashboard tab parity failed for ${sourceName}.`,
    `  App tabs (${appLabels.length}): ${formatList(appLabels)}`,
    `  ${sourceName} tabs (${documentedLabels.length}): ${formatList(documentedLabels)}`,
    "  Keep labels and ordering identical to dashboard/src/App.jsx TABS.",
  ].join("\n");
}

function runDashboardTabDriftCheck({
  appSource,
  supportedTodaySource,
  planSource,
}) {
  const appLabels = extractTabsFromApp(appSource);
  const supportedTodayLabels =
    extractTabsFromSupportedToday(supportedTodaySource);
  const planLabels = extractTabsFromPlan(planSource);

  const errors = [
    compareOrderedNormalizedSets(
      "docs/SUPPORTED_TODAY.md",
      appLabels,
      supportedTodayLabels,
    ),
    compareOrderedNormalizedSets("PLAN.md", appLabels, planLabels),
  ].filter(Boolean);

  return {
    ok: errors.length === 0,
    appLabels,
    supportedTodayLabels,
    planLabels,
    errors,
  };
}

function runCli() {
  const appPath = resolve(REPO_ROOT, "dashboard", "src", "App.jsx");
  const supportedTodayPath = resolve(REPO_ROOT, "docs", "SUPPORTED_TODAY.md");
  const planPath = resolve(REPO_ROOT, "PLAN.md");

  const result = runDashboardTabDriftCheck({
    appSource: readFileSync(appPath, "utf8"),
    supportedTodaySource: readFileSync(supportedTodayPath, "utf8"),
    planSource: readFileSync(planPath, "utf8"),
  });

  if (!result.ok) {
    console.error(result.errors.join("\n\n"));
    process.exit(1);
  }

  console.log("Dashboard tab documentation parity check passed.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}

export {
  normalizeLabel,
  extractTabsFromApp,
  extractTabsFromSupportedToday,
  extractTabsFromPlan,
  compareOrderedNormalizedSets,
  runDashboardTabDriftCheck,
};
