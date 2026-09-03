/* The development seed.
 *
 *   npm run db:seed          (or `npm run prisma:seed`)
 *
 * Brings an empty database up to a demonstrable state: two groups, a roster of people, and
 * the post corpus the app was designed against — so a fresh database opens with something to
 * read instead of an empty feed.
 *
 * ── This will not run against a remote database ──────────────────────────────
 *
 * Everything below is disposable by design: fourteen invented parishioners, fixture posts
 * keyed to ids this file deletes and rewrites on every run, tallies computed to match. None
 * of it belongs in a parish's live database, and the only thing separating the two is a URL
 * in an untracked file — so the check is here rather than in a habit. See
 * `scripts/db-target.mjs`. `npm run db:seed:prod` is the one that runs against production,
 * and it writes two admins and one group.
 *
 * Note that **auth is not local even when the database is** (see docker-compose.yml): the
 * container is Postgres alone. `provisionAuthUser` therefore usually finds the hosted user
 * for an address rather than creating one, and reuses its id — which is what keeps the local
 * Profile keyed to the same uuid the real token carries.
 *
 * Two accounts are provisioned as real, sign-innable Supabase users:
 *
 *   SEED_ADMIN_EMAIL    Priest Alexander   PRIEST    ADMIN    can publish; also OWNER
 *   SEED_MEMBER_EMAIL   Jordan Rivera      FAITHFUL  MEMBER   can like and comment
 *
 * **Set those two env vars to addresses you can actually receive mail at.** Signing in
 * means receiving a one-time code by email, so a fictional address is an account you can never
 * use. This matters more than it looks on Supabase's built-in SMTP, which refuses to
 * deliver to anyone who is not a member of the project's organization team — an
 * unrecognised address fails with "Email address not authorized" rather than silently
 * going nowhere. Gmail-style plus-addressing is the easy answer: you@gmail.com and
 * you+member@gmail.com are two distinct accounts landing in one inbox.
 *
 * Everyone else is a Profile with no auth user: they author the seeded comments and fill
 * the roster, but nobody can sign in as them. That split is the point — it makes
 * "provisioned" and "exists in the app" visibly different states, which is what invite-only
 * means here. Sign-in is gated by `shouldCreateUser: false`, so an address with no
 * `auth.users` row can never be sent a code.
 *
 * **Idempotent.** Everything upserts on a natural key, so re-running updates in place
 * rather than duplicating. Posts are keyed by their fixture id (`post-001`), so the seeded
 * corpus is replaced while anything published through the app is left alone.
 *
 * Requires SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) — creating auth
 * users is an admin operation. That key bypasses every RLS policy, so it lives in
 * .env.local and never in the client bundle.
 */

import "dotenv/config"

import { commentScore } from "../src/lib/rank.js"
import { describeDatabase, requireLocalDatabase } from "../scripts/db-target.mjs"
import { COMMENTS, FEED } from "./seed-data.js"
import {
    prisma,
    provisionAuthUser,
    supabaseAdmin,
    syntheticId,
    upsertMembership,
} from "./seed-lib.js"

/* The two addresses that can actually sign in. Defaults are placeholders on a domain
 * nobody receives mail at, which is fine for creating the rows but useless for signing
 * in — see the header. */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@throughgrapevine.com"
const MEMBER_EMAIL = process.env.SEED_MEMBER_EMAIL || "member@throughgrapevine.com"

/* ── The parish ──────────────────────────────────────────────────────────── */

const ORG = {
    slug: "holy-trinity-cathedral",
    name: "Holy Trinity Cathedral",
    kind: "PARISH",
    bio: "The Cathedral parish community — announcements, feasts, and parish life.",
}

/* ── The diocese ─────────────────────────────────────────────────────────── *
 *
 * A second group, and it exists to make the group switcher's central claim testable: that
 * a role is per-group. The seeded admin is the Cathedral's ADMIN and the diocese's MEMBER,
 * so signing in as him and switching groups must visibly take away the composer and the
 * roster — the same session, the same person, different permissions. With one organization
 * seeded, every per-group check would pass trivially and a regression to a global "am I
 * admin" would go unnoticed.
 *
 * It is also the Cathedral's `parent`, which is the shape the hierarchy is for. Nothing
 * reads that relation yet — the feed is scoped to memberships, not to the tree — but
 * seeding the parish under its diocese keeps the fixture honest about what the two are to
 * each other. */
