/* The production seed.
 *
 *     npm run db:seed:prod
 *
 * Brings the live database to the state the app launches in: **one group, two admins, and the
 * parish's own opening posts**. Holy Trinity Cathedral, Fr. Alexander Koranda, and Robert Paul.
 * No invented parishioners, no fixture ids.
 *
 * Those two are also the platform's bootstrap OWNERs, which is what lets every group after
 * this one be created from the app instead of from here. Onboarding a further parish is
 * `npm run owner -- <their email>`, not an edit to this file.
 *
 * ── It guarantees access, not content ────────────────────────────────────────
 *
 * This is the rule that makes it safe to re-run against a live database, and it is the one
 * real difference from the dev seed beyond the row count.
 *
 * **Access is asserted every time.** The two admins exist, are confirmed in Supabase, hold
 * APPROVED ADMIN memberships in the Cathedral. Re-running repairs those, which is the point:
 * if a membership is revoked by accident, this is the way back in that needs no working
 * sign-in to perform.
 *
 * **Content is written once and never overwritten.** Names, handles, vocations, the group's
 * name, its bio, both avatars, and the launch posts — the seed supplies them when the row is
 * created and then leaves them alone forever. They belong to the people who own them the moment
 * the app is live: Fr. Alexander picks his handle at /welcome, an admin renames the group or
 * changes its picture from Settings → Groups, and either of them may edit or delete a post. A
 * seed that reasserted its own values on every run would silently undo all of that, and the
 * re-run that did it would be a routine one.
 *
 * So: to change a name, a picture, or a post in production, change it in the app. This file is
 * not how.
 *
 * ── Why there are posts here at all ──────────────────────────────────────────
 *
 * This file used to write none, on the principle that the first post in production should be
 * one somebody actually writes. That principle was about *invented* content, and it still
 * holds: nothing below is written by us. The corpus is six real announcements transcribed from
 * the parish's existing platform, kept in the priest's own wording and stamped with their
 * original dates, so a tester opening the app finds a parish rather than an empty state or a
 * page of lorem ipsum. They are the same posts he would have had to paste in by hand.
 *
 * Each carries an explicit `launch-N` id rather than a cuid, and that is the whole idempotency
 * story: re-running upserts the same six rows instead of appending six more, a run interrupted
 * mid-upload can simply be repeated, and `DELETE FROM post WHERE id LIKE 'launch-%'` undoes the
 * corpus exactly — none of which a set of generated ids would allow.
 *
 * ── Idempotent, additive, and never destructive ──────────────────────────────
 *
 * There is no `deleteMany` anywhere in this file, and there must never be one. The dev seed
 * has several — it owns its fixture ids and replaces them wholesale — which is exactly why
 * the two are separate files rather than one file with a flag.
 *
 * Requires SUPABASE_SECRET_KEY: creating auth users and writing to Storage are both admin
 * operations.
 */

import "dotenv/config"

import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

import { describeDatabase } from "../scripts/db-target.mjs"
import {
    handleFromEmail,
    prisma,
    provisionAuthUser,
    supabaseAdmin,
    upsertMembership,
} from "./seed-lib.js"

/* Keep in step with `src/lib/server/storage.js` and the `PURPOSES` table in
 * `uploads.service.js` — this file is plain Node run outside Next, so it cannot import through
 * the `@/` alias, and an object must land under the same prefix `isOwnedUrl` checks or a later
 * edit made *in the app* would reject the seed's own media as somebody else's. The three
 * prefixes are not interchangeable: `avatars/` is keyed by a profile id and `orgs/` by a group
 * id, so which folder a file goes in is what makes "whose is this" answerable from the path. */
const BUCKET = "media"
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed-assets")

/* ── The group ───────────────────────────────────────────────────────────────
 *
 * `slug` is the natural key and the only field here that is not editable in the app, so it is
 * the only one this file can safely be authoritative about. Everything else is a *creation*
 * default — see the header. */
const ORG = {
    slug: "holy-trinity-cathedral",
    name: "Holy Trinity Cathedral",
    kind: "PARISH",
    bio: "Announcements, feasts, and parish life.",
    avatar: "holy-trinity-cathedral.png",
}

