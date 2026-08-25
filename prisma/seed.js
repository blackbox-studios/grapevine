/* Database seed.
 *
 *   npm run prisma:seed
 *
 * Brings an empty Supabase project up to a demonstrable state: one parish, a roster of
 * people, and the post corpus the app was designed against — so a fresh database opens
 * with something to read instead of an empty feed.
 *
 * Two accounts are provisioned as real, sign-innable Supabase users:
 *
 *   SEED_ADMIN_EMAIL    Priest Alexander   PRIEST    ADMIN    can publish
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

import { PrismaClient } from "@prisma/client"
import { createClient } from "@supabase/supabase-js"

import { COMMENTS, FEED } from "./seed-data.js"

const prisma = new PrismaClient()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

/* The two addresses that can actually sign in. Defaults are placeholders on a domain
 * nobody receives mail at, which is fine for creating the rows but useless for signing
 * in — see the header. */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@grapevine.chat"
const MEMBER_EMAIL = process.env.SEED_MEMBER_EMAIL || "member@grapevine.chat"

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
 * — he is Paul Ivanov with `vocation: DEACON`, and the title is composed at render time by
 * `displayName()`. Seeding the addressed form is what the old `fullName` column encouraged,
 * and it left every deacon and matushka in the corpus with no surname at all.
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
        avatarUrl: "/img/mock/priest-alexander.png",
        signIn: true,
    },
    {
        handle: "j.rivera",
        firstName: "Jordan",
        lastName: "Rivera",
        email: MEMBER_EMAIL,
        vocation: "FAITHFUL",
        role: "MEMBER",
        signIn: true,
    },
    { handle: "deacon.paul", firstName: "Paul", lastName: "Ivanov", vocation: "DEACON", role: "MEMBER" },
    { handle: "mat.carly", firstName: "Carly", lastName: "Petrov", vocation: "MATUSHKA", role: "MEMBER" },
    { handle: "matushka.anna", firstName: "Anna", lastName: "Volkov", vocation: "MATUSHKA", role: "MEMBER" },
    { handle: "reader.michael", firstName: "Michael", lastName: "Cross", vocation: "READER", role: "MEMBER" },
    { handle: "choir.elena", firstName: "Elena", lastName: "Marku", vocation: "FAITHFUL", role: "MEMBER" },
    { handle: "geoffrey.k", firstName: "Geoffrey", lastName: "Kane", vocation: "FAITHFUL", role: "MEMBER" },
    { handle: "theodora.v", firstName: "Theodora", lastName: "Vasil", vocation: "FAITHFUL", role: "MEMBER" },
    { handle: "casey.n", firstName: "Casey", lastName: "Nguyen", vocation: "FAITHFUL", role: "MEMBER" },
    { handle: "morgan.p", firstName: "Morgan", lastName: "Patel", vocation: "FAITHFUL", role: "MEMBER" },
    { handle: "sam.okafor", firstName: "Sam", lastName: "Okafor", vocation: "FAITHFUL", role: "MEMBER" },
    { handle: "taylor.b", firstName: "Taylor", lastName: "Brooks", vocation: "FAITHFUL", role: "MEMBER" },
    /* One person removed, so the roster shows both statuses and the Restore action has
     * something to act on. REVOKED is the only alternative there is — see the admission
     * note in schema.prisma's header. */
    { handle: "riley.c", firstName: "Riley", lastName: "Chen", vocation: "FAITHFUL", role: "MEMBER", status: "REVOKED" },
]

/* Profiles with no auth user still need a primary key. A synthetic uuid is fine — nothing
 * will ever present a token for them — but it must be stable across runs, or every re-seed
 * orphans the previous run's posts and comments. Derived from the handle so it is. */
const syntheticId = (handle) => {
    /* UUIDv5-shaped without pulling in a dependency: hash the handle to 32 hex digits and
     * stamp the version/variant nibbles so Postgres accepts it as a uuid. */
    let h1 = 0x811c9dc5
    let h2 = 0x01000193
    for (let i = 0; i < handle.length; i++) {
        h1 = Math.imul(h1 ^ handle.charCodeAt(i), 0x01000193) >>> 0
        h2 = Math.imul(h2 + handle.charCodeAt(i), 0x85ebca6b) >>> 0
    }
    const hex = (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(2)
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        `5${hex.slice(13, 16)}`,
        `8${hex.slice(17, 20)}`,
        hex.slice(20, 32),
    ].join("-")
}

/* Creates (or finds) the Supabase auth user for a sign-innable person, and returns its id.
 *
 * `email_confirm: true` matters: an unconfirmed address cannot be sent an OTP, so without
 * it the seeded accounts would exist and still be unable to sign in. */
const provisionAuthUser = async (supabase, person) => {
    const { data: created, error } = await supabase.auth.admin.createUser({
        email: person.email,
        email_confirm: true,
        user_metadata: { full_name: `${person.firstName} ${person.lastName}`, handle: person.handle },
    })

    if (!error) return created.user.id

    /* Already provisioned by a previous run — find them and reuse the id, so the Profile
     * and everything hanging off it keeps pointing at the same person. */
    const existing = await findAuthUserByEmail(supabase, person.email)
    if (existing) return existing.id

    throw new Error(`Could not provision ${person.email}: ${error.message}`)
}

/* The Admin API has no get-by-email, so page through until the address turns up. Fine at
 * seed scale; if the project ever holds thousands of users, store the id instead. */
const findAuthUserByEmail = async (supabase, email) => {
    for (let page = 1; page <= 10; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
        if (error) throw error
        const match = data.users.find(
            (user) => user.email?.toLowerCase() === email.toLowerCase(),
        )
        if (match) return match
        if (data.users.length < 200) return null
    }
    return null
}

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
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        throw new Error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Both are required to provision the sign-in accounts. See .env.example.",
        )
    }

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

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    })

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
        }

        const profile = await prisma.profile.upsert({
            where: { id },
            update: fields,
            create: { id, ...fields },
        })

        byHandle.set(person.handle, profile.id)
        return profile.id
    }

    const upsertMembership = async (profileId, orgId, { role, status = "APPROVED" }) =>
        prisma.membership.upsert({
            where: { profileId_orgId: { profileId, orgId } },
            update: { role, status },
            create: { profileId, orgId, role, status, decidedAt: new Date() },
        })

    for (const person of PEOPLE) {
        const profileId = await upsertProfile(person)
        await upsertMembership(profileId, org.id, {
            role: person.role,
            status: person.status ?? "APPROVED",
        })
    }

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
                },
            })
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
