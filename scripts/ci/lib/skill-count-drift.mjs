import { readdirSync, readFileSync } from "fs";
import path from "path";

export const CANONICAL_PHRASE =
  "Installable skill count: <number> (source: shared/skills/*/SKILL.md; excluding _template).";

const DECLARATION_PATTERNS = [
  /Installable skill count:\s*(\d+)\s*\(source:\s*shared\/skills\/\*\/SKILL\.md;\s*excluding\s*_template\)\./g,
  /^###\s+Skills\s+\((\d+)\s+installable total from `shared\/skills\/\*\/SKILL\.md`, excluding `_template`\)/gm,
];
const MALFORMED_PHRASE_PATTERN = /^Installable skill count\s*:/m;

export function countInstallableSkills(skillsRoot) {
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== "_template")
    .filter((name) => {
      const skillPath = path.join(skillsRoot, name, "SKILL.md");
      try {
        readFileSync(skillPath, "utf8");
        return true;
      } catch (error) {
        throw new Error(`Missing or unreadable skill file: ${skillPath}`, {
          cause: error,
        });
      }
    }).length;
}

export function parseDeclaredCounts(docPath, content) {
  const matches = DECLARATION_PATTERNS.flatMap((pattern) =>
    [...content.matchAll(pattern)].map((match) => ({
      value: Number.parseInt(match[1], 10),
      index: match.index ?? 0,
      raw: match[0],
    })),
  );

  const hasMalformedPhrase =
    MALFORMED_PHRASE_PATTERN.test(content) && matches.length === 0;

  return {
    docPath,
    matches,
    hasMalformedPhrase,
  };
}

export function compareSkillCounts(actualCount, declarations) {
  const errors = [];

  for (const declaration of declarations) {
    if (declaration.hasMalformedPhrase) {
      errors.push(
        `${declaration.docPath}: found \"Installable skill count:\" but no valid declaration. ` +
          `Expected format: \"${CANONICAL_PHRASE}\"`,
      );
      continue;
    }

    if (declaration.matches.length === 0) {
      continue;
    }

    if (declaration.matches.length > 1) {
      const values = declaration.matches.map((match) => match.value).join(", ");
      errors.push(
        `${declaration.docPath}: multiple canonical declarations found (${values}). Keep exactly one declaration per document.`,
      );
      continue;
    }

    const [match] = declaration.matches;
    if (match.value !== actualCount) {
      errors.push(
        `${declaration.docPath}: declared ${match.value}, actual ${actualCount}. ` +
          `Update declaration to: Installable skill count: ${actualCount} ` +
          "(source: shared/skills/*/SKILL.md; excluding _template).",
      );
    }
  }

  return { errors };
}