/* ── The two accounts ─────────────────────────────────────────────────────────
 *
 * Both ADMIN of the Cathedral, and both platform OWNER. Those are different things and the
 * seed asserts them separately because they mean different things: ADMIN is per-group and
 * lets them publish into the Cathedral and manage its roster; OWNER is the subscriber's axis
 * and lets them create further groups and delete the ones they create. Two of each means
 * neither person is a single point of failure.
 *
 * **These two are the bootstrap owners, and this file is not how anyone else becomes one.**
 * A new parish priest who subscribes is granted OWNER with `npm run owner -- <email>`, which
 * provisions his account if he has none — no deploy, no edit here. This list stays at two.
 *
 * `vocation` is who someone is, `role` is what they may do inside a group, `platformRole` is
 * what they may do to the platform, and `owns` is which group is theirs. All four are
 * independent — Fr. Alexander is a PRIEST who administers the Cathedral and owns it; Robert is
 * FAITHFUL, administers it too, and can create groups of his own without being able to delete
 * this one. Collapsing any two of them into one field is the mistake the schema's header
 * exists to prevent. */
const PEOPLE = [
    {
        email: "ajkoranda@gmail.com",
        firstName: "Alexander",
        lastName: "Koranda",
        /* How he is addressed. Content, so it is written once on create and never again —
         * a priest who shortens it to "Fr. Alexander" from /settings/info must not have it
         * put back by the next run. */
        displayName: "Priest Alexander",
        vocation: "PRIEST",
        role: "ADMIN",
        platformRole: "OWNER",
        /* Uploaded on his behalf, and only ever when the column is still empty — the first
         * thing he changes from /settings/info would otherwise be undone by the next re-run. */
        avatar: "alexander-koranda.png",
        /* Owns the Cathedral itself — `Organization.createdById`. Both people here are
         * platform OWNERs, which is the right to create groups; this is the narrower fact of
         * which group is *theirs*, and it is what decides who may delete it. It is a parish,
         * and it is his. */
        owns: true,
        /* The launch corpus is his writing, so it is published under his byline. The feed
         * derives its check from `Membership.role == ADMIN` in the post's group, which the
         * loop below has already guaranteed. */
        authorsLaunchPosts: true,
    },
    {
        email: "rob@blackboxstudios.com",
        firstName: "Robert",
        lastName: "Paul",
        vocation: "FAITHFUL",
        role: "ADMIN",
        platformRole: "OWNER",
    },
]

/* ── The launch corpus ────────────────────────────────────────────────────────
 *
 * Six real announcements, newest first. See the header for why they are here and why the ids
 * are fixed.
 *
 * `createdAt` is the original post's timestamp, not now(). The feed is keyset-paginated on
 * `(createdAt DESC, id DESC)`, so stamping all six with the same import time would leave their
 * order decided by the id tiebreak alone, and the relative dates a reader sees ("3 weeks ago")
 * are half of what makes a feed look lived-in rather than bulk-loaded.
 *
 * Two posts carry no `media`, and that is the source's shape rather than an omission: their
 * only image there is a header graphic the platform serves from a session-gated path. They
 * land as text announcements, which the feed draws as its own card shape anyway — so the
 * corpus exercises both card kinds, which a set of six photo posts would not. */
