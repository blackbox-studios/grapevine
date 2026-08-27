import "server-only"

import { OrgKind } from "@prisma/client"

import {
    MAX_ORG_BIO_LENGTH,
    MAX_ORG_NAME_LENGTH,
    ORG_SLUG_MAX,
    ORG_SLUG_MIN,
    ORG_SLUG_PATTERN,
    UPLOAD_PURPOSES,
} from "@/lib/constants"
import { prisma } from "@/lib/db"
import {
    approvedMemberships,
    canDeleteOrg,
    membershipIn,
    requireMembership,
    requirePlatformOwner,
} from "@/lib/server/auth"
import { forbidden, invalid, notFound } from "@/lib/server/errors"
import { projectOrg } from "@/lib/server/projections"
import { isOwnedUrl } from "@/lib/server/storage"
import { uploadPrefix } from "@/lib/server/uploads.service"

/* Groups: listing the viewer's, editing one, and bringing one into or out of existence.
 *
 * Three different authorities operate in this file and they are not interchangeable:
 *
 *  - **A member** reads their own groups (`listOrgs`). Never a directory of every group in
 *    the system — see the header of `app/api/orgs/route.api.js`.
 *  - **An admin of a group** edits its name, description and picture (`updateOrg`). Same
 *    permission as publishing into it, because those three fields are the group's public
 *    face.
 *  - **A platform owner** creates groups and deletes the ones they created (`createOrg`,
 *    `deleteOrg`). This is the subscriber's axis — see the `PlatformRole` note in
 *    `prisma/schema.prisma` — and it is the only thing in the app that is not scoped to a
 *    group, for the plain reason that a group being created does not exist yet.
 *
 * ── The rule that keeps ownership from becoming a backdoor ───────────────────
 *
 * `requirePlatformOwner` appears exactly twice in this codebase, both in this file, and
 * neither call site reads anybody's content. An owner's ability to *administer* a group they
 * created is not derived from `platformRole` at read time — `createOrg` writes them a real
 * APPROVED ADMIN `Membership`, and `updateMembership` refuses to remove it. So every read
 * path in the app still asks the one question it has always asked ("is there an APPROVED
 * membership row"), and adding this axis widened no existing check.
 *
 * The alternative — teaching `requireMembership` to answer yes for an owner's own groups —
 * was rejected: it puts platform authority into the hot path of every authorization decision
 * in the app, where one wrong condition is a cross-parish read, and it makes the owner
 * invisible in their own roster because there is no row to show.
 */

const readOrgName = (value) => {
    const name = String(value ?? "").trim().replace(/\s+/g, " ")
    if (!name) throw invalid("Enter a name for this group.", { name: "Required" })
    if (name.length > MAX_ORG_NAME_LENGTH) {
        throw invalid(`A group name can be at most ${MAX_ORG_NAME_LENGTH} characters.`, {
            name: "Too long",
        })
    }
    return name
}

/* The viewer's groups — the Groups surface.
 *
 * Not paginated: a person belongs to a handful of parishes, not a feed's worth. It still
 * returns the `{ items, nextCursor }` collection shape with a null cursor, because the
 * contract says a collection is always that object even where pagination looks
 * unnecessary — adding a key to an object is non-breaking, turning an array into one is
 * not. */
export const listOrgs = async (viewer) => {
    const memberships = approvedMemberships(viewer)
    return {
        items: memberships.map((membership) =>
            projectOrg(membership.org, membership, {
                canDelete: canDeleteOrg(viewer, membership.org),
            }),
        ),
        nextCursor: null,
    }
}

/* A group's name, description and picture — the group settings form.
 *
 * Admin of *that* group, which is the same permission as publishing into it and for the same
 * reason: these three fields are the parish's public face. They appear in the switcher, on
 * the Groups surface, and beside every post the group has ever published, so changing one is
 * an act of administration rather than a member's preference.
 *
 * **`slug` and `kind` are deliberately not editable here.** The slug is the natural key the
 * seeds upsert on and the only stable handle anything outside the database has on a group;
 * letting it move would break every such reference for a cosmetic gain, since nothing in the
 * UI shows it. `kind` decides what a group *is* and sits above a parish admin — a diocese
 * that could be renamed into a monastery by one of its parish priests is not a permission
 * this app hands out. Both are set once, by whoever creates the group, in `createOrg`.
 *
 * Every field is optional and absent means "leave alone", so the form can send only what
 * changed and the avatar picker can save a picture without touching the name mid-edit. An
 * explicitly null `bio` does clear it — that is the one way to remove a description, and it
 * is distinguishable from absence because `undefined` is what Prisma ignores.
 */
