# Lockfile Audit — Haiku (brief)

Quickly inventory missing lockfiles across the repo and flag deploy-breaking gaps.

## Input: $ARGUMENTS

Paste directory listing or provide context. If shell access is available:

```bash
find . -name "package.json" -not -path "*/node_modules/*" | while read f; do
  dir=$(dirname "$f")
  ls "$dir/package-lock.json" 2>/dev/null || echo "MISSING: $dir"
done
grep -r "npm ci" .github/workflows/ wrangler.toml Dockerfile* 2>/dev/null
```

## Output format

**MISSING LOCKFILES:**

```
[BLOCKING|WARNING] <directory>/ — no package-lock.json — referenced by: <config file>
```

**FIX** (for each BLOCKING):

```bash
cd <directory> && npm install --package-lock-only && git add package-lock.json
```

**SUMMARY:** N missing (BLOCKING: N, WARNING: N)

If all present: `All package.json files have a committed lockfile.`

Rules: file evidence only. BLOCKING requires confirmed `npm ci` reference in CI/deploy config.