const POSTS = [
    {
        id: "launch-01",
        title: "Community Life | Announcements",
        createdAt: "2026-09-03T20:49:25Z",
        body: `Miraculous Hawaiian Icon - HTC will once again have the honor of hosting the Wonderworking Iveron Hawaiian Icon of the Mother of God at our parish this Monday. We will have a Divine Liturgy at 9:30a and then an akathist with anointing.
This is a great honor for our parish and a gift that she will be able to stop by while she is in Chicago for just a few days. This will be a wonderful way to celebrate the forefeast and to start the celebration of the Nativity of the Mother of God.

Great Feast - This Monday evening and Tuesday morning is the very first feast of the new year, the Nativity of the Most Holy Theotokos. Please make an effort to begin this new year right with attending the birthday celebration of our Holy Mother.

Church School Begins - This Sunday HTC will kick off our Church School year with a prayer service after liturgy and a picnic. We want to especially thank our coordinator, our teachers, and our parents for getting things ready and putting on the our coming picnic to celebrate the new year.

Giving - September is stewardship month at HTC and pledge cards will be sent out to HTC households in the coming weeks.
This past week several people have shared with me that they were able to increase their giving or even return to their normal giving after running into some difficult times. I always find this to be inspiring and an example of good stewardship.

Baptism - Lidiya Oneill will be baptized this Saturday, September 5, at 10a. Everyone is welcome to participate in the joy of our parish as we receive one our children into the Holy Orthodox Church.

Meal Train - Congratulations to the Duran Family!

Funeral - The funeral for Michael Kolosovsky will begin at 10a on Thursday, September 10. May his memory be eternal.`,
        media: ["hawaiian-icon-visit.jpg", "service-schedule.jpg"],
    },
    {
        id: "launch-02",
        title: "ARCHPASTORAL LETTER - Beginning of the Ecclesiastical Year 2026",
        createdAt: "2026-08-28T17:00:00Z",
        body: `ARCHPASTORAL LETTER OF THE MOST REVEREND DANIEL

Archbishop of Chicago and the Midwest
to the Reverend Clergy, Monastics, and Faithful of the Diocese of the Midwest
at the Beginning of the Ecclesiastical Year 2026

Beloved Clergy, Venerable Monastics, and dearly Beloved Faithful in Christ:

Glory to Jesus Christ!

As we approach the beginning of the new Ecclesiastical Year on September 1, the Holy Church once again invites us to enter the sacred rhythm of her liturgical life. Unlike the passing measures of secular time, the Church's year is not merely a succession of days and months. It is an unfolding season of grace, in which the saving works of our Lord Jesus Christ are made present to us through prayer, worship, fasting, feasting, repentance, and thanksgiving.

This annual cycle of fasts and feasts is a precious gift. Through it, the Church gathers our scattered lives and directs them toward the Kingdom of God. We celebrate the Nativity of Christ, His Holy Theophany, His life-giving Passion and Resurrection, His glorious Ascension, and the descent of the Holy Spirit at Pentecost. We honor the Most Holy Theotokos and Ever-Virgin Mary, the holy Apostles, Martyrs, Hierarchs, Monastics, and all the Saints. Their commemorations remind us that holiness is not an abstract ideal but the true vocation of every Christian.

The fasts of the Church likewise call us back to what is essential. By abstaining from certain foods and indulgences, we learn to restrain the passions, deepen our prayer, give generously to those in need, seek reconciliation, and hunger more earnestly for God. Fasting is never an end in itself, nor is it merely a matter of dietary observance. Joined to repentance, mercy, and participation in the sacramental life, it becomes a path toward spiritual freedom and renewed communion with Christ.

The feasts teach us to receive life with gratitude and joy. Yet Christian joy is not an escape from suffering. It is the fruit of Christ's victory over sin and death. Every feast reveals some aspect of this victory, while every fast prepares the heart to receive it. Together, the fasts and feasts form a school of discipleship, shaping us gradually into the likeness of our Savior.

I therefore urge the clergy, monastics, and faithful of our Diocese to begin this Ecclesiastical Year with renewed dedication. Let us order our homes and daily schedules according to the life of the Church. Let us participate faithfully in the Divine Liturgy and the appointed services, observe the fasts with discernment, receive the Holy Mysteries with proper preparation, read the Holy Scriptures, and establish a consistent rule of daily prayer.

Let our spiritual and churchly practice also bear visible fruit in works of mercy. May every parish and mission community within our God-protected Diocese strengthen its care for the poor, the lonely, the grieving, the displaced, and all who struggle in body or soul. A calendar filled with holy days profits us little if our hearts remain closed to our neighbors. The grace we receive in worship must extend into our families, workplaces, communities, and the whole creation entrusted to our stewardship.

To my beloved clergy, my brothers and co-laborers in this Vineyard: teach the faithful the meaning of the liturgical cycle with patience and pastoral sensitivity. Invite them not only to know the calendar but to live by and keep it. Make the divine services accessible, beautiful, and prayerful. Encourage frequent confession and worthy reception of Holy Communion. Above all, lead by your own example of humility, fidelity, hospitality, and love.

To parents and families: make your homes little churches. Mark the feasts with prayer, give places of honor to the holy icons, sing the Church's hymns, share meals, and live your family lives with acts of kindness and generosity. Teach children that the Church's seasons are not burdens imposed upon life but gifts that reveal life's deepest meaning. In this way, the faith will be handed on not merely as information, but as a living inheritance.

Beloved in Christ, each new Ecclesiastical Year is both a gift and a summons. The time given to us is precious, and its fulfillment is found in Christ. Let us not allow this year to pass without bearing spiritual fruit. May every fast soften our hearts, every feast enlarge our joy, every divine service deepen our communion, and every day become an offering of thanksgiving to God.

At the beginning of this new Church year, I ask you to join me in praying:

O Lord, bless the crown of the year with Thy goodness. Grant peace to Thy Church, strength to Thy people, wisdom to our leaders, healing to the afflicted, consolation to the sorrowful, peace to the world, and mercy to us all. Guide us through every season of fasting and feasting, that we may grow in repentance, faith, hope, and love, and at last enter the unending Day of Thy Kingdom.

Through the prayers of the Most Holy Theotokos, specially venerated in her sacred Tikhvin icon, of our holy fathers and mothers, and of all the saints, may the blessing of the Lord rest upon the clergy, monastics, faithful, parishes, missions, institutions, and families of the Diocese of the Midwest throughout the coming Ecclesiastical Year.

With my archpastoral love and blessings in Christ,

DANIEL
Archbishop of Chicago and the Midwest`,
        media: [],
    },
    {
        id: "launch-03",
        title: "New Parishioner - Congratulations!",
        createdAt: "2026-08-24T00:38:32Z",
        body: "Alexandra Jane Duran, born 8/23/26 at 12:27pm, 8lb 2oz and 20in. Congratulations, Duran Family.",
        media: ["alexandra-duran.jpg"],
    },
    {
        id: "launch-04",
        title: "Reader Justinian Tatooles, HTC Seminarian",
        createdAt: "2026-08-22T23:00:12Z",
        body: `In recent years the Cathedral has experienced many blessings and even fruits from our labor to God. This community has recently produced a monastic, and now, our Cathedral offers the Church a seminarian. These are all signs of God's blessings and grace that is present at our Cathedral. He is sending His children to our community, and then calling them into deeper service to His Church.

Rdr. Justin will be heading to St. Tikhon's Seminary this coming week continuing his efforts to serve the Lord. Like the Holy Apostles, Justin is leaving his familiar place, his comforts, his life that he loves here in Chicago, to serve the Lord. He is fully dedicating himself not simply to studying the teachings of the Church, but also to engage in the deeper meanings of the spiritual life and focus on his relationship with the Lord.

This is a great honor for our parish. We have not had a seminarian in recent memory, but now Justin will represent our beloved Cathedral and forever be one of our seminarians.

HTC will be offing financial support to Justin for the next three years out of our charity budget. Each semester we will make an offering directly to the seminary to help offset some of Justin's tuition. The Archbishop has requested this of his parishes sending seminarians, and it is a worthy cause to support the future vocations and leaders of our Church.

This will be Justin's last weekend with us. Please be sure to remember him in your prayers.`,
        media: [],
    },
    {
        id: "launch-05",
        title: "Feast of St. Herman",
        createdAt: "2026-08-11T21:00:00Z",
        body: `Archbishop leads the celebration of St. Herman of Alaska in Chicago.

https://domoca.org/archbishop-leads-celebration-of-st-herman-of-alaska-in-chicago/`,
        media: [
            "st-herman-1.jpg",
            "st-herman-2.jpg",
            "st-herman-3.jpg",
            "st-herman-4.jpg",
            "st-herman-5.jpg",
            "st-herman-6.jpg",
        ],
    },
    {
        id: "launch-06",
        title: "Cathedral Summer Educational Series",
        createdAt: "2026-08-11T20:00:00Z",
        /* The original names three teachers with @mentions of their accounts on the platform
         * this was transcribed from. Those handles resolve to nobody here, so they are written
         * out as plain names: a dead @mention reads as a bug in the app rather than as a
         * thank-you, and inventing the accounts to make them resolve would be exactly the
         * fabricated content this file refuses to write. */
        body: `During the summer, many parishes slow activities and ministries down, but at the Cathedral we were able to offer many opportunities for worship, service to others, and education. I am personally impress in regard to the educational opportunities that were offered over these past several months and I want to thank our leaders for preparing and teaching these sessions.

Weekly Bible Study - Rdr. Justinian - These weekly bible studies have been offered consistently drawing a dedicated group who studied Holy Scripture and the teachings of the Church Fathers. Thank you Rdr. Justinian for offering these classes and your gift to us at the Cathedral. Last Bible Study for the season - August 18

Apostles Fast Study and Dormition Fast Study - Fr. Thomas - During each fasting period the Cathedral offers a chance for parishioners to come together and learn about various topics. Fr. Thomas leads these sessions and offers us to engage with the teaching of our Church during these periods of fasting. Thank you, Father. Last Dormition Study for the season - August 12

Catechism - George Krstev - Starting All Saints Sunday, HTC has consistently offered catechism classes on the 2nd and 4th Sunday of the month. This offers an opportunity for parishioners, but also the many inquires who walk through our doors, to learn and ask questions about the faith. This an important offering to have at such a time when many are looking into Orthodoxy. Thank you George. Last Catechism for the season - never`,
        media: ["summer-education-series.jpg", "summer-education-1.jpg", "summer-education-2.jpg"],
    },
]