export const updateOrg = async (viewer, orgId, { name, bio, avatar } = {}) => {
    requireMembership(viewer, orgId, { role: "ADMIN" })

    const data = {}

    if (name !== undefined) {
        data.name = readOrgName(name)
    }

    if (bio !== undefined) {
        /* Trimmed to null rather than to "": the column is nullable and the projection hands
         * the client `bio` verbatim, so an empty string would render as a description that is
         * present and blank — a surface with nothing in it instead of no surface. */
        const value = String(bio ?? "").trim()
        if (value.length > MAX_ORG_BIO_LENGTH) {
            throw invalid(
                `A description can be at most ${MAX_ORG_BIO_LENGTH} characters.`,
                { bio: "Too long" },
            )
        }
        data.bio = value || null
    }

    if (avatar !== undefined) {
        const url = String(avatar ?? "").trim()
        if (!url) throw invalid("A picture is required.", { avatar: "Required" })

        /* The same check `updateAvatar` makes, with the group as the owner. Without it this
         * endpoint would take any string as a picture, and a crafted request could point a
         * parish's avatar at an off-site image the switcher would then render as parish
         * identity — or at another group's object, whose path is unguessable and reachable
         * no other way. Only a grant from POST /api/uploads mints a URL that passes, and
         * that grant already ran this exact authorization. */
        if (
            !isOwnedUrl(url, {
                prefix: uploadPrefix(UPLOAD_PURPOSES.ORG_AVATAR),
                ownerId: orgId,
            })
        ) {
            throw invalid("A group picture must be uploaded through Grapevine.", {
                avatar: "Unrecognized file",
            })
        }
        data.avatarUrl = url
    }

    if (Object.keys(data).length === 0) {
        throw invalid("Nothing to update.", { name: "Required" })
    }

    const org = await prisma.organization.update({ where: { id: orgId }, data })

    /* Projected with the viewer's own membership, so the response carries the same `role`
     * and `status` shape every other org the client holds does — the store swaps this row
     * into the viewer's list, and a row missing those two fields would read as a group the
     * viewer has no standing in. */
    return projectOrg(org, membershipIn(viewer, orgId), {
        canDelete: canDeleteOrg(viewer, org),
    })
}

/* ---------------------------------------------------------------------------
 * Creating and deleting groups — platform owners only
 * ------------------------------------------------------------------------- */

/* A slug in the shape the column requires, from either an explicit one or the group's name.
 *
 * Deriving it is the normal path: the person creating a group is naming a parish, not
 * choosing a URL, and asking them for both is asking them to care about a field no screen
 * ever shows. An explicit slug is honoured because the seeds address groups by it, so
 * onboarding a parish that already has one in a script must be able to keep it.
 *
 * The result is only *shaped* here; whether it is free is settled by the unique constraint,
 * via `uniqueSlug` below. */
const readSlug = (value, name, explicit) => {
    const slug = String(explicit ? value : name)
        .toLowerCase()
        .trim()
        /* Everything that is not a slug character becomes one hyphen, then the runs and the
         * ends are cleaned up. "St. John's — Chicago" lands on "st-john-s-chicago". */
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, ORG_SLUG_MAX)
        .replace(/-$/, "")

    if (slug.length < ORG_SLUG_MIN) {
        /* Reachable from a name with almost no latin characters in it — a Cyrillic parish
         * name reduces to nothing here. Reported against `slug` rather than `name`, because
         * the name is fine and the fix is to supply a slug. */
        throw invalid(
            `Could not build a web address from that name. Give this group a slug of at least ${ORG_SLUG_MIN} characters.`,
            { slug: explicit ? "Too short" : "Required" },
        )
    }
    if (!ORG_SLUG_PATTERN.test(slug)) {
        throw invalid("A slug can use lowercase letters, numbers and hyphens.", {
            slug: "Invalid",
        })
    }
    return slug
}

