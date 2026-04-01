# Sonnet variant: Merge conflict resolution

Follow the skill body in `SKILL.md` in order:

1. **Conflicts** — List unmerged paths; remove markers; stage.
2. **Conclude** — If `MERGE_HEAD` exists, finish with `git commit` or `git merge --continue` / `git rebase --continue`; do not stop at empty diff.
3. **Bulk side picks** — If `--ours`/`--theirs` was used widely, diff `origin/main` (from merge-base) on touched paths and flag missing upstream changes.
4. **Verify** — Run project test/validate commands.

Be explicit when the merge is still open despite a clean working tree.
