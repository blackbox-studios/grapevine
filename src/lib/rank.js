/* How a comment thread is ordered.
 *
 * One number per comment, stored on the row as `Comment.score`, and the thread is that
 * number descending. Everything below is about why it is a stored number rather than a
 * sort expression, and why the number is shaped the way it is.
 *
 * ── The three signals ───────────────────────────────────────────────────────
 *
 * **Recency**, because a parish feed is read in passing and the thread under an
 * announcement is mostly people answering it. **Likes**, because agreement is the only
 * quality signal this app collects. And **the post's author**, because a priest replying
 * under his own announcement is the one comment everyone opening the thread came for —
 * both Instagram and YouTube boost creator participation, and it is the signal most worth
 * having here, where "the creator" is the person who actually knows the answer.
 *
 * The viewer's *own* comments are not in the formula. They are pinned above the ranked
 * body by `listComments`, which is a stronger guarantee than any weight could be, and it
 * is also what keeps this score viewer-independent — see the note on Instagram below.
 *
 * ── Why the score can be stored, which is the whole trick ───────────────────
 *
 * A decay function is the obvious way to write "newer wins": divide by age, as Hacker
 * News does with `(votes - 1) / (age + 2)^1.8`. It cannot be a column, because age changes
 * every second, so every row's score would be stale the moment it was written and the
 * thread would have to be sorted in memory — which means loading every comment on the post
 * before you can serve eight of them, and no keyset pagination at all.
 *
 * Reddit's `hot` sidesteps this and that is what is borrowed here: score the *absolute*
 * timestamp, not the age. `log10(votes) + seconds/45000` grows with time, but every row
 * grows by exactly the same amount, so the *ordering* between two rows never changes as
 * time passes. Freshness then costs nothing to maintain: a comment written now simply
 * starts higher than one written yesterday, permanently, and the like term is what lets
 * yesterday's comment climb back over it.
 *
 * So the score changes only when a like lands, which is a write we are already inside — the
 * same argument that makes `likeCount` a column. It is indexable, `(post_id, score DESC,
 * id DESC)` is an index range scan, and the keyset cursor pages on `(score, id)`.
 *
 * ── Why not Reddit's `best`, which is the one built for comments ─────────────
 *
 * Reddit ranks comments by the lower bound of the Wilson score interval — the confidence
 * sort, which asks "given these votes, what upvote *rate* is this comment 80% sure of",
 * so ten likes and one dislike can outrank forty and twenty. It needs a denominator.
 * Grapevine has likes and no dislikes, so every comment's observed rate is 1.0 and Wilson
 * collapses into a monotone function of the like count — the interval arithmetic buys
 * nothing that `log2` does not. If a downvote is ever added, this is the module to revisit,
 * and that is the algorithm to revisit it with.
 *
 * ── Why not Instagram's, which is the one that was asked about ──────────────
 *
 * Meta's is a set of learned models scoring each comment *per viewer*: how often you
 * interact with the commenter, how likely you are to reply, how likely you are to report
 * it. Two people open the same post and see different orders. That is a ranking service
 * with a feature store behind it, and it is unbuildable as a column — a per-viewer score
 * cannot be stored on the comment. It is also the wrong target: personalized comment
 * ordering earns its keep on a thread of forty thousand strangers, and a parish thread has
 * eleven people in it who all know each other. What that system does that *is* worth
 * copying is the part that needs no model at all, and it is copied: your own comments go
 * on top.
 *
 * ── Reading the numbers ─────────────────────────────────────────────────────
 *
 * The unit is **hours**, which makes every weight a sentence about time:
 *
 *     score = hours since the epoch
 *           + LIKE_DOUBLING_HOURS x log2(1 + likes)
 *           + POST_AUTHOR_HOURS   if the post's author wrote it
 *
 * At the defaults, one like is worth six hours of freshness, three likes twelve, seven
 * likes eighteen, fifteen likes twenty-four — each *doubling* buys another six, so a
 * well-liked comment holds the top of a quiet thread for about a day while a hundred-like
 * comment gets forty hours rather than six hundred. Diminishing returns are the point: a
 * thread whose top comment is permanent is a thread nobody adds to. The post author's reply
 * enters as though it already had three likes.
 *
 * Tuning is those two constants. **Changing them does not re-order anything on its own** —
 * existing rows keep the score they were written with, so a re-tune has to be followed by
 * `npm run comments:rescore`, which recomputes every row through this function. */

/* Tuning knobs. See "Reading the numbers" above before changing either, and rescore after. */
export const COMMENT_RANK = {
    /* Hours of freshness a *doubling* of (likes + 1) is worth. */
    LIKE_DOUBLING_HOURS: 6,

    /* Hours granted to the post author's own comment — the priest answering the question
     * under his announcement. Equivalent to three likes at the default weight, so it lifts
     * his reply out of a day's chatter without outranking a comment the parish actually
     * gathered behind. Resolved from `Post.authorId`, which never changes, and deliberately
     * not from ADMIN membership, which does: a role revoked tomorrow would leave every score
     * that had been written under it wrong, and this column has no way to hear about it. */
    POST_AUTHOR_HOURS: 12,

    /* The origin the time term is measured from. Purely cosmetic — it shifts every score by
     * the same constant, so it cannot affect an ordering — and it exists so a score reads as
     * "5,700 hours into the project" in Prisma Studio instead of as 496,000.
     *
     * **It must never change once a row exists.** Moving it re-bases only the rows written
     * afterwards, and a thread half-scored from each origin is sorted by which half a comment
     * landed in. If it ever has to move, rescore in the same commit. */
    EPOCH_MS: Date.UTC(2026, 0, 1),
}

const HOUR_MS = 3_600_000

/* Where a comment sits in its thread. Higher is nearer the top.
 *
 * Pure, and pure on purpose: this same function is called by `addComment`, by the like
 * toggle, by the dev seed, and by the rescore script, so all four agree by construction.
 * The migration that introduced the column is the one place the formula is also written in
 * SQL, because a backfill has to run inside the migration — and that copy is frozen there
 * as history, not maintained.
 *
 * `byPostAuthor` is passed rather than derived, because the comparison needs the post and
 * this module is given the comment.
 *
 * Rounded to six decimals — about four milliseconds of resolution in hours. Two comments
 * written inside the same tick therefore *can* tie, which is exactly what `id` is the
 * tiebreaker for in the cursor. */
export const commentScore = ({ createdAt, likeCount = 0, byPostAuthor = false }) => {
    const at = createdAt instanceof Date ? createdAt : new Date(createdAt)
    const hours = (at.getTime() - COMMENT_RANK.EPOCH_MS) / HOUR_MS

    const score =
        hours +
        COMMENT_RANK.LIKE_DOUBLING_HOURS * Math.log2(1 + Math.max(0, likeCount)) +
        (byPostAuthor ? COMMENT_RANK.POST_AUTHOR_HOURS : 0)

    return Number(score.toFixed(6))
}
