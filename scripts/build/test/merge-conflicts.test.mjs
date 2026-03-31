import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, lstat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { extname } from "node:path";

const CONFLICT_MARKERS = ["<" + "<<<<<< ", "=".repeat(7), ">" + ">>>>>> "];

// Extensions that cannot contain text conflict markers — skip to avoid UTF-8 decode noise.
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".bin",
  ".db",
  ".sqlite",
  ".dat",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
]);

test("repository contains no unresolved merge conflict markers in tracked files", async () => {
  const list = spawnSync("git", ["ls-files"], { encoding: "utf8" });
  assert.equal(
    list.status,
    0,
    `git ls-files failed: ${list.stderr || "unknown error"}`,
  );

  const files = list.stdout
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !BINARY_EXTENSIONS.has(extname(f).toLowerCase()));

  // Read all files in parallel for performance.
  const results = await Promise.all(
    files.map(async (file) => {
      const stat = await lstat(file).catch(() => null);
      if (!stat || !stat.isFile()) return null;

      const contents = await readFile(file, "utf8").catch(() => null);
      if (contents === null) return null;

      const lines = contents.split("\n");
      const hits = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const marker of CONFLICT_MARKERS) {
          if (line.includes(marker)) {
            hits.push(`  ${file}:${i + 1}  ${line.trim()}`);
            break;
          }
        }
      }
      return hits.length > 0 ? hits : null;
    }),
  );

  const offenders = results.flatMap((r) => r ?? []);

  assert.deepEqual(
    offenders,
    [],
    `Unresolved merge conflict markers found:\n${offenders.join("\n")}`,
  );
});

test("git index contains no unmerged paths", () => {
  const unmerged = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=U"],
    { encoding: "utf8" },
  );
  assert.equal(
    unmerged.status,
    0,
    `git diff --diff-filter=U failed: ${unmerged.stderr || "unknown error"}`,
  );

  const files = unmerged.stdout
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);

  assert.deepEqual(
    files,
    [],
    `Unmerged paths found in git index: ${files.join(", ")}`,
  );
});
