#!/usr/bin/env node
/**
 * migrate-capabilities.mjs
 * One-time migration script: adds capability contracts to all skill SKILL.md files.
 * This script is throwaway — delete after v0.5.2 migration is complete.
 */
import { readFileSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SKILLS_DIR = join(REPO_ROOT, "shared", "skills");

// Migration mapping — conservative: require only what's truly essential
const MIGRATION = {
  "session-start-hook": {
    capabilities: {
      required: ["fs.read", "shell.exec"],
      optional: [],
      fallback_mode: "none",
      fallback_notes: "",
    },
    platforms: {
      "claude-web": { mode: "excluded", notes: "No hook surface" },
      "claude-ios": { mode: "excluded", notes: "No hook surface" },
      cursor: { mode: "excluded", notes: "No hook surface" },
      codex: { mode: "excluded", notes: "No hook packaging in v0.5.2" },
    },
  },
  "web-search": {
    capabilities: {
      required: ["network.http"],
      optional: ["browser.fetch"],
      fallback_mode: "manual",
      fallback_notes:
        "Can analyse URLs or pasted results when network access is unavailable.",
    },
  },
  "commit-conventions": {
    capabilities: {
      required: [],
      optional: ["git.read"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can draft from pasted commit intent.",
    },
  },
  changelog: {
    capabilities: {
      required: ["git.read"],
      optional: ["fs.read"],
      fallback_mode: "manual",
      fallback_notes: "Can generate from pasted commit history.",
    },
    platforms: {
      "claude-ios": {
        mode: "degraded",
        notes: "Prompt-only from pasted history",
      },
    },
  },
  "code-review": {
    capabilities: {
      required: [],
      optional: ["fs.read", "git.read"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can review pasted code or diffs.",
    },
  },
  "context-budget": {
    capabilities: {
      required: [],
      optional: [],
      fallback_mode: "prompt-only",
      fallback_notes: "Pure guidance skill.",
    },
  },
  debug: {
    capabilities: {
      required: [],
      optional: ["fs.read", "shell.exec"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can debug from pasted symptoms and stack traces.",
    },
  },
  "explain-code": {
    capabilities: {
      required: [],
      optional: ["fs.read"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can explain pasted code.",
    },
  },
  "git-ops": {
    capabilities: {
      required: ["git.read"],
      optional: ["git.write", "fs.read", "shell.exec"],
      fallback_mode: "manual",
      fallback_notes: "Can advise steps from pasted repo state.",
    },
    platforms: {
      "claude-ios": {
        mode: "degraded",
        notes: "Prompt-only from pasted state",
      },
    },
  },
  "pr-description": {
    capabilities: {
      required: [],
      optional: ["git.read"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can draft from pasted diff summary.",
    },
  },
  principles: {
    capabilities: {
      required: [],
      optional: [],
      fallback_mode: "prompt-only",
      fallback_notes: "Pure guidance skill.",
    },
  },
  "plugin-setup": {
    capabilities: {
      required: [],
      optional: ["fs.read", "fs.write", "shell.exec"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can provide manual setup steps.",
    },
  },
  "release-checklist": {
    capabilities: {
      required: ["git.read", "shell.exec"],
      optional: ["git.write", "fs.read", "network.http"],
      fallback_mode: "manual",
      fallback_notes:
        "Can produce a manual release sequence when repo mutation is unavailable.",
    },
    platforms: {
      "claude-ios": {
        mode: "excluded",
        notes: "Requires git and shell access",
      },
    },
  },
  "skill-audit": {
    capabilities: {
      required: ["fs.read"],
      optional: [],
      fallback_mode: "manual",
      fallback_notes: "Can audit pasted frontmatter manually.",
    },
  },
  "task-decompose": {
    capabilities: {
      required: [],
      optional: [],
      fallback_mode: "prompt-only",
      fallback_notes: "Pure reasoning skill.",
    },
  },
  memory: {
    capabilities: {
      required: ["fs.read", "fs.write"],
      optional: [],
      fallback_mode: "manual",
      fallback_notes:
        "Can summarise memory for manual storage when persistence is unavailable.",
    },
    platforms: {
      "claude-ios": { mode: "excluded", notes: "No filesystem access" },
    },
  },
  "test-writer": {
    capabilities: {
      required: [],
      optional: ["fs.read"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can generate tests from pasted code.",
    },
  },
  "security-review": {
    capabilities: {
      required: [],
      optional: ["fs.read", "network.http"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can review pasted code or configs without live lookups.",
    },
  },
  refactor: {
    capabilities: {
      required: [],
      optional: ["fs.read", "fs.write"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can propose refactors or rewrite pasted code.",
    },
  },
  "review-pr": {
    capabilities: {
      required: [],
      optional: ["git.read", "fs.read"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can review pasted diffs.",
    },
  },
  "issue-triage": {
    capabilities: {
      required: [],
      optional: ["network.http"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can triage pasted issue text.",
    },
  },
  simplify: {
    capabilities: {
      required: [],
      optional: ["fs.read"],
      fallback_mode: "prompt-only",
      fallback_notes: "Can simplify pasted code.",
    },
  },
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

let modified = 0;
let skipped = 0;

for (const [skillName, migration] of Object.entries(MIGRATION)) {
  const skillFile = join(SKILLS_DIR, skillName, "SKILL.md");
  let content;
  try {
    content = readFileSync(skillFile, "utf8");
  } catch {
    console.error(`  [skip] ${skillName}: file not found`);
    skipped++;
    continue;
  }

  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    console.error(`  [skip] ${skillName}: no frontmatter found`);
    skipped++;
    continue;
  }

  const yamlStr = match[1];
  const frontmatter = yamlParse(yamlStr, { strict: false });

  // Add capabilities
  frontmatter.capabilities = migration.capabilities;

  // Add platforms if specified
  if (migration.platforms) {
    frontmatter.platforms = migration.platforms;
  }

  // Rebuild the YAML string
  const newYaml = yamlStringify(frontmatter, {
    lineWidth: 0,
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    singleQuote: false,
  }).trim();

  // Replace the frontmatter
  const newContent = content.replace(FRONTMATTER_RE, `---\n${newYaml}\n---`);
  writeFileSync(skillFile, newContent);
  console.log(`  [ok] ${skillName}`);
  modified++;
}

console.log(
  `\nMigrated: ${modified}  Skipped: ${skipped}  Total: ${Object.keys(MIGRATION).length}`,
);