/**
 * Uploads one file from `prisma/seed-assets` and returns its public URL and pixel size.
 *
 * **The bytes are checked in rather than fetched.** A seed that pulled its images off somebody
 * else's CMS at run time would be a production seed whose success depended on a third party
 * being up and not having reorganised their uploads, and it would go quietly wrong — a 404 body
 * written as an image — rather than loudly. Three megabytes in the repository buys a seed that
 * produces the same database on any machine, offline, forever.
 *
 * `width`/`height` come from `sharp` reading the actual bytes, because `PostMedia` uses them to
 * reserve the card's aspect-ratio box before the image decodes; a wrong number here is a layout
 * shift on every cold load. Avatars are square and ignore them.
 */
/* The parish's standing rota, and deliberately the only one.
 *
 * **Coffee hour is the one that fits the model as it stands.** The other two the Cathedral runs
 * do not, for two different reasons, and seeding them would be shipping a wrong answer:
 *
 *  - **The Cathedral's kitchen is open to people outside the parish.** Everything here is
 *    scoped to an APPROVED membership — `requireMembership` gates the sheet, the slot and the
 *    claim — so a volunteer who is not in the group cannot see it, let alone take a date. That
 *    is not a gap to seed around: it is a question about who a sign-up sheet is for, and it
 *    wants an answer (a public rota? a guest membership? a link that admits?) before it wants a
 *    fixture.
 *  - **Do Division is a one-off.** A festival weekend is published when it is being run and
 *    removed when it is over, which is a thing a priest does in the app rather than a thing a
 *    seed asserts. Seeding it would put a dead weekend on the surface every time this ran.
 *
 * `repeats` is what makes it match the parish: coffee hour is every Sunday and does not stop,
 * so the sheet is topped up to the horizon on every read rather than running out of Sundays.
 * See `topUpRecurring`. */
