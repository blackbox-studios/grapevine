import "server-only"

import { canDeleteOrg } from "@/lib/server/auth"
import { documentType, formatBytes } from "@/lib/utils"

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
 * `canDelete` is whether this viewer may remove the post — ADMIN of the group it belongs
 * to, and only that (see `canDeletePost`). Composed here for the same reason a comment's is:
 * a rule the client re-derives can disagree with the one the server enforces, and the answer
 * is per-group, so a page of posts can carry both answers at once. Defaults false, the safe
 * answer. It is also what decides whether the options menu appears at all — a menu with
 * nothing in it must not be offered.
 *
 * The owning organization goes over as both `orgId` and `orgName` because the two answer
 * different questions and only one of them is a label. `orgName` is what the card prints;
 * `orgId` is what a surface resolves the viewer's role against, which matters because a
 * post can belong to a group other than the one currently selected — a shared link opens
 * by id, so the detail surface has to ask "am I an admin *here*" rather than assume the
 * switcher's answer. */
export const projectPost = (
    post,
    { liked = false, likedBy = null, canDelete = false } = {},
) => ({
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
    canDelete,
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

/* One line in the notifications panel.
 *
 * `actor` is the same author block a post byline carries, resolved against the *post's*
 * group — so the person who liked your announcement wears the check in the parish it was
 * published into, exactly as they would above a post of their own. The panel is not scoped
 * to the selected group, so this is the only thing that could answer it correctly.
 *
 * `type` goes over raw rather than as a rendered sentence. "liked your post" is copy, and
 * copy belongs on the client next to the layout that has to fit it — the same reason a name
 * ships as parts. It is also what lets a grouped line ("and 9 others") reuse this projection
 * unchanged when that lands; see the GROUPING note in `notifications.service.js`.
 *
 * `postId` is where this notification points. It is shipped even though nothing navigates
 * with it yet, because it is what a push payload and a tapped row both need, and it costs a
 * column already loaded.
 *
 * `orgName` is what a NEW_POST line names — "posted in Holy Trinity Cathedral" — and it has
 * to come from the post rather than from the switcher, because this panel is not scoped to
 * the selected group and the post very often belongs to another one.
 *
 * `read` rather than `readAt`: the panel tints a row and the bell counts, and neither has
 * any use for the instant it happened to be marked. */
export const projectNotification = (notification) => ({
    id: notification.id,
    type: notification.type,
    actor: projectAuthor(notification.actor, notification.post?.orgId ?? null),
    postId: notification.postId,
    orgName: notification.post?.org?.name ?? null,
    createdAt: notification.createdAt.toISOString(),
    read: notification.readAt !== null,
})

/* An organization, as the Groups surface and the viewer's profile read it. `role` and
 * `status` come from the viewer's membership, so this is always a viewer-relative view of
 * a group rather than a public one.
 *
 * `canDelete` is composed here for the same reason a post's is: it is a rule the client would
 * otherwise re-derive, and a re-derived rule can disagree with the one `deleteOrg` enforces —
 * which shows up as a delete button that 403s. It is narrower than `role` and cannot be worked
 * out from anything else in this shape, since `createdById` is deliberately not shipped. See
 * `canDeleteOrg`. Defaults false, the safe answer, so a partial projection can never
 * manufacture the affordance.
 *
 * `slug` goes over because the delete confirmation is keyed on it — `deleteOrg` requires the
 * caller to echo it back. Nothing renders it. */
export const projectOrg = (org, membership, { canDelete = false } = {}) => ({
    id: org.id,
    slug: org.slug,
    name: org.name,
    kind: org.kind,
    avatar: org.avatarUrl,
    bio: org.bio,
    role: membership?.role ?? null,
    status: membership?.status ?? null,
    canDelete,
})

/* Whether this viewer may use the app, and if not, why.
 *
 * Derived here rather than left to the client, so the gate branches on one value that
 * cannot drift from what the API would actually enforce. The order of the checks is the
 * precedence: one approved membership is enough to be in, regardless of what else is
 * revoked.
 *
 * **A platform owner is always ACTIVE, and that is the one place ownership touches a read.**
 * Not a privilege — it opens no group and reveals nothing — but a newly provisioned owner has
 * no memberships yet, by definition: they are about to create their first group. Without this
 * they would sign in to the access-removed screen and have no way to reach the thing they
 * just paid for. See the `PlatformRole` note in `prisma/schema.prisma`.
 *
 * Three values, not four. There is no PENDING, because nobody can ask to join — an admin
 * admits people and the membership is APPROVED from the moment it exists. REVOKED and NONE
 * stay distinct because they need different wording: one person was removed, the other was
 * never attached to a parish at all. */
const accessFor = (memberships, platformRole) => {
    if (memberships.some((m) => m.status === "APPROVED")) return "ACTIVE"
    if (platformRole === "OWNER") return "ACTIVE"
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
        /* The third axis, shipped so a client can offer the create-a-group affordance to the
         * one person it applies to. Presentation only, exactly like `role` — the endpoints it
         * unlocks run `requirePlatformOwner` themselves, and a client that lied about this
         * would get a 403 for its trouble. */
        platformRole: profile.platformRole,
        /* Date only — `@db.Date`, so there is no time to strip and no timezone to shift it
         * across. Sent as YYYY-MM-DD, which is what a date input expects. */
        birthday: profile.birthday ? profile.birthday.toISOString().slice(0, 10) : null,
        onboardedAt: profile.onboardedAt?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString(),
        access: accessFor(memberships, profile.platformRole),
        role: primary?.role ?? null,
        /* Only groups the viewer is actually in. A revoked membership informs `access`
         * above but must not appear as one of their groups. */
        orgs: memberships
            .filter((m) => m.status === "APPROVED")
            .map((membership) =>
                projectOrg(membership.org, membership, {
                    canDelete: canDeleteOrg(profile, membership.org),
                }),
            ),
    }
}
