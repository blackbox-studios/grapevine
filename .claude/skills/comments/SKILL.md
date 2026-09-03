---
name: comments
description: How to write and audit code comments in this repo — the why-not-what rule, the seven rules, and the pre-finish self-check. Load it BEFORE writing or editing any comment or doc-comment in src/ or prisma/, and again before finishing a change, to re-read the comments in your own diff as someone who never saw the conversation. Triggers on writing a new file, adding a function or component header, changing behaviour a nearby comment describes, deleting or renaming a symbol another comment mentions, or any request to audit, review, tidy or "check" comments.
---

# Comments

Comments carry the *why*; the code already states the what.

**The default is no comment.** Most changes need none, and a comment is something the change has to earn — it is another line to keep true, and a repo of them compounds into prose nobody trusts. A comment is not a receipt for the work; write one only where the next person would otherwise break something.

**This is a separate skill because knowing the rules is not what enforces them.** The reasoning is fresh while you write, so the prose that records it always reads as necessary — and the rules that get broken are broken *at the end of a long change*, when the file being edited has a history in your head that it does not have in the repo. Load this when you start writing comments, and again before you finish.

---

## The seven rules

The first three are the ones that get broken.

1. **Document the decision, not the journey.** When a change reverses an earlier one, **replace** the comment that explained the old approach — never append the new reasoning underneath it. A block that records every direction the code was taken in is unreadable, and a reader cannot tell which paragraph is still true. Only the final decision belongs in the file; the history belongs in git.

2. **Never comment on where code *isn't*.** "This lives in X, not here", "moved to Y", "deliberately not in this file" — that is the journey wearing a signpost, and it is a pointer that goes stale the moment the other file moves again. State what the code in front of you does and why.

   The corollary: **if an edit leaves a file's code unchanged, its comments come out unchanged too.** Touching only the prose of a file you didn't otherwise modify is the tell that you are narrating a decision rather than documenting one. (The one exception is rule 7 — a comment left naming a symbol you just deleted is broken, and fixing it is required, not narration.)

3. **Scale the comment to the change, not to the effort of finding it.** A one-token fix — a class swapped, an `!` added, a prop renamed — gets **nothing**. A change that took an hour to diagnose is still a small change; the diagnosis is not what the reader needs, and usually neither is the constraint. If the note explains its own mechanics (which selector wins, how specificity resolved, what you tried first), cut it. Never explain the same fix in two places.

   The worked example, because this is the rule that gets broken while feeling most justified: adding `py-1` to a clipped box and `-my-1` to its parent, to stop an `overflow-hidden` shearing a focus ring, got a five-line block explaining the ring, the clip box and the measurement. It warranted **no comment**. Two Tailwind classes are readable, the next person deleting them sees the ring get cut and puts them back in a minute, and the block cost more to read forever than the bug ever cost once. Ask what the comment *saves* the reader — if the answer is a minute, it is a net loss.

4. **Length is earned.** One or two lines is the default. Spend a paragraph only where the next person would otherwise undo the decision — a platform quirk, an ordering that looks arbitrary and isn't, a constraint enforced somewhere else. Never on restating a signature.

5. **Say it once.** If the header of a function or file already establishes a constraint, a line inside it refers to that constraint rather than re-arguing it.

6. **A shared piece argues for itself, once, where it lives.** Extract a component or a helper and the *why* belongs in its header; the call sites say only what is local to them — which screen this is, what it is titled, what it is passed. A call site that restates the abstraction's own rules drifts from them the first time they change, and doubles what has to be edited when they do.

7. **Delete what the code outgrew, in the same edit.** A stale comment is worse than no comment, because it is trusted. This includes a comment that still names a symbol, file or component the change removed or renamed.

---

## Before you finish

**Re-read the comments in your diff as someone who never saw this conversation.** Six tells, each a rewrite rather than a judgement call:

- **Past tense about the code itself** — "used to", "now", "no longer", "previously", "briefly", "replaced", "turned out", "was the first of its kind", "rather than the dialog it was". You are narrating the diff.
- **Any comment over a hunk that changed one class or one prop.** Delete it. Not "cut it to a line" — delete it.
- **The same reason given in two files.** Keep it where the behaviour lives; delete the other.
- **A file whose only change is prose.** Revert it — unless it is rule 7, a stale reference you are repairing.
- **A comment naming something that no longer exists.** Grep the symbols your change deleted or renamed; a header pointing at a component you just removed is a lie the next reader will trust.
- **A sentence you can only understand because you were here.** "The last move was the right one", "this was wrong first time round" — the reader has no diff and no conversation.

### Running the audit

Two greps and one script catch most of it. **Diff against `HEAD`, never `--cached`** — staging to make a diff readable is forbidden here (it hides in-flight manual edits), and `HEAD` sees the whole change whatever the index happens to hold.

```bash
# Journey narration in added comment lines
git diff HEAD -U0 -- 'src' 'prisma' \
  | grep '^+' | grep -v '^+++' \
  | grep -E '(^\+\s*\*|^\+\s*/\*|^\+\s*\{/\*|^\+\s*//)' \
  | grep -inE "used to|previously|formerly|briefly|turned out|had been|it was wrong|went from"

# Symbols and routes the change deleted or moved, still named somewhere
grep -rn "OldComponent\|oldHelper\|old/route" src/ .claude/ CLAUDE.md
```

```bash
# Files whose diff is prose only (code-line count of 0)
for f in $(git diff HEAD --name-only -- 'src'); do
  n=$(git diff HEAD -U0 -- "$f" | grep -E '^[+-]' | grep -v '^[+-][+-][+-]' \
      | grep -vE '^[+-]\s*(\*|/\*|\{/\*|//|\*/)' | grep -vE '^[+-]\s*$' | wc -l | tr -d ' ')
  [ "$n" = "0" ] && echo "prose only: $f"
done
```

**The first grep has one standing false positive**: prose about *runtime* behaviour that happens to read as past tense — "so the next open starts clean rather than flashing the previously-viewed person" describes what the code would do, not what it used to be. Judge each hit by whether a reader with no diff could follow it.

**The second grep is the one worth widening.** Moving a route is the same defect as deleting a symbol, and it is easier to miss: after `settings/users` became `group/users`, four separate files still described a roster that had left their tree — a layout sizing itself for a table it no longer contains, a nav trigger naming a dead path, and two page headers positioning themselves against a neighbour that had moved. Grep the *old* path, not just the old component name.

Long blocks are worth a look but are not automatically wrong — a file header carrying a domain decision earns its length; a function header restating its own signature does not.

---

## What good looks like here

This repo's comments are unusually discursive, and that is deliberate: several decisions (the two build targets, the membership scoping, the keyset cursors, the comment ranking) are ones a reasonable person would undo without the argument in front of them. That licence is for **constraints**, not for narrative.

- **A file header** states what the module is and the one or two decisions that carry it.
- **A function header** states the contract and anything about it that looks arbitrary and isn't.
- **An inline comment** marks a line whose reason is invisible — a guard against a platform quirk, an ordering that matters, a value that has to agree with something elsewhere.

Write in the present tense, about the code as it stands. If a sentence only makes sense as a reply to something that used to be there, it belongs in the commit message.
