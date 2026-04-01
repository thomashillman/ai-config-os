/**
 * Contract: canonical PR body template keeps required headings (pr-description skill).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(
  __dirname,
  "..",
  "..",
  "..",
  "shared",
  "skills",
  "pr-description",
  "templates",
  "pr-body-default.md",
);

const REQUIRED_SUBSTRINGS = [
  "## Summary",
  "## Type",
  "## Pre-Push Checklist (Before Merging)",
  "### Portability Contract",
  "### Delivery Contract",
  "### Code Quality",
  "### Documentation",
  "### Security",
  "## Specific Changes",
  "## Questions for Reviewers",
  "**CI Status:**",
  "All platforms must pass before merging",
];

test("pr-body-default.md contains required section headings", () => {
  const text = readFileSync(TEMPLATE, "utf8");
  for (const s of REQUIRED_SUBSTRINGS) {
    assert.ok(text.includes(s), `template must include: ${JSON.stringify(s)}`);
  }
});
