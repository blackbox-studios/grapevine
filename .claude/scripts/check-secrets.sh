#!/usr/bin/env bash
# Pre-commit secrets scan for scrolls.
# Invoked as a PreToolUse hook on `Bash(git commit*)` — exit 0 to allow,
# emit PreToolUse JSON with permissionDecision=deny to block.
#
# Also usable standalone: `.claude/scripts/check-secrets.sh` prints any finding
# and exits 1 when secrets are detected, 0 when clean.

set -u

repo_root=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repo_root" || exit 0

# Filenames that should never be staged.
BANNED_NAMES='(^|/)(\.env(\.[^.]+)?|[^/]*\.pem|[^/]*\.key|[^/]*credentials[^/]*\.json|[^/]*service[-_.]?account[^/]*\.json)$'
EXEMPT_NAMES='(^|/)\.env\.example$'

# Secret patterns — chosen for low false-positive rate.
SECRET_PATTERNS='AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|sk_live_[0-9A-Za-z]{24,}|AIza[0-9A-Za-z_-]{35}'

staged_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
[ -z "$staged_files" ] && exit 0

blocked_files=$(printf '%s\n' "$staged_files" | grep -E "$BANNED_NAMES" | grep -vE "$EXEMPT_NAMES" || true)

# Scan added/changed lines only (not whole file content).
added_lines=$(git diff --cached --diff-filter=ACM -U0 2>/dev/null | grep -E '^\+[^+]' || true)
matched_secrets=$(printf '%s\n' "$added_lines" | grep -oE "$SECRET_PATTERNS" | sort -u | head -5 || true)

if [ -z "$blocked_files" ] && [ -z "$matched_secrets" ]; then
  exit 0
fi

reason="Commit blocked: potential secrets detected."
if [ -n "$blocked_files" ]; then
  reason="$reason Sensitive file(s) staged: $(printf '%s' "$blocked_files" | tr '\n' ' ')."
fi
if [ -n "$matched_secrets" ]; then
  reason="$reason Secret pattern match(es): $(printf '%s' "$matched_secrets" | tr '\n' ' ')."
fi
reason="$reason Unstage with 'git restore --staged <file>' and remove the secret before retrying. If this is a false positive, commit from the terminal or update .claude/scripts/check-secrets.sh."

# If jq is available, emit the structured deny decision Claude Code expects.
# Otherwise exit 1 — the bash call will fail and Claude will see the stderr.
if command -v jq >/dev/null 2>&1; then
  jq -n --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
else
  printf '%s\n' "$reason" >&2
  exit 1
fi