/* The slug as it will be stored, made unique against what exists.
 *
 * A derived slug collides routinely — two dioceses each have a "Holy Trinity" — and failing
 * the whole creation over a name somebody else picked would be a dead end for the person
 * typing it, who cannot see the other group and cannot be told about it. So a derived slug
 * gets a numeric suffix, exactly as `deriveHandle` does for handles.
 *
 * An **explicit** slug is not suffixed: the caller asked for that address specifically, so
 * silently giving them a different one is the wrong answer — they are told it is taken. */
const uniqueSlug = async (slug, { explicit }) => {
    for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`
        const taken = await prisma.organization.findUnique({
            where: { slug: candidate },
            select: { id: true },
        })
        if (!taken) return candidate
        if (explicit) {
            throw invalid("That slug is already taken.", { slug: "Taken" })
        }
    }
    return `${slug}-${Math.random().toString(36).slice(2, 7)}`
}

/* The parent group a new group hangs under, validated — or null.
 *
 * **Requires ADMIN standing in the parent, which is not the same as being an owner.** The
 * hierarchy is not decoration: `Organization.children` is what a diocese feed is expected to
 * widen across, so nesting a group under a diocese is a claim that its posts belong in that
 * diocese's reading. Left unchecked, any owner could file their private catechumen circle
 * under somebody else's diocese and publish into that diocese's future feed. Ownership of
 * the *child* is not authority over the parent; only a membership in the parent is.
 *
 * Costs no query: the membership comes from the snapshot `requireViewer` already loaded, and
 * holding one is itself proof the parent exists. */
const readParent = (viewer, parentId) => {
    if (parentId == null || parentId === "") return null
    return requireMembership(viewer, String(parentId), { role: "ADMIN" }).orgId
}

/* Creates a group and makes its creator the first admin of it.
 *
 * **Platform owners only.** This is the one action in the app that is not scoped to a group,
 * because the group does not exist yet — see the `PlatformRole` note in `schema.prisma` for
 * why that is a third axis rather than a role.
 *
 * ── One transaction, two rows, and the second is the important one ───────────
 *
 * The group and the creator's APPROVED ADMIN membership are written together. A group with
 * no members is unreachable by every surface in the app — the switcher lists the viewer's
 * memberships, the feed reads them, the roster is admin-only — so a partial write here does
 * not degrade, it strands. Writing the membership is also what makes the owner's authority
 * *inside* their group an ordinary membership rather than a special case checked at read
 * time, which is the whole reason this file needs no other owner checks.
 *
 * ── What creating a group does not do ────────────────────────────────────────
 *
 * It admits nobody else. Onboarding a parish is this call followed by the invite flow that
 * already exists (`POST /api/orgs/:orgId/members`), which provisions each person's Supabase
 * user, Profile and membership in one step. Nothing new was needed for that half.
 */
export const createOrg = async (viewer, { name, slug, kind, parentId, bio } = {}) => {
    requirePlatformOwner(viewer)

    const orgName = readOrgName(name)
    const explicit = slug != null && String(slug).trim() !== ""
    const orgSlug = await uniqueSlug(readSlug(slug, orgName, explicit), { explicit })

    /* Validated against the generated enum rather than a copied list, so it cannot drift
     * from the schema. Defaults to GROUP, not PARISH: an owner creating a second group is
     * more often carving out a circle — catechumens, choir, council — than founding a
     * parish, and a wrong default here is a mislabel nobody can correct afterwards, since
     * `kind` is not editable. */
    const orgKind = kind == null ? "GROUP" : kind
    if (!Object.hasOwn(OrgKind, orgKind)) {
        throw invalid("That group type is not a valid option.", { kind: "Invalid" })
    }

    const parent = readParent(viewer, parentId)

    const description = String(bio ?? "").trim()
    if (description.length > MAX_ORG_BIO_LENGTH) {
        throw invalid(`A description can be at most ${MAX_ORG_BIO_LENGTH} characters.`, {
            bio: "Too long",
        })
    }

    const [org] = await prisma.$transaction([
        prisma.organization.create({
            data: {
                name: orgName,
                slug: orgSlug,
                kind: orgKind,
                bio: description || null,
                parentId: parent,
                createdById: viewer.id,
            },
        }),
        /* The group is reached by its **slug**, not by the id the statement above just
         * minted: the array form of `$transaction` cannot read a previous statement's
         * result, and that is the trade it makes for not holding a connection open across
         * round trips. `slug` is a unique column this function has already computed, so it
         * is the cheap way to pay it — and it is why creating a group does not need the
         * interactive form that `deleteComment` earns.
         *
         * All three links are written as relations, and they have to be: one `connect`
         * puts Prisma into its checked input, where a bare `profileId` beside it is not a
         * missing option but a different input type. Mixing the two forms fails at runtime
         * with "Argument `profile` is missing", reported against the *first* statement in
         * the transaction, which is a genuinely misleading place to start looking. */
        prisma.membership.create({
            data: {
                profile: { connect: { id: viewer.id } },
                org: { connect: { slug: orgSlug } },
                role: "ADMIN",
                status: "APPROVED",
                decidedAt: new Date(),
                decidedBy: { connect: { id: viewer.id } },
            },
        }),
    ])

    /* Projected with the membership just written rather than one read back. The viewer
     * snapshot `requireViewer` loaded predates this group by microseconds and does not
     * contain it, and re-reading the row would be a round trip to learn what was just
     * inserted. */
    return projectOrg(org, { role: "ADMIN", status: "APPROVED" }, {
        /* The creator, by construction — no need to ask. */
        canDelete: true,
    })
}

/* Deletes a group and everything in it.
 *
 * **Only the owner who created it.** Not "an owner", and not an admin of the group: a parish
 * priest administering his own parish must not be able to delete the subscription's group
 * out from under the person paying for it, and one subscriber must never reach another's.
 * `createdById` is the subscription boundary, and this is the only place it is enforced.
 *
 * ── The refusals are shaped like `requireMembership`'s, for the same reason ───
 *
 * A group the viewer does not own is 404, not 403 — an owner probing ids must not be able to
 * confirm that another subscriber's parish exists. The exception is a group they *are* in:
 * they already know it exists, so hiding it would only confuse, and the honest answer is
 * that deleting it is not theirs to do.
 *
 * ── Confirmation is the slug, in the body ────────────────────────────────────
 *
 * The caller must echo the group's own slug. This is irreversible and cascades to every post,
 * comment, like, notification, invite and membership the group ever held, so an id
 * transposed between two tabs would silently destroy the wrong parish. Echoing the slug
 * means the request had to name the group it meant, in a form a human reads. It is not a
 * security control — the authorization above is — it is the guard against being right about
 * the permission and wrong about the group.
 *
 * ── What survives ────────────────────────────────────────────────────────────
 *
 * Child groups survive, orphaned to the top level (`parent` is `SetNull`) — a diocese being
 * deleted must not take its parishes with it. Uploaded files stay in storage, for the same
 * reason `updateAvatar` leaves the previous picture: a sweep belongs in a job, where a
 * failure is retried, not in a request where it would half-delete. Profiles are untouched;
 * losing your group is not losing your account.
 */
export const deleteOrg = async (viewer, orgId, { confirm } = {}) => {
    requirePlatformOwner(viewer)

    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, slug: true, createdById: true },
    })

    const mayDelete = canDeleteOrg(viewer, org)

    if (!org || (!mayDelete && !membershipIn(viewer, orgId))) {
        throw notFound("Group not found.")
    }
    if (!mayDelete) {
        throw forbidden("Only the owner who created this group can delete it.")
    }

    if (String(confirm ?? "").trim().toLowerCase() !== org.slug) {
        throw invalid(
            `To delete this group, confirm with its slug: "${org.slug}".`,
            { confirm: "Does not match" },
        )
    }

    await prisma.organization.delete({ where: { id: org.id } })
}