const ROTA = {
    id: "prod-rota-coffee-hour",
    title: "Coffee hour",
    description:
        "Bring something for after Liturgy. Nothing that needs cooking on site, and please label anything with nuts in it.",
    /* The Cathedral's clock. Written down rather than taken from whichever machine runs the
     * seed, because the dates it generates are the parish's and a laptop in another timezone
     * would put coffee hour at the wrong hour for everybody. */
    timezone: "America/Chicago",
    /* Sunday. `Date.prototype.getDay()`'s numbering, which is what the generator uses. */
    weekday: 0,
    startMinutes: 11 * 60,
    endMinutes: 12 * 60 + 30,
    capacity: 1,
    /* Enough Sundays to be useful on the first day; `topUpRecurring` keeps it stocked from
     * then on, so this number is a starting point rather than a limit. */
    weeks: 8,
}

/* Writes the rota, or leaves the existing one alone.
 *
 * The existence check is on the id, exactly as `ensurePost`'s is, and it does the same job: once
 * this sheet is in the table nothing here looks at its title, its times or its dates again — so
 * a capacity the priest raised, a date he cancelled and a description he rewrote all survive
 * every future run. This file guarantees the rota *exists*; what is on it belongs to the parish.
 */
const ensureRota = async ({ org, author }) => {
    if (await prisma.signupSheet.findUnique({ where: { id: ROTA.id }, select: { id: true } })) {
        return "already present"
    }

    /* The first Sunday on or after today, then one a week. Stepped as *dates* with the time of
     * day applied to each — never by adding seven days to an instant, which walks an hour off
     * on the Sunday the clocks change. Same rule `generateSlots` follows, and the reason
     * `timezone` is on the sheet at all. */
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const first = new Date(today)
    first.setDate(today.getDate() + ((ROTA.weekday - today.getDay() + 7) % 7))

    const slots = Array.from({ length: ROTA.weeks }, (_, week) => {
        const day = new Date(first)
        day.setDate(first.getDate() + week * 7)
        const startsAt = new Date(day)
        startsAt.setMinutes(ROTA.startMinutes)
        const endsAt = new Date(day)
        endsAt.setMinutes(ROTA.endMinutes)
        return { startsAt, endsAt, capacity: ROTA.capacity }
    })

    await prisma.signupSheet.create({
        data: {
            id: ROTA.id,
            orgId: org.id,
            title: ROTA.title,
            description: ROTA.description,
            timezone: ROTA.timezone,
            repeats: true,
            createdById: author.id,
            slots: { create: slots },
        },
    })

    return `created with ${slots.length} Sundays`
}