const DIOCESE = {
    slug: "diocese-of-the-south",
    name: "Diocese of the South",
    kind: "DIOCESE",
    bio: "Announcements from His Grace and the diocesan chancery.",
}

/* Who is in the diocese, and as what.
 *
 * The bishop is its ADMIN and exists nowhere else. The two sign-innable people join as
 * MEMBERs by handle — they already have Profiles from the parish loop, and a person is one
 * Profile with several memberships, never a second row per group. */
const DIOCESE_BISHOP = {
    handle: "bp.nicholas",
    firstName: "Nicholas",
    lastName: "Sokolov",
    vocation: "BISHOP",
    role: "ADMIN",
}

const DIOCESE_MEMBER_HANDLES = ["cathedraldean", "j.rivera", "deacon.paul", "reader.michael"]

/* Enough of a corpus that switching to the diocese lands on a real feed rather than an
 * empty state. Ids are prefixed like the parish fixtures so a re-seed replaces them
 * wholesale and anything published through the app (a cuid) is left alone. */
const DIOCESE_POSTS = [
    {
        id: "dio-post-001",
        title: "Archpastoral Visit to Holy Trinity",
        body: "His Grace will serve the Divine Liturgy at Holy Trinity Cathedral on the Sunday of Orthodoxy. Clergy of the deanery are asked to arrive by 8:30am for vesting.",
        daysAgo: 2,
    },
    {
        id: "dio-post-002",
        title: "Diocesan Assembly — Registration Open",
        body: "Registration for this year's Diocesan Assembly is now open. Parish delegates should be elected and their names submitted to the chancery before the end of the month.",
        daysAgo: 9,
    },
    {
        id: "dio-post-003",
        title: "Ordination to the Holy Diaconate",
        body: "With thanksgiving to God we announce the ordination of Reader Michael Cross to the Holy Diaconate. Axios! Please keep him and his family in your prayers.",
        daysAgo: 21,
    },
]

/* ── People ──────────────────────────────────────────────────────────────── *
 *
 * `signIn: true` provisions a Supabase auth user, which is what makes an account usable.
 * The rest exist only as Profiles: they populate the roster and author the seeded
 * comments, but there is no credential behind them.
 *
 * Handles match the fixture data in seed-data.js, because that is how comments are mapped
 * back onto their authors below.
 *
 * **Names are given and family, never an addressed form.** Nobody is seeded as "Dn. Paul"
 * — he is Grigore Ivanov with `vocation: DEACON` and `christianName: "Paul"`, and both the
 * title and the name it attaches to are composed at render time by `displayName()`. Seeding
 * the addressed form is what the old `fullName` column encouraged, and it left every deacon
 * and matushka in the corpus with no surname at all.
 *
 * There is no `verified` either. The blue check is derived from an ADMIN membership, so the
 * `role` below is already what grants it. */
