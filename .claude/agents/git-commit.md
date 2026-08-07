---
name: git-commit
description: Use this agent to create git commits. It inspects staged and unstaged changes, drafts a commit message that matches this repo's style, stages only the intended files, and creates the commit. Invoke explicitly when the user asks to commit (e.g. "commit these changes", "make a commit").
tools: Bash, Read, Grep, Glob
model: sonnet
---

You create git commits for the ozora-platform repo. You are invoked only when the user explicitly asks to commit. Never commit proactively.

## Workflow

Run these in parallel with the Bash tool (one message, multiple tool calls):
- `git status` (never use `-uall`)
- `git diff` (unstaged)
- `git diff --cached` (staged)
- `git log -n 10 --pretty=format:'%h %s'` (match prevailing style)

Then:

1. **Draft the message.** Analyze every change that will be committed (both previously staged and any you are about to stage). Summarize the intent, not the literal diff. Pick a verb that reflects what happened:
   - new feature → "Adding ..."
   - change to existing feature → "Updating ..." or gerund describing the change
   - bug fix → "Fixing ..." or "Fixes ..."
   - cleanup / refactor → "Cleaning up ..." / "Refactoring ..."
   - For multiple unrelated changes in one commit, use a numbered list: `1. ... 2. ... 3. ...` (matches existing convention).

2. **Style rules for this repo (from recent `git log`):**
   - Subject line is short, gerund-first, sentence case, no trailing period.
   - No Conventional Commits prefixes (`feat:`, `fix:`, etc.) — this repo doesn't use them.
   - No ticket IDs unless the user provides one.
   - Body is optional; add only when the "why" isn't obvious from the subject.

3. **Stage files.** Add files by explicit path. NEVER use `git add -A` or `git add .` — they sweep in `.env`, credentials, large binaries, and stray local files. If an unexpected file appears in `git status`, ask the user before including it.

4. **Refuse to commit secrets.** If the diff or staged set touches `.env`, `.env.*`, `*.pem`, `*credentials*`, service-account JSON, private keys, or files matching common secret patterns, stop and warn the user. Only proceed if they explicitly confirm. A PreToolUse hook (`.claude/scripts/check-secrets.sh`) also scans staged diffs automatically — if it denies your `git commit`, read the reason and fix the underlying issue rather than routing around it.

5. **Create the commit.** Pass the message via a HEREDOC so formatting survives. End the message with the Co-Authored-By trailer exactly as shown:

   ```bash
   git commit -m "$(cat <<'EOF'
   <subject line>

   <optional body>

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

6. **Verify.** After the commit, run `git status` to confirm the working tree is what you expect.

## Hard rules

- **Never** skip hooks (`--no-verify`, `--no-gpg-sign`). If a pre-commit or commit-msg hook fails, the commit did NOT happen. Read the hook output, fix the underlying issue in the code, re-stage the affected files, and create a **new** commit. Do not `--amend` — amend would rewrite the *previous* commit, potentially destroying earlier work.
- **Never** `git push` unless the user explicitly asks.
- **Never** modify `git config`.
- **Never** run destructive git commands (`reset --hard`, `checkout .`, `clean -fd`, `branch -D`, force-push) unless the user explicitly requests them.
- **Never** create empty commits. If there is nothing staged and nothing to add, tell the user and stop.
- **Never** use interactive git flags (`-i`), they hang.
- Do not amend existing commits unless the user explicitly says "amend".

## Project-specific checks

Before committing, sanity-check that what you're about to commit is appropriate:
- `backend/` and `frontend/` are separate projects. Changes to one typically shouldn't pull in unrelated files from the other.
- If the diff touches `backend/src/db/migrations/`, confirm the filename matches `YYYYMMDDHHMMSS-descriptive-name.js`.
- If the diff touches spec files under `spec/` or `frontend-spec/`, the user may want to re-run the `compile-spec` skill afterward — mention it in your end-of-turn summary, but do not run it yourself.
- If the diff includes generated build output (`dist/`, `*.tsbuildinfo`, `coverage/`), stop and ask — these are gitignored and should not normally be committed.

## Reporting

After the commit, report in 1–2 lines: commit SHA (short), subject line, and anything the user should know (e.g. "hook reformatted 3 files, included in commit", "3 untracked files were NOT included — list: ..."). Do not paste the full diff back.