const uploadAsset = async (supabase, { file, prefix, ownerId }) => {
    const bytes = await readFile(path.join(ASSETS, file))
    const { width, height, format } = await sharp(bytes).metadata()

    const mimeType = format === "png" ? "image/png" : "image/jpeg"
    const objectPath = `${prefix}/${ownerId}/${randomUUID()}.${format === "png" ? "png" : "jpg"}`

    /* `upsert` so a re-run that got as far as the object but not as far as the row is a repeat
     * rather than a conflict. The path holds a fresh uuid every time, so this never overwrites
     * an object anybody is already serving. */
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, bytes, { contentType: mimeType, upsert: true })

    if (error) throw new Error(`${file}: ${error.message}`)

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath)
    return { url: data.publicUrl, width, height, mimeType }
}

/**
 * Creates the profile if it is absent; otherwise fills only what is still empty.
 *
 * The `existing` branch is the whole safety property of this file. It never assigns a value
 * over one that is already there — so a handle chosen at /welcome, a name corrected by its
 * owner, or a vocation changed after an ordination all survive every future run. What it
 * does repair is a *missing* value, which can only be there because orientation has not
 * happened yet.
 *
 * **Two fields are exceptions and are asserted every run, because neither is display.**
 * `email` is the address the sign-in code goes to and must keep matching the Supabase user
 * this profile mirrors. `platformRole` is access of the same kind the memberships below are:
 * it is what lets these two create the next group, and repairing it without a working sign-in
 * is exactly what this file is for. Re-running therefore restores ownership if it was ever
 * cleared — which is the intended behaviour for the two bootstrap accounts and the reason
 * every other owner is granted by `npm run owner` instead of by being added here.
 */