const PEOPLE = [
    {
        handle: "cathedraldean",
        firstName: "Alexander",
        lastName: "Petrov",
        email: ADMIN_EMAIL,
        vocation: "PRIEST",
        role: "ADMIN",
        /* The one seeded platform owner, so `POST /api/orgs` and the delete path are
         * exercisable locally. It is a third axis, not a bigger `role`: he is the Cathedral's
         * ADMIN, the diocese's MEMBER, and an owner of neither — ownership is a property of
         * the person, and the groups he owns are only the ones he creates from the app. */
        platformRole: "OWNER",
        avatarUrl: "/img/mock/priest-alexander.png",
        christianName: "Alexander",
        nameDay: "08-30",
        ordinationDate: "2011-06-12",
        signIn: true,
    },
    {
        handle: "j.rivera",
        firstName: "Jordan",
        lastName: "Rivera",
        email: MEMBER_EMAIL,
        vocation: "FAITHFUL",
        role: "MEMBER",
        christianName: "George",
        nameDay: "04-23",
        signIn: true,
    },
    /* The one fixture whose legal and Christian names differ, because `displayName()`
     * addresses a ranked person by the second and nothing here would demonstrate that if
     * every pair agreed. His handle stays on the first, which is what really happens: a
     * handle is chosen before the rank and is never re-derived. */
    { handle: "deacon.paul", firstName: "Grigore", lastName: "Ivanov", vocation: "DEACON", role: "MEMBER", christianName: "Paul", nameDay: "06-29", ordinationDate: "2019-10-06" },
    { handle: "mat.carly", firstName: "Carly", lastName: "Petrov", vocation: "MATUSHKA", role: "MEMBER", christianName: "Katherine", nameDay: "11-25" },
    { handle: "matushka.anna", firstName: "Anna", lastName: "Volkov", vocation: "MATUSHKA", role: "MEMBER", christianName: "Anna", nameDay: "07-25" },
    { handle: "reader.michael", firstName: "Michael", lastName: "Cross", vocation: "READER", role: "MEMBER", christianName: "Michael", nameDay: "11-08" },
    { handle: "choir.elena", firstName: "Elena", lastName: "Marku", vocation: "FAITHFUL", role: "MEMBER", christianName: "Helen", nameDay: "05-21" },
    { handle: "geoffrey.k", firstName: "Geoffrey", lastName: "Kane", vocation: "FAITHFUL", role: "MEMBER", christianName: "Gregory", nameDay: "01-25" },
    { handle: "theodora.v", firstName: "Theodora", lastName: "Vasil", vocation: "FAITHFUL", role: "MEMBER", christianName: "Theodora", nameDay: "02-11" },
    { handle: "casey.n", firstName: "Casey", lastName: "Nguyen", vocation: "FAITHFUL", role: "MEMBER", christianName: "Cassian", nameDay: "02-29" },
    { handle: "morgan.p", firstName: "Morgan", lastName: "Patel", vocation: "FAITHFUL", role: "MEMBER", christianName: "Mary", nameDay: "08-15" },
    { handle: "sam.okafor", firstName: "Sam", lastName: "Okafor", vocation: "FAITHFUL", role: "MEMBER", christianName: "Samuel", nameDay: "08-20" },
    { handle: "taylor.b", firstName: "Taylor", lastName: "Brooks", vocation: "FAITHFUL", role: "MEMBER", christianName: "Tabitha", nameDay: "10-25" },
    /* One person removed, so the roster shows both statuses and the Restore action has
     * something to act on. REVOKED is the only alternative there is — see the admission
     * note in schema.prisma's header. */
    { handle: "riley.c", firstName: "Riley", lastName: "Chen", vocation: "FAITHFUL", role: "MEMBER", status: "REVOKED", christianName: "Irene", nameDay: "05-05" },
]

/* ── Mapping the fixture corpus onto rows ────────────────────────────────── */

/* A fixture post's media (`image` + dimensions, `images`, `document`) → PostMedia rows.
 * The inverse of `projectMedia` in src/lib/server/projections.js; keep them in step. */
const mediaRowsFor = (post) => {
    const rows = []

    if (post.image) {
        rows.push({
            kind: "IMAGE",
            url: post.image,
            width: post.width ?? null,
            height: post.height ?? null,
            position: rows.length,
        })
    }

    for (const url of post.images ?? []) {
        rows.push({ kind: "IMAGE", url, position: rows.length })
    }

    if (post.document) {
        rows.push({
            kind: "DOCUMENT",
            url: post.document.url ?? `/docs/${post.document.name}`,
            fileName: post.document.name,
            mimeType: post.document.type === "pdf" ? "application/pdf" : null,
            /* The fixture stores a formatted string ("142 KB"); the column stores bytes. */
            sizeBytes: parseSize(post.document.size),
            position: rows.length,
        })
    }

    return rows
}

