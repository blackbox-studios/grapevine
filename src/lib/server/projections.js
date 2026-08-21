import "server-only"

/* Database rows → wire shapes.
 *
 * This file is the boundary between the schema and the API contract, and keeping it
 * explicit is deliberate: a Prisma model handed straight to `Response.json` would publish
 * every column ever added to it, including the ones added later by someone who never
 * looked at this file. Everything the client receives is listed here, by hand.
 *
 * It also absorbs the differences between the two, so neither has to bend to the other:
 * `likeCount`/`commentCount` are storage names but the client has always read
 * `likes`/`comments`; media is normalized rows in the database but the feed card wants
 * `image` + `width`/`height`, or `images`, or `document`. Renaming a column is a change
 * here and nowhere else. */

/* Bytes → the short string the document card renders. Formatted at the edge rather than
 * stored, so the underlying number stays sortable and re-formattable. */
const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes < 0) return null
    if (bytes < 1024) return `${bytes} B`
    const units = ["KB", "MB", "GB"]
    let value = bytes / 1024
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/* A document's short type label ("pdf", "docx"), from the filename then the MIME type. */
const documentType = (media) => {
    const fromName = media.fileName?.split(".").pop()?.toLowerCase()
    if (fromName && fromName !== media.fileName?.toLowerCase()) return fromName
    return media.mimeType?.split("/").pop()?.toLowerCase() ?? "file"
}

/* The author block every post and comment carries.
 *
 * **The name is sent in parts, never as a composed string.** `firstName`, `lastName` and
 * `vocation` go over the wire and `displayName()` in `lib/name.js` assembles them on the
 * client. That is not indirection for its own sake: the same author is written two ways
 * depending on where they appear — "Dn. Paul" in a byline, "Paul Ivanov" in a roster that
 * sorts by surname — and a server that picked one would make the other impossible without a
 * second endpoint. Sending the parts lets each surface ask for the form it needs.
 *
 * `verified` is the blue check, and it is **computed, not stored**: it means "this person
 * administers the organization this post belongs to". `orgId` is therefore required to
 * answer it, and the caller must pass the org the content lives in — which is why this
 * takes it explicitly rather than reading it off the profile. Omitting it yields `false`,
 * the safe answer: a missing org can never manufacture a check.
 *
 * The membership rows come from `postInclude`/`commentInclude`, already filtered to the
 * author's APPROVED ADMIN memberships, so this is a scan of a handful of ids rather than a
 * query per card. */
export const projectAuthor = (profile, orgId = null) => ({
    handle: profile.handle,
    firstName: profile.firstName,
    lastName: profile.lastName,
    vocation: profile.vocation,
    avatar: profile.avatarUrl,
    verified: Boolean(
        orgId && profile.memberships?.some((membership) => membership.orgId === orgId),
    ),
})

/* Media rows → the three shapes the feed card understands. A post has exactly one of
 * these, or none at all (a text-only announcement):
 *
 *   image + width + height   one photo; the dimensions let the card reserve the correct
 *                            aspect-ratio box before the image decodes, without which it
 *                            collapses to zero height on a cold cache and shifts the
 *                            layout as it loads
 *   images                   several photos, as the swipeable carousel
 *   document                 a file attachment
 */
const projectMedia = (media = []) => {
    const images = media.filter((item) => item.kind === "IMAGE")
    const document = media.find((item) => item.kind === "DOCUMENT")

    return {
        ...(images.length === 1
            ? {
                  image: images[0].url,
                  width: images[0].width,
                  height: images[0].height,
              }
            : {}),
        ...(images.length > 1 ? { images: images.map((item) => item.url) } : {}),
        ...(document
            ? {
                  document: {
                      name: document.fileName ?? "Attachment",
                      size: formatBytes(document.sizeBytes) ?? "",
                      type: documentType(document),
                      url: document.url,
                  },
              }
            : {}),
    }
}

/* A post, as the feed card and the detail surface read it.
 *
 * `liked` is per-viewer, so it cannot come off the row — the caller resolves it and passes
 * it in. `likedBy` is the social-proof person ("Mat. Carly and 17 others"), likewise
 * resolved by the caller because it is a different person for every viewer. Both default
 * to the unauthenticated-ish answer if omitted, which keeps a partial projection safe
 * rather than accidentally claiming the viewer liked something.
 *
 * `likedBy` is the name *parts*, not a rendered string, for the same reason the author
 * block is — the card writes it with `displayName()` so the person who liked a post is
 * addressed exactly as they are in their own byline.
 *
 * The owning organization goes over as both `orgId` and `orgName` because the two answer
 * different questions and only one of them is a label. `orgName` is what the card prints;
 * `orgId` is what a surface resolves the viewer's role against, which matters because a
 * post can belong to a group other than the one currently selected — a shared link opens
 * by id, so the detail surface has to ask "am I an admin *here*" rather than assume the
 * switcher's answer. */