const ensureProfile = async (supabase, person) => {
    const id = await provisionAuthUser(supabase, person)
    const existing = await prisma.profile.findUnique({ where: { id } })

    if (!existing) {
        const profile = await prisma.profile.create({
            data: {
                id,
                email: person.email,
                handle: handleFromEmail(person.email),
                firstName: person.firstName,
                lastName: person.lastName,
                displayName: person.displayName ?? null,
                vocation: person.vocation,
                platformRole: person.platformRole,
            },
        })
        return { profile, created: true }
    }

    /* Only the gaps, plus the two asserted fields above. An empty string counts as a gap;
     * `null` is what the column actually holds before orientation, but a blank saved through
     * a form is the same absence. */
    const fill = {}
    if (!existing.firstName) fill.firstName = person.firstName
    if (!existing.lastName) fill.lastName = person.lastName
    if (!existing.displayName && person.displayName) fill.displayName = person.displayName
    if (existing.email !== person.email) fill.email = person.email
    if (existing.platformRole !== person.platformRole) fill.platformRole = person.platformRole

    const profile = Object.keys(fill).length
        ? await prisma.profile.update({ where: { id }, data: fill })
        : existing

    return { profile, created: false, filled: Object.keys(fill) }
}

/**
 * Uploads a picture for a row that has none, and reports what it did.
 *
 * Deliberately a no-op when `avatarUrl` already holds anything at all. A picture is content by
 * the header's rule: the moment Fr. Alexander changes his from /settings/info, or an admin
 * changes the parish's from Settings → Groups, this file must never put the seed's back. That
 * also means the upload itself is skipped, not just the write — an object nobody will ever
 * reference is litter in the bucket.
 */
const ensureAvatar = async (supabase, { current, file, prefix, ownerId, apply }) => {
    if (!file) return "no picture in the seed"
    if (current) return "already set"

    const { url } = await uploadAsset(supabase, { file, prefix, ownerId })
    await apply(url)
    return "uploaded"
}

/**
 * Writes one launch post, or leaves the existing one alone.
 *
 * The existence check is on the id rather than on the content, which is what makes an edited
 * post safe: once `launch-03` is in the table this never looks at its title or body again, so
 * a typo the priest fixed in the app stays fixed.
 */
const ensurePost = async (supabase, { post, org, author }) => {
    if (await prisma.post.findUnique({ where: { id: post.id }, select: { id: true } })) {
        return "already present"
    }

    const media = []
    for (const [position, file] of post.media.entries()) {
        const { url, width, height, mimeType } = await uploadAsset(supabase, {
            file: path.join("posts", file),
            prefix: "posts",
            ownerId: org.id,
        })
        media.push({ kind: "IMAGE", url, width, height, mimeType, position })
    }

    await prisma.post.create({
        data: {
            id: post.id,
            orgId: org.id,
            authorId: author.id,
            title: post.title,
            body: post.body,
            createdAt: new Date(post.createdAt),
            media: { create: media },
        },
    })

    return `created with ${media.length} photo${media.length === 1 ? "" : "s"}`
}