const parseSize = (label) => {
    const match = /^([\d.]+)\s*(B|KB|MB|GB)$/i.exec(String(label ?? "").trim())
    if (!match) return null
    const scale = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }
    return Math.round(Number(match[1]) * scale[match[2].toLowerCase()])
}

/* ── Seed ────────────────────────────────────────────────────────────────── */

const main = async () => {
    /* Before anything is written, and before the Supabase client is even built: this file
     * deletes and rewrites rows, and the only thing that says which database it is about to
     * do that to is an environment variable. */
    requireLocalDatabase("the development seed")

    console.log(`\n→ database: ${describeDatabase()}`)
    console.log("→ seed:     DEVELOPMENT (two groups, fixture corpus, disposable)\n")

    /* The two accounts are two distinct people. Both `Profile.email` and Supabase's
     * `auth.users.email` are unique, so the same address for both fails partway through
     * with a confusing constraint violation rather than an explanation. Plus-addressing is
     * the fix: one inbox, two addresses. */
    if (ADMIN_EMAIL.toLowerCase() === MEMBER_EMAIL.toLowerCase()) {
        throw new Error(
            `SEED_ADMIN_EMAIL and SEED_MEMBER_EMAIL are both "${ADMIN_EMAIL}". They must differ — ` +
                "these are two separate accounts. Use plus-addressing, e.g. " +
                `"${ADMIN_EMAIL.replace("@", "+member@")}", to receive both at one inbox.`,
        )
    }

    if (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_MEMBER_EMAIL) {
        console.warn(
            "! SEED_ADMIN_EMAIL / SEED_MEMBER_EMAIL are not set, so the sign-in accounts\n" +
                `  default to ${ADMIN_EMAIL} and ${MEMBER_EMAIL}. Those addresses cannot\n` +
                "  receive a sign-in code. Set them to real addresses and re-run to sign in.\n",
        )
    }

    const supabase = supabaseAdmin()

    console.log("→ Organization")
    const org = await prisma.organization.upsert({
        where: { slug: ORG.slug },
        update: { name: ORG.name, kind: ORG.kind, bio: ORG.bio },
        create: ORG,
    })

    console.log("→ Profiles and memberships")
    /* handle → profile id, so comments and posts can be attached by handle below. */
    const byHandle = new Map()

    /* One Profile per person, whichever group brought them in. A person who belongs to both
     * the parish and the diocese is one row with two memberships — creating a second
     * Profile per group is the mistake this shared helper exists to make impossible. */
    const upsertProfile = async (person) => {
        const id = person.signIn
            ? await provisionAuthUser(supabase, person)
            : syntheticId(person.handle)

        /* Profiles with no auth user still need a unique email for the column's
         * constraint; a .invalid address is reserved by RFC 2606 and can never receive
         * mail, which is exactly the property wanted here. */
        const email = person.email ?? `${person.handle}@seed.invalid`

        const fields = {
            email,
            handle: person.handle,
            firstName: person.firstName,
            lastName: person.lastName,
            avatarUrl: person.avatarUrl ?? null,
            vocation: person.vocation,
            platformRole: person.platformRole ?? "NONE",
            christianName: person.christianName ?? null,
            /* `MM-DD` in the fixture, two integers in the column — a name day has no year.
             * See the `nameDayMonth` note in schema.prisma. */
            nameDayMonth: person.nameDay ? Number(person.nameDay.slice(0, 2)) : null,
            nameDayDay: person.nameDay ? Number(person.nameDay.slice(3, 5)) : null,
            ordinationDate: person.ordinationDate
                ? new Date(`${person.ordinationDate}T00:00:00.000Z`)
                : null,
        }

        const profile = await prisma.profile.upsert({
            where: { id },
            update: fields,
            create: { id, ...fields },
        })

        byHandle.set(person.handle, profile.id)
        return profile.id
    }

    for (const person of PEOPLE) {
        const profileId = await upsertProfile(person)
        await upsertMembership(profileId, org.id, {
            role: person.role,
            status: person.status ?? "APPROVED",
        })
    }

    /* ── The follow graph ─────────────────────────────────────────────────────
     *
     * Derived rather than listed, because the point is only that both lists on a profile have
     * something in them and that paging past the first page is reachable: everybody follows
     * the two clergy, and everybody follows the next two people along the roster. That gives
     * each person followers and following without a fixture nobody would maintain.
     *
     * `createMany` with `skipDuplicates` on both writes, so a person who lands in both rules is
     * one row — the composite primary key would otherwise fail the whole batch. */
    console.log("→ Follows")
    const roster = PEOPLE.map((person) => person.handle)
    const clergy = ["cathedraldean", "deacon.paul"]

    /* Dated a month back, a minute apart, rather than left on the column default. The panel is
     * newest-first, so a hundred follows all stamped at seed time would bury every post and
     * like in the corpus under one wall of "followed you" — and a follow graph that predates
     * the posts is the truer fixture anyway. */
    const followedAt = (index) => new Date(Date.now() - (30 * 24 * 60 - index) * 60 * 1000)

    const follows = roster.flatMap((handle, index) =>
        [...clergy, roster[(index + 1) % roster.length], roster[(index + 2) % roster.length]]
            .filter((target) => target !== handle)
            .map((target) => ({
                followerId: byHandle.get(handle),
                followingId: byHandle.get(target),
                createdAt: followedAt(index),
            })),
    )

    await prisma.follow.createMany({ data: follows, skipDuplicates: true })

    /* The notification `toggleFollow` would have written for each of them, for the same reason
     * the likes further down get theirs: the seed inserts the rows directly rather than through
     * the one path that pairs the two. */
    await prisma.notification.createMany({
        data: follows.map((follow) => ({
            recipientId: follow.followingId,
            actorId: follow.followerId,
            type: "FOLLOW",
            subjectId: follow.followerId,
            createdAt: follow.createdAt,
        })),
        skipDuplicates: true,
    })

    /* The parish belongs to the seeded owner, so the delete path is exercisable locally.
     *
     * Written here rather than in the upsert above because it needs a profile id, and the
     * profiles are created in the loop that just ran. Unconditional, unlike the production
     * seed's repair-only version: this file owns its fixtures and rewrites them every run.
     *
     * The diocese is deliberately left ownerless. Its admin is the bishop, who is not a
     * platform owner, so nothing can delete it — which is the other half of the rule and worth
     * having on screen beside a group that can be. */
    await prisma.organization.update({
        where: { id: org.id },
        data: { createdById: byHandle.get("cathedraldean") },
    })

    console.log("→ Posts, media, and comments")
    /* Oldest first, so `createdAt` ordering in the database matches the fixture's
     * newest-first array once the feed sorts it. */
    for (const fixture of [...FEED].reverse()) {
        const authorId = byHandle.get(fixture.author.handle)
        if (!authorId) {
            console.warn(`  ! skipping ${fixture.id}: unknown author @${fixture.author.handle}`)
            continue
        }

        const createdAt = new Date(fixture.created_at)
        const threadFixtures = COMMENTS[fixture.id] ?? []

        /* Replace the seeded post wholesale. Media and comments cascade on delete, so this
         * cannot leave orphans, and anything published through the app has a cuid rather
         * than a `post-00n` id and is therefore untouched. */
        await prisma.post.deleteMany({ where: { id: fixture.id } })

        /* Who will actually like this post.
         *
         * The tallies are denormalized, and the app treats them as authoritative — so the
         * seed must not write a number it cannot back with rows. An earlier version set
         * `likeCount` straight from the fixture (18, 22, …) while inserting a single
         * PostLike, which left every post's counter disagreeing with reality from the
         * first minute. Nothing visibly broke, but the invariant the whole design leans on
         * was false, and any recount would have silently deflated the demo.
         *
         * So the fixture's number becomes a *target*, capped by how many people actually
         * exist to do the liking. Deterministic (sorted by handle) so re-seeding produces
         * the same rows rather than churning them. */
        const likeTarget = fixture.likes ?? 0
        /* The fixture names the social-proof liker by handle. It used to name them by
         * display name, which stopped being a stable key the moment names became parts and
         * titles became derived — "Mat. Carly" is now assembled at render time and matches
         * nothing in this file. */
        const namedLiker = PEOPLE.find((person) => person.handle === fixture.likedBy)?.handle
        const eligible = PEOPLE.map((person) => person.handle)
            .filter((handle) => byHandle.get(handle) !== authorId && handle !== namedLiker)
            .sort()
        /* The named liker goes last so it is the newest like — `likedByNames` in
         * posts.service.js resolves the social-proof name with DISTINCT ON … ORDER BY
         * created_at DESC, so ordering here is what makes the card name the right person. */
        const likers = [...eligible.slice(0, Math.max(0, likeTarget - (namedLiker ? 1 : 0)))]
        if (namedLiker) likers.push(namedLiker)

        await prisma.post.create({
            data: {
                id: fixture.id,
                orgId: org.id,
                authorId,
                title: fixture.title ?? null,
                body: fixture.body,
                createdAt,
                updatedAt: createdAt,
                /* Both counters are the truth of what this loop inserts, never the
                 * fixture's own numbers — the fixture's `comments` count was authored
                 * independently and does not always match its thread either. */
                likeCount: likers.length,
                commentCount: threadFixtures.length,
                media: { create: mediaRowsFor(fixture) },
            },
        })

        for (const comment of threadFixtures) {
            const commentAuthorId = byHandle.get(comment.author.handle)
            if (!commentAuthorId) {
                console.warn(`  ! skipping comment ${comment.id}: unknown @${comment.author.handle}`)
                continue
            }
            const commentedAt = new Date(comment.created_at)
            await prisma.comment.create({
                data: {
                    id: comment.id,
                    postId: fixture.id,
                    authorId: commentAuthorId,
                    body: comment.text,
                    likeCount: comment.likes ?? 0,
                    createdAt: commentedAt,
                    updatedAt: commentedAt,
                    /* Through the same function the app writes it with, rather than left on
                     * the column default — a corpus of zero-scored comments would sort by id
                     * and hide every ranking bug this fixture exists to make visible. */
                    score: commentScore({
                        createdAt: commentedAt,
                        likeCount: comment.likes ?? 0,
                        byPostAuthor: commentAuthorId === authorId,
                    }),
                },
            })

            /* The notification `addComment` would have written, for the same reason the like
             * rows below get theirs: the seed inserts the comment directly rather than
             * through the one path that pairs the two. */
            if (commentAuthorId !== authorId) {
                await prisma.notification.create({
                    data: {
                        recipientId: authorId,
                        actorId: commentAuthorId,
                        type: "POST_COMMENT",
                        subjectId: comment.id,
                        postId: fixture.id,
                        createdAt: commentedAt,
                    },
                })
            }
        }

        /* The like rows behind the counter written above. One second apart so the ordering
         * is total and the named liker is unambiguously the most recent. */
        for (const [index, handle] of likers.entries()) {
            const likerId = byHandle.get(handle)
            if (!likerId) continue
            await prisma.postLike.create({
                data: {
                    profileId: likerId,
                    postId: fixture.id,
                    createdAt: new Date(createdAt.getTime() + (index + 1) * 1000),
                },
            })
        }

        /* The notifications those likes would have produced, written here because the seed
         * inserts the like rows directly rather than through `togglePostLike` — which is the
         * one place that pairs the two in the running app. Without this a fresh database has
         * a feed full of likes and an empty bell, and the panel cannot be looked at until
         * somebody taps a heart.
         *
         * Timestamps match the like they stand for, so the panel's newest-first order agrees
         * with the order the likes were laid down in above. Nothing is marked read: an unlit
         * bell on a fresh database demonstrates nothing. */
        await prisma.notification.createMany({
            data: likers.flatMap((handle, index) => {
                const likerId = byHandle.get(handle)
                if (!likerId || likerId === authorId) return []
                return [{
                    recipientId: authorId,
                    actorId: likerId,
                    type: "POST_LIKE",
                    subjectId: fixture.id,
                    postId: fixture.id,
                    createdAt: new Date(createdAt.getTime() + (index + 1) * 1000),
                }]
            }),
            skipDuplicates: true,
        })

        /* And the fan-out every publish now performs: one row per approved member of the
         * group except the author. This is what puts something in the *member* account's
         * bell — the admin authors nearly everything in this corpus, so post likes alone
         * would only ever fill one of the two sign-innable accounts. */
        await prisma.notification.createMany({
            data: PEOPLE.flatMap((person) => {
                const profileId = byHandle.get(person.handle)
                if (!profileId || profileId === authorId) return []
                if ((person.status ?? "APPROVED") !== "APPROVED") return []
                return [{
                    recipientId: profileId,
                    actorId: authorId,
                    type: "NEW_POST",
                    subjectId: fixture.id,
                    postId: fixture.id,
                    createdAt,
                }]
            }),
            skipDuplicates: true,
        })
    }

    console.log("→ Diocese")
    const diocese = await prisma.organization.upsert({
        where: { slug: DIOCESE.slug },
        update: { name: DIOCESE.name, kind: DIOCESE.kind, bio: DIOCESE.bio },
        create: DIOCESE,
    })

    /* The parish sits under the diocese. Written after both exist rather than as part of
     * either create, because the relation needs the other side's id. */
    await prisma.organization.update({
        where: { id: org.id },
        data: { parentId: diocese.id },
    })

    const bishopId = await upsertProfile(DIOCESE_BISHOP)
    await upsertMembership(bishopId, diocese.id, { role: DIOCESE_BISHOP.role })

    /* Everyone else joins as a MEMBER — including the parish's own admin, which is the
     * whole point: the same account administers one group and merely belongs to the other,
     * so the switcher has a real permission difference to demonstrate. */
    for (const handle of DIOCESE_MEMBER_HANDLES) {
        const profileId = byHandle.get(handle)
        if (!profileId) {
            console.warn(`  ! skipping diocese membership: unknown @${handle}`)
            continue
        }
        await upsertMembership(profileId, diocese.id, { role: "MEMBER" })
    }

    for (const fixture of DIOCESE_POSTS) {
        const createdAt = new Date(Date.now() - fixture.daysAgo * 24 * 60 * 60 * 1000)
        await prisma.post.deleteMany({ where: { id: fixture.id } })
        await prisma.post.create({
            data: {
                id: fixture.id,
                orgId: diocese.id,
                authorId: bishopId,
                title: fixture.title,
                body: fixture.body,
                createdAt,
                updatedAt: createdAt,
                /* No likes and no comments seeded here, and the counters say so. The
                 * parish corpus is what exercises social proof; this feed exists to prove
                 * the scope switch, and a tally with no rows behind it would be the exact
                 * invariant break the parish loop takes care to avoid. */
                likeCount: 0,
                commentCount: 0,
            },
        })
    }

    const [posts, comments, parishMembers, dioceseMembers] = await Promise.all([
        prisma.post.count(),
        prisma.comment.count(),
        prisma.membership.count({ where: { orgId: org.id } }),
        prisma.membership.count({ where: { orgId: diocese.id } }),
    ])

    console.log(`\n✓ ${posts} posts, ${comments} comments across two groups:`)
    console.log(`    ${ORG.name.padEnd(24)} ${parishMembers} members`)
    console.log(`    ${DIOCESE.name.padEnd(24)} ${dioceseMembers} members`)
    console.log("\n  Sign in with either address — the code arrives by email:")
    for (const person of PEOPLE.filter((p) => p.signIn)) {
        console.log(`    ${person.email.padEnd(22)} ${person.role.padEnd(7)} ${person.firstName} ${person.lastName}`)
    }
    console.log(`\n  Both are MEMBERs of ${DIOCESE.name} — switch groups to watch the`)
    console.log("  admin controls appear and disappear.")
}

main()
    .catch((error) => {
        console.error("\n✗ Seed failed:", error.message)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
