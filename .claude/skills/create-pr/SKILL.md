---
name: create-pr
description: Open a pull request from the current branch to main for the synaxis repo. Use when the user says "create a PR", "open a PR", "ship this branch", or asks to put up changes for review. Handles push + upstream tracking, derives title/body from the branch's commits, matches this repo's title style, and refuses to target main from main.
---

# Create PR

Open a GitHub pull request from the current branch to `main`. Follow the steps in order — each guards against a different failure mode (pushing over someone else's work, opening a duplicate PR, targeting the wrong branch, sending a misleading title).

## Prerequisites

- `gh` CLI is authenticated (`gh auth status`). If not, tell the user to run `gh auth login` and stop.
- Working directory is inside this git repo. If not, stop.

## Steps

Run these in parallel as a single Bash batch to form a cold-start picture — they have no dependencies on each other:

- `git rev-parse --abbrev-ref HEAD` — current branch (must NOT be `main`)
- `git status --porcelain` — uncommitted changes
- `git log main..HEAD --oneline` — commits that will be in the PR
- `git diff main...HEAD --stat` — diffstat
- `git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "no upstream"` — whether the branch is pushed

Then:

1. **Refuse to target main from main.** If the current branch is `main` (or `master`), stop. Tell the user to check out a feature branch first.

2. **Handle uncommitted changes.** If `git status --porcelain` has output:
   - Ask the user: commit first (suggest invoking the `git-commit` agent), stash, or proceed with only what's already committed. Do not auto-commit — the user's in-progress work is not your decision.

3. **Handle "no commits ahead".** If `git log main..HEAD` is empty, stop and tell the user there's nothing to PR.

4. **Check for an existing open PR** for this branch: `gh pr list --head <branch> --state open --json number,url`. If one exists, stop and return its URL — do not open a duplicate.

5. **Push the branch** if needed.
   - If `@{u}` resolved: the branch already tracks a remote. Run `git push` (without `-u`) to bring remote up to date. **Never force-push** — if the remote has diverged, stop and ask the user how to reconcile.
   - If no upstream: `git push -u origin <branch>`.

6. **Derive the title.** Keep it under 70 characters, gerund-first sentence case, no Conventional Commits prefix, no ticket ID (this repo's convention; verify by reading `git log -n 10 --pretty=format:'%s'` if unsure).
   - One commit on the branch → use its subject (trim if >70 chars).
   - Multiple related commits → write one umbrella title that captures the shared theme.
   - Multiple unrelated commits → write the title as "Adding X, Y, and Z" or the numbered form used in commits: "1. X 2. Y 3. Z" (trim aggressively to fit).

7. **Derive the body.** Use this exact template:

   ```markdown
   ## Summary

   - <bullet per distinct change, 1-3 bullets preferred, 5 max>

   ## Test plan

   - [ ] <concrete check a reviewer or the author should do before merging>
   - [ ] <another>
   ```

   - **Summary bullets** describe what changed and why — derive from commit subjects + the diff. Not a diff dump; synthesize.
   - **Test plan bullets** are concrete verification steps tailored to *this* change: `npm run lint` / `npm run build`, pages to load, forms to submit, the login/logout flow to exercise. For Prisma/schema changes: the migration to apply (`npm run prisma:migrate`) and the query path to check. For tooling/harness changes (like `.claude/` config): the `/hooks` refresh, the scenario that exercises the hook.
   - Do **not** include the "🤖 Generated with Claude Code" footer — this repo's recent PRs don't use it.

8. **Create the PR** with a heredoc to preserve formatting:

   ```bash
   gh pr create --base main --head <branch> --title "<title>" --body "$(cat <<'EOF'
   ## Summary

   - …

   ## Test plan

   - [ ] …
   EOF
   )"
   ```

9. **Report back** the PR URL as the last line of your reply so the user can click through. Also note anything worth flagging: unusually large diffs, commits the user may not have intended to include, files that looked sensitive (`.env*`, credentials) that appear in the diff — none of those should have made it through `check-secrets.sh`, but if one did, call it out.

## Hard rules

- **Never** force-push or use `--force-with-lease` — if the remote has diverged, stop and ask.
- **Never** create a PR without commits ahead of main (no empty PRs).
- **Never** edit or close an existing PR as part of this skill — that's a different operation.
- **Never** run `gh pr merge` — creating the PR is the full scope. Merging is the user's call.
- **Never** pass `--draft` unless the user asks (this repo doesn't use draft PRs by default — verify from recent PRs if in doubt).
- If `gh pr create` fails (auth, branch protection, etc.), surface the raw error verbatim — don't paper over it.