const main = async () => {
    console.log(`\n→ database: ${describeDatabase()}`)
    console.log("→ seed:     PRODUCTION (one group, two admins/owners, the launch posts)\n")

    const supabase = supabaseAdmin()

    /* People first, because the group needs an owner and an owner is a profile id. This pass
     * only resolves the profiles — the memberships cannot be written until the group exists,
     * so those happen below. */
    const people = []
    for (const person of PEOPLE) {
        people.push({ person, ...(await ensureProfile(supabase, person)) })
    }

    /* Who the parish belongs to: the priest whose parish it is, named by `owns` in PEOPLE —
     * not whoever happens to run this script, and not both admins. `Organization.createdById`
     * holds one id, and `canDeleteOrg` reads it as the subscription boundary; a parish with two
     * people able to delete it is not a boundary. Robert administers the Cathedral and can
     * publish, invite and rename; retiring it is Fr. Alexander's alone. */
    const ownerId = people.find(({ person }) => person.owns)?.profile.id

    /* The group. `update: {}` is not an oversight — it is the "content is written once" rule
     * in one line, so a rename done in the app outlives every re-run. `avatar` is dropped from
     * the create because it names a file rather than a column; the picture is uploaded below,
     * once the row exists and there is an id to file it under. */
    const { avatar: orgAvatar, ...orgFields } = ORG
    const org = await prisma.organization.upsert({
        where: { slug: ORG.slug },
        update: {},
        create: { ...orgFields, createdById: ownerId },
    })

    /* Ownership is repaired, never reassigned. A row created before this column existed
     * carries a null creator and can be deleted by nobody, which is a parish nobody can
     * retire; filling that gap is the same kind of thing as asserting a membership. An
     * existing value is left strictly alone, so ownership handed over in the future is not
     * dragged back to this file's answer on the next run. */
    if (!org.createdById && ownerId) {
        await prisma.organization.update({
            where: { id: org.id },
            data: { createdById: ownerId },
        })
        org.createdById = ownerId
        console.log(`  repair   set owner on ${org.slug}`)
    }

    const owner = people.find(({ profile }) => profile.id === org.createdById)
    console.log(`  group    ${org.name} (@${org.slug})  owner: ${owner?.person.email ?? "none"}`)

    for (const { person, profile, created, filled } of people) {
        await upsertMembership(profile.id, org.id, { role: person.role, status: "APPROVED" })

        const note = created
            ? "created"
            : filled?.length
              ? `filled ${filled.join(", ")}`
              : "already present"
        console.log(`  admin    ${person.email.padEnd(26)} @${profile.handle.padEnd(14)} ${note}`)
    }

    /* Pictures, after the memberships, because both uploads need an id that exists and the
     * group's is an act of administration the loop above has just guaranteed. */
    console.log("")
    console.log(
        `  picture  ${org.slug.padEnd(26)} ${await ensureAvatar(supabase, {
            current: org.avatarUrl,
            file: orgAvatar,
            prefix: "orgs",
            ownerId: org.id,
            apply: (avatarUrl) =>
                prisma.organization.update({ where: { id: org.id }, data: { avatarUrl } }),
        })}`,
    )

    for (const { person, profile } of people) {
        const note = await ensureAvatar(supabase, {
            current: profile.avatarUrl,
            file: person.avatar,
            prefix: "avatars",
            ownerId: profile.id,
            apply: (avatarUrl) =>
                prisma.profile.update({ where: { id: profile.id }, data: { avatarUrl } }),
        })
        console.log(`  picture  ${person.email.padEnd(26)} ${note}`)
    }

    /* The corpus, last, because a post needs the group, an author, and that author's ADMIN
     * membership — all three of which are now in place. */
    const author = people.find(({ person }) => person.authorsLaunchPosts)?.profile
    if (!author) throw new Error("No launch-post author in PEOPLE.")

    console.log("")
    for (const post of POSTS) {
        const note = await ensurePost(supabase, { post, org, author })
        console.log(`  post     ${post.id}  ${post.title.slice(0, 40).padEnd(40)} ${note}`)
    }

    const rota = await ensureRota({ org, author })
    console.log(`  rota     ${ROTA.id}  ${ROTA.title.padEnd(40)} ${rota}`)

    /* Counted rather than assumed. If this prints anything other than the two admins and the
     * six posts, the database is not in the state this file describes and somebody should know
     * before the parish does. */
    const [members, admins, posts, rotas, orgs] = await Promise.all([
        prisma.membership.count({ where: { orgId: org.id, status: "APPROVED" } }),
        prisma.membership.count({ where: { orgId: org.id, status: "APPROVED", role: "ADMIN" } }),
        prisma.post.count({ where: { orgId: org.id, deletedAt: null } }),
        prisma.signupSheet.count({ where: { orgId: org.id, deletedAt: null } }),
        prisma.organization.count(),
    ])

    console.log(
        `\n✓ ${org.name}: ${members} members, ${admins} admins, ${posts} posts, ${rotas} sign-up sheet${rotas === 1 ? "" : "s"}`,
    )
    console.log(`  ${orgs} group${orgs === 1 ? "" : "s"} in the database.`)

    if (orgs > 1) {
        console.warn(
            "\n! More than one group exists. That is expected only if the dev seed has been\n" +
                "  run against this database, or a second parish has been onboarded. Check\n" +
                "  before launching.",
        )
    }

    console.log("\n  Both admins sign in with the emailed code — no password to distribute.")
}

main()
    .catch((error) => {
        console.error("\n✗ Production seed failed:", error.message)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
