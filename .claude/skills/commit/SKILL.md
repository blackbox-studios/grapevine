---
name: commit
description: Create a git commit for the current staged and/or unstaged changes in the scrolls repo. Use when the user says "commit", "make a commit", "commit these changes", or "commit and push". Runs the standard status/diff/log inspection, drafts a message that matches this repo's gerund-first style, stages files by explicit path, refuses to commit secrets, and uses the Co-Authored-By trailer. Never invokes destructive operations or bypasses hooks.
---

# Commit

Create a git commit that matches this repo's conventions. Same rules as the `git-commit` agent — this is the inline version for when you're already mid-flow in the main conversation and don't want the subagent spawn overhead.

## Workflow

Run these in parallel as a single Bash batch:

- `git status` (never `-uall`)
- `git diff` (unstaged)
- `git diff --cached` (staged)
- `git log -n 10 --pretty=format:'%h %s'` (match prevailing style)

Then:

1. **Draft the message.** Analyze every change that will be committed (previously staged + anything about to be staged). Summarize *intent*, not the literal diff. Pick the verb:
   - New feature → "Adding …"
   - Change to existing feature → "Updating …" or a gerund describing the change
   - Bug fix → "Fixing …" / "Fixes …"
   - Cleanup / refactor → "Cleaning up …" / "Refactoring …"
   - Multiple unrelated changes in one commit → numbered list matching recent repo style: `1. … 2. … 3. …`

2. **Style (from recent `git log`):**
   - Subject: short, gerund-first, sentence case, **no trailing period**.
   - No Conventional Commits prefixes (`feat:`, `fix:`). This repo doesn't use them.
   - No ticket IDs unless the user supplies one.
   - Body optional — add only when the "why" isn't obvious from the subject.

3. **Stage files explicitly.** Add by path. **Never** `git add -A` or `git add .` — they sweep in `.env`, credentials, and stray local files. If an unexpected file appears in `git status`, ask the user before including it.

4. **Refuse to commit secrets.** If the staged set touches `.env`, `.env.*`, `*.pem`, `*.key`, `*credentials*`, service-account JSON, private keys, or high-entropy tokens (AWS `AKIA…`, GitHub `gh[pousr]_…`, Slack `xox[baprs]-…`, Stripe `sk_live_…`, Google `AIza…`), stop and warn. Only proceed on explicit user confirmation. The `PreToolUse` hook at `.claude/scripts/check-secrets.sh` is a backstop — if it denies the commit, read the reason and fix the underlying issue, do not route around it.

5. **Create the commit.** Pass the message via a HEREDOC (plain quotes break on newlines/punctuation). End with the Co-Authored-By trailer exactly as shown:

   ```bash
   git commit -m "$(cat <<'EOF'
   <subject line>

   <optional body>

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```

6. **Verify.** After the commit, run `git status` to confirm the working tree matches expectation.

## Project-specific checks

- This is a single npm package rooted at the repo top level — there is no separate backend/frontend split.
- If the diff touches `prisma/schema.prisma`, confirm a matching migration under `prisma/migrations/` was generated (`npm run prisma:migrate`) when the schema change needs one.
- If the diff includes `.next/`, `dist/`, or `node_modules/`, stop and ask — these are gitignored build output and shouldn't be committed.
- Never commit `.env`, `.env.local`, or `.env.*.local` — only `.env.example` is tracked.

## Hard rules

- **Never** skip hooks (`--no-verify`, `--no-gpg-sign`). If a pre-commit or commit-msg hook fails, the commit did not happen — fix the underlying issue in the code, re-stage, create a **new** commit. Do not `--amend` — amend rewrites the previous commit and can destroy earlier work.
- **Never** `git push` unless the user explicitly asks.
- **Never** modify `git config`.
- **Never** run destructive git commands (`reset --hard`, `checkout .`, `clean -fd`, `branch -D`, force-push) unless the user explicitly requests them.
- **Never** create empty commits. If nothing is staged and nothing to add, tell the user and stop.
- **Never** use interactive git flags (`-i`) — they hang.
- Do not amend unless the user says "amend".

## Reporting

After the commit, 1–2 lines: short SHA, subject, and anything worth knowing (e.g. "hook reformatted 3 files, included in commit"; "2 untracked files were NOT included: X, Y"). Do not paste the full diff back.

## When to use the `git-commit` agent instead

Delegate to the agent via the `Agent` tool when:
- The commit is complex enough to warrant protecting the main context from the inspection output (large diff, many files).
- You want to run commit creation concurrently with other work.

Otherwise use this skill — it's lighter and keeps the reasoning visible in the main transcript.