export const projectPost = (post, { liked = false, likedBy = null } = {}) => ({
    id: post.id,
    author: projectAuthor(post.author, post.orgId),
    orgId: post.orgId,
    orgName: post.org?.name ?? null,
    createdAt: post.createdAt.toISOString(),
    title: post.title,
    body: post.body,
    ...projectMedia(post.media),
    likes: post.likeCount,
    comments: post.commentCount,
    liked,
    likedBy,
})

/* A comment in an open thread. `text`, not `body` — the client has always called it that,
 * and the rename belongs here rather than in every component that renders one.
 *
 * `orgId` is the organization of the *post* the comment hangs under, which is what decides
 * whether its author wears the admin check. A comment has no organization of its own, so
 * the caller — which had to load the post to authorize the read anyway — passes it down.
 *
 * `canDelete` composes two separate rules — anyone may remove their own comment, and an
 * admin may remove anyone's in the group they administer — into the one boolean the row
 * needs to decide whether to offer the affordance. Derived here rather than left to the
 * client for the same reason `access` is: a rule the UI works out for itself can disagree
 * with what `deleteComment` would actually enforce. Defaults false, the safe answer. */
export const projectComment = (
    comment,
    { liked = false, orgId = null, canDelete = false } = {},
) => ({
    id: comment.id,
    author: projectAuthor(comment.author, orgId),
    text: comment.body,
    createdAt: comment.createdAt.toISOString(),
    likes: comment.likeCount,
    liked,
    canDelete,
})

/* An organization, as the Groups surface and the viewer's profile read it. `role` and
 * `status` come from the viewer's membership, so this is always a viewer-relative view of
 * a group rather than a public one. */
export const projectOrg = (org, membership) => ({
    id: org.id,
    slug: org.slug,
    name: org.name,
    kind: org.kind,
    avatar: org.avatarUrl,
    bio: org.bio,
    role: membership?.role ?? null,
    status: membership?.status ?? null,
})

/* Whether this viewer may use the app, and if not, why.
 *
 * Derived here rather than left to the client, so the gate branches on one value that
 * cannot drift from what the API would actually enforce. The order of the checks is the
 * precedence: one approved membership is enough to be in, regardless of what else is
 * revoked.
 *
 * Three values, not four. There is no PENDING, because nobody can ask to join — an admin
 * admits people and the membership is APPROVED from the moment it exists. REVOKED and NONE
 * stay distinct because they need different wording: one person was removed, the other was
 * never attached to a parish at all. */
const accessFor = (memberships) => {
    if (memberships.some((m) => m.status === "APPROVED")) return "ACTIVE"
    if (memberships.some((m) => m.status === "REVOKED")) return "REVOKED"
    return "NONE"
}

/* The signed-in viewer. `role` and `vocation` are the two axes the UI reads — see the
 * header of `prisma/schema.prisma` for why they are separate — and `orgs` carries every
 * group the viewer belongs to, with their role in each.
 *
 * `role` at the top level is the viewer's role in their *primary* group, which is what a
 * single-organization app renders in the profile menu. It is a convenience over `orgs`,
 * not a second source of truth.
 *
 * `access` and `onboardedAt` are what the gates act on: the first decides whether the app
 * opens at all, the second whether first-run orientation still has to happen. */
export const projectViewer = (profile, memberships = []) => {
    const primary = memberships.find((m) => m.status === "APPROVED") ?? memberships[0] ?? null

    return {
        id: profile.id,
        email: profile.email,
        handle: profile.handle,
        /* Parts, not a composed string — the viewer is rendered by `displayName()` like
         * anybody else, and the onboarding form needs the two fields back individually to
         * populate itself if the viewer returns to it. */
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatar: profile.avatarUrl,
        vocation: profile.vocation,
        /* Date only — `@db.Date`, so there is no time to strip and no timezone to shift it
         * across. Sent as YYYY-MM-DD, which is what a date input expects. */
        birthday: profile.birthday ? profile.birthday.toISOString().slice(0, 10) : null,
        onboardedAt: profile.onboardedAt?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString(),
        access: accessFor(memberships),
        role: primary?.role ?? null,
        /* Only groups the viewer is actually in. A revoked membership informs `access`
         * above but must not appear as one of their groups. */
        orgs: memberships
            .filter((m) => m.status === "APPROVED")
            .map((membership) => projectOrg(membership.org, membership)),
    }
}
