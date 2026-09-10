import "server-only"

import { prisma } from "@/lib/db"
import { MAX_ENVELOPE_BYTES } from "@/lib/constants"
import { isAdult } from "@/lib/utils"
import { readableOrgIds } from "@/lib/server/auth"
import { keysetOrder, keysetPage, keysetWhere } from "@/lib/server/cursor"
import { conflict, forbidden, invalid, notFound } from "@/lib/server/errors"
import { pushMessage } from "@/lib/server/notifications.service"
import { projectPerson } from "@/lib/server/projections"

/* Direct messages: the E2EE relay, the key directory, and the request gate.
 *
 * ── What the server is, and pointedly is not ─────────────────────────────────
 *
 * This service never sees a message. A `Message` row is an event with per-device
 * `MessageEnvelope` ciphertexts hanging off it, produced by the Signal protocol in
 * `src/lib/crypto` — the server relays them, stores them for devices that were
 * asleep, and pushes "something arrived". There is deliberately no plaintext column,
 * no snippet, no search index and no moderation hook to grow one; anything here that
 * wanted the text would be the seam that unravels the whole promise.
 *
 * What the server *does* own is the social layer around the ciphertext, and every
 * rule of it is enforced in this file, not in the client:
 *
 *  - **Who may message whom.** One shared APPROVED group — the `visibleProfile`
 *    boundary again — re-checked on every read and every send (`sharesGroup`), so a
 *    revoked membership bites here exactly as it does on the feed. Both parties 18 or
 *    older (`requireAdult`; a minor neither appears in the contact list nor can be
 *    opened a thread to, and every endpoint refuses them as a caller). No
 *    `MessageBlock` between the pair.
 *  - **The request gate.** A recipient who does not follow the opener starts
 *    unaccepted (`ConversationParticipant.acceptedAt` null): they can read what
 *    arrived, but cannot reply until they accept, and the opener is never told
 *    whether the request was even seen.
 *  - **The key directory.** Prekey bundles are served only within the boundary
 *    above, and a one-time prekey is consumed under `FOR UPDATE SKIP LOCKED` so two
 *    concurrent senders cannot be handed the same one.
 *
 * ── Unread, and why the panel is untouched ───────────────────────────────────
 *
 * A message writes no `Notification` row. The panel is the app's record of social
 * events, per person and readable forever; an inbox's unread state is a cursor
 * (`lastReadAt`) against a moving list, and the two would model the same fact twice
 * in different shapes. The badge is `unreadConversations`, folded into the unread
 * endpoint the chrome already polls, so messaging adds no request to the boot path. */

const CONVERSATION_LIMIT = 100
const MESSAGE_PAGE = 50

/* ---------------------------------------------------------------------------
 * Gates
 * ------------------------------------------------------------------------- */

/* 403 rather than 404: the feature's existence is not a secret, and the client hides
 * the entrance anyway — this is the backstop for a crafted request, not a message
 * anybody is meant to read. */
const requireAdult = (viewer) => {
    if (!isAdult(viewer.birthday)) {
        throw forbidden("Messaging is available to adults only.")
    }
    return viewer
}

/* The other person, as `openConversation` and the contact list must see them: visible
 * (one shared APPROVED group), adult, and not behind a block in either direction.
 * 404 for the invisible and the minor — indistinguishable from not existing, which is
 * the point — and 403 only for a block, where the pair already know each other. */
const messageableProfile = async (viewer, profileId) => {
    if (!profileId || profileId === viewer.id) throw notFound("Person not found.")

    const profile = await prisma.profile.findUnique({
        where: { id: profileId },
        include: {
            memberships: { where: { status: "APPROVED" }, select: { orgId: true } },
        },
    })
    if (!profile) throw notFound("Person not found.")

    const mine = new Set(readableOrgIds(viewer))
    const shared = profile.memberships.some((membership) => mine.has(membership.orgId))
    if (!shared) throw notFound("Person not found.")
    if (!isAdult(profile.birthday)) throw notFound("Person not found.")

    const block = await prisma.messageBlock.findFirst({
        where: {
            OR: [
                { blockerId: viewer.id, blockedId: profile.id },
                { blockerId: profile.id, blockedId: viewer.id },
            ],
        },
        select: { blockerId: true },
    })
    /* One message for both directions, so the refusal never says who blocked whom. */
    if (block) throw forbidden("You can't message this person right now.")

    return profile
}

/* ---------------------------------------------------------------------------
 * The key directory
 * ------------------------------------------------------------------------- */

const B64ISH = /^[A-Za-z0-9+/=]+$/
const isKey = (value, max = 128) =>
    typeof value === "string" && value.length > 0 && value.length <= max && B64ISH.test(value)

/* Registers (or refreshes) the caller's device: the public bundle strangers will
 * start sessions from. An upsert keyed by the client-minted device id.
 *
 * The one-time pool is **append-only from here**: rows leave only by being consumed
 * (`bundlesFor`), and a registration adds the keys the client has minted since its
 * last one (`skipDuplicates` absorbs any overlap). It must never be a replace — a
 * key consumed by a sender whose PREKEY envelope has not yet reached the device
 * still exists in the client's local pool, and re-inserting it here would hand the
 * same key to a second sender, whose first message would then be unreadable once
 * the first sender's arrival burned the private half. */
export const registerCryptoDevice = async (viewer, payload) => {
    requireAdult(viewer)

    const {
        deviceId,
        registrationId,
        identityKey,
        signedPreKeyId,
        signedPreKey,
        signedPreKeySignature,
        oneTimePreKeys,
    } = payload ?? {}

    if (typeof deviceId !== "string" || !/^[0-9a-f-]{36}$/i.test(deviceId)) {
        throw invalid("That device registration is not usable.", { deviceId: "Invalid" })
    }
    if (!Number.isInteger(registrationId) || registrationId < 1 || registrationId > 16380) {
        throw invalid("That device registration is not usable.", { registrationId: "Invalid" })
    }
    if (!isKey(identityKey) || !isKey(signedPreKey) || !isKey(signedPreKeySignature)) {
        throw invalid("That device registration is not usable.", { keys: "Invalid" })
    }
    if (!Number.isInteger(signedPreKeyId) || signedPreKeyId < 1) {
        throw invalid("That device registration is not usable.", { signedPreKeyId: "Invalid" })
    }
    const pool = Array.isArray(oneTimePreKeys) ? oneTimePreKeys.slice(0, 200) : []
    for (const preKey of pool) {
        if (!Number.isInteger(preKey?.keyId) || preKey.keyId < 1 || !isKey(preKey?.key)) {
            throw invalid("That device registration is not usable.", { oneTimePreKeys: "Invalid" })
        }
    }

    const existing = await prisma.cryptoDevice.findUnique({ where: { id: deviceId } })
    /* A device id is minted by its install and never changes hands. A registration
     * naming somebody else's is either a uuid collision or an attempt to receive
     * their envelopes; both are refused. */
    if (existing && existing.profileId !== viewer.id) {
        throw conflict("That device is registered to another account.")
    }

    const device = {
        profileId: viewer.id,
        registrationId,
        identityKey,
        signedPreKeyId,
        signedPreKey,
        signedPreKeySignature,
    }

    await prisma.$transaction([
        prisma.cryptoDevice.upsert({
            where: { id: deviceId },
            create: { id: deviceId, ...device },
            update: device,
        }),
        ...(pool.length
            ? [
                  prisma.oneTimePreKey.createMany({
                      data: pool.map(({ keyId, key }) => ({ deviceId, keyId, key })),
                      skipDuplicates: true,
                  }),
              ]
            : []),
    ])

    /* The server's live pool size, which is what the client tops up against — its own
     * count includes keys senders have already been handed. */
    const preKeyCount = await prisma.oneTimePreKey.count({ where: { deviceId } })
    return { deviceId, preKeyCount }
}

/* Prekey bundles for every device of one person — what a sender needs to start a
 * session with each. Consumes one one-time prekey per device, atomically under
 * `SKIP LOCKED` so concurrent senders get different keys or none (X3DH §2.2 allows
 * a bundle without one; the session is still sound, merely without the extra
 * forward-secrecy hedge on the first message).
 *
 * `exclude` is the asker's own device id, for the self case: your phone fetching
 * bundles for your laptop must not be handed one for itself. `only` narrows to the
 * devices the caller actually lacks a session with — a sender must not drain a key
 * for a device it can already reach. */
export const bundlesFor = async (viewer, profileId, { exclude, only } = {}) => {
    requireAdult(viewer)

    if (profileId !== viewer.id) await messageableProfile(viewer, profileId)

    const devices = await prisma.cryptoDevice.findMany({
        where: {
            profileId,
            ...(exclude ? { id: { not: exclude } } : {}),
            ...(only?.length ? { id: { in: only } } : {}),
        },
        orderBy: { createdAt: "asc" },
    })

    const bundles = []
    for (const device of devices) {
        /* One statement per device: pop the lowest unclaimed key, skipping rows
         * another sender holds locked. Devices per person are one or two, so the
         * loop is not a fan-out worth batching. */
        const [oneTime] = await prisma.$queryRaw`
            DELETE FROM one_time_pre_key
            WHERE device_id = ${device.id}
              AND key_id = (
                SELECT key_id FROM one_time_pre_key
                WHERE device_id = ${device.id}
                ORDER BY key_id
                LIMIT 1
                FOR UPDATE SKIP LOCKED
              )
            RETURNING key_id, key`

        bundles.push({
            deviceId: device.id,
            registrationId: device.registrationId,
            identityKey: device.identityKey,
            signedPreKeyId: device.signedPreKeyId,
            signedPreKey: device.signedPreKey,
            signedPreKeySignature: device.signedPreKeySignature,
            oneTimePreKeyId: oneTime?.key_id ?? null,
            oneTimePreKey: oneTime?.key ?? null,
        })
    }

    return { devices: bundles }
}

/* ---------------------------------------------------------------------------
 * Conversations
 * ------------------------------------------------------------------------- */

const participantInclude = {
    participants: {
        include: {
            profile: {
                select: {
                    id: true,
                    handle: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    vocation: true,
                    avatarUrl: true,
                    memberships: { where: { status: "APPROVED" }, select: { orgId: true } },
                    /* Device ids only — the addressing a sender encrypts for. Public
                     * bundle material stays behind `bundlesFor`, which is the endpoint
                     * that meters one-time prekeys. */
                    cryptoDevices: { select: { id: true } },
                },
            },
        },
    },
}

const projectMessage = (message) => ({
    id: message.id,
    senderId: message.senderId,
    senderDeviceId: message.senderDeviceId,
    at: message.createdAt.toISOString(),
    /* The one envelope addressed to the asking device, or null — a message sent
     * before this device existed, which the client renders as unreadable rather
     * than skipping (a hole that says "sent from before this install" is honest;
     * a silently shorter thread is a bug report). */
    envelope: message.envelopes?.[0]
        ? { type: message.envelopes[0].type, body: message.envelopes[0].body }
        : null,
})

const projectConversation = (conversation, viewer) => {
    const mine = conversation.participants.find((p) => p.profileId === viewer.id)
    const other = conversation.participants.find((p) => p.profileId !== viewer.id)
    const last = conversation.messages?.[0] ?? null

    return {
        id: conversation.id,
        createdById: conversation.createdById,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        accepted: Boolean(mine?.acceptedAt),
        /* Blurred-request rendering keys off this: someone else opened it and the
         * viewer has not accepted. */
        isRequest: !mine?.acceptedAt && conversation.createdById !== viewer.id,
        unread: Boolean(
            last &&
                last.senderId !== viewer.id &&
                (!mine?.lastReadAt || last.createdAt > mine.lastReadAt),
        ),
        other: other ? projectPerson(other.profile) : null,
        /* Every participant device, the sender's own included — the client drops its
         * own before encrypting. This is what lets a send skip the bundle endpoint
         * entirely once sessions exist. */
        targets: conversation.participants.flatMap((p) =>
            (p.profile.cryptoDevices ?? []).map((device) => ({
                deviceId: device.id,
                profileId: p.profileId,
            })),
        ),
        lastMessage: last ? projectMessage(last) : null,
    }
}

/* The inbox: newest-moving conversation first. Capped rather than paginated — a
 * parish's direct-message inbox is dozens of rows, not thousands, and `lastMessageAt`
 * moves with every send, which is exactly the unstable ordering keyset cursors are
 * warned against in `cursor.js`. */
export const listConversations = async (viewer, { deviceId }) => {
    requireAdult(viewer)

    const conversations = await prisma.conversation.findMany({
        where: { participants: { some: { profileId: viewer.id } } },
        include: {
            ...participantInclude,
            messages: {
                where: { deletedAt: null },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 1,
                include: { envelopes: deviceId ? { where: { deviceId } } : false },
            },
        },
        orderBy: { lastMessageAt: "desc" },
        take: CONVERSATION_LIMIT,
    })

    return {
        items: conversations
            .filter((conversation) => sharesGroup(viewer, conversation))
            .map((conversation) => projectConversation(conversation, viewer)),
        nextCursor: null,
    }
}

/* Opens (or returns) the 1:1 thread with one person. Idempotent on the pair, so two
 * taps race to one row; the loser of the race finds the winner's conversation. */
export const openConversation = async (viewer, { profileId }) => {
    requireAdult(viewer)
    const target = await messageableProfile(viewer, profileId)

    const existing = await prisma.conversation.findFirst({
        where: {
            orgId: null,
            AND: [
                { participants: { some: { profileId: viewer.id } } },
                { participants: { some: { profileId: target.id } } },
            ],
        },
        include: participantInclude,
    })
    if (existing) return projectConversation(existing, viewer)

    /* Following the opener is standing permission to be written to — the thread
     * arrives accepted and skips the request state entirely. */
    const followed = await prisma.follow.findUnique({
        where: {
            followerId_followingId: { followerId: target.id, followingId: viewer.id },
        },
        select: { followerId: true },
    })

    const now = new Date()
    const conversation = await prisma.conversation.create({
        data: {
            createdById: viewer.id,
            participants: {
                create: [
                    { profileId: viewer.id, acceptedAt: now },
                    { profileId: target.id, acceptedAt: followed ? now : null },
                ],
            },
        },
        include: participantInclude,
    })

    return projectConversation(conversation, viewer)
}

/* Whether the viewer still shares an APPROVED group with everyone else in a thread —
 * `messageableProfile`'s boundary, asked of a conversation that already exists.
 *
 * **Every path asks it, not just `sendMessage`.** Membership is re-read from the database
 * on every authorization decision everywhere else in this app precisely so that a
 * revocation bites on the next request; a thread that went on serving its history to
 * somebody who has left the parish would be the one place in the app where it did not.
 * Reading is the half that matters most here, because it is the half that keeps working
 * when the sending half has already started refusing.
 *
 * Costs nothing to ask: `participantInclude` already carries each participant's APPROVED
 * `orgId`s, which is the only reason that relation is selected at all. */
const sharesGroup = (viewer, conversation) => {
    const mine = new Set(readableOrgIds(viewer))
    return conversation.participants
        .filter((participant) => participant.profileId !== viewer.id)
        .every((participant) =>
            participant.profile.memberships.some((membership) => mine.has(membership.orgId)),
        )
}

/* The viewer's own participant row, or 404 — a conversation someone is not in must
 * be indistinguishable from one that does not exist. */
const requireParticipant = async (viewer, conversationId) => {
    const participant = await prisma.conversationParticipant.findUnique({
        where: {
            conversationId_profileId: { conversationId, profileId: viewer.id },
        },
    })
    if (!participant) throw notFound("Conversation not found.")
    return participant
}

/* One thread: its meta and a page of envelopes for the asking device, in a single
 * request — the shape the thread surface paints from. */
export const getConversation = async (viewer, conversationId, { deviceId, cursor, limit }) => {
    requireAdult(viewer)
    await requireParticipant(viewer, conversationId)

    const pageSize = limit ?? MESSAGE_PAGE
    const [conversation, rows] = await Promise.all([
        prisma.conversation.findUnique({
            where: { id: conversationId },
            include: participantInclude,
        }),
        prisma.message.findMany({
            where: {
                conversationId,
                deletedAt: null,
                ...keysetWhere(cursor, "desc"),
            },
            include: { envelopes: deviceId ? { where: { deviceId } } : false },
            orderBy: keysetOrder("desc"),
            take: pageSize + 1,
        }),
    ])

    /* Gone between the participant check and this read, which is a 404 rather than the
     * crash that projecting a null row would be. */
    if (!conversation) throw notFound("Conversation not found.")
    if (!sharesGroup(viewer, conversation)) throw notFound("Conversation not found.")

    return {
        conversation: projectConversation({ ...conversation, messages: [] }, viewer),
        messages: keysetPage(rows, pageSize, (row) => projectMessage(row)),
    }
}

/* ---------------------------------------------------------------------------
 * Sending
 * ------------------------------------------------------------------------- */

/* Relays one message: validates the social rules, stores the envelopes, and pushes.
 * The envelope list is the client's — the server cannot check ciphertext — but its
 * addressing is not: only devices belonging to this conversation's participants are
 * accepted, so the endpoint cannot be used to spray bytes at arbitrary installs. */
export const sendMessage = async (viewer, conversationId, { senderDeviceId, envelopes }) => {
    requireAdult(viewer)
    const mine = await requireParticipant(viewer, conversationId)

    /* The request gate, sender side: an unaccepted recipient reads but cannot
     * reply. Accepting is one tap; enforcing it here is what makes the tap mean
     * something. */
    if (!mine.acceptedAt) throw forbidden("Accept this conversation to reply.")

    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
            participants: {
                include: {
                    profile: {
                        select: {
                            id: true,
                            displayName: true,
                            firstName: true,
                            lastName: true,
                            handle: true,
                            vocation: true,
                            avatarUrl: true,
                            memberships: {
                                where: { status: "APPROVED" },
                                select: { orgId: true },
                            },
                            cryptoDevices: { select: { id: true } },
                        },
                    },
                },
            },
        },
    })

    const others = conversation.participants.filter((p) => p.profileId !== viewer.id)

    /* Re-checked per send, not grandfathered at creation. `forbidden` rather than the
     * `notFound` the read paths give: the sender is looking at a thread they were in a
     * moment ago, so pretending it never existed would be the more confusing answer. */
    if (!sharesGroup(viewer, conversation)) {
        throw forbidden("This conversation isn't available right now.")
    }

    const otherIds = others.map((p) => p.profileId)
    const block = await prisma.messageBlock.findFirst({
        where: {
            OR: [
                { blockerId: viewer.id, blockedId: { in: otherIds } },
                { blockerId: { in: otherIds }, blockedId: viewer.id },
            ],
        },
        select: { blockerId: true },
    })
    if (block) throw forbidden("This conversation isn't available right now.")

    /* Addressing: every device of every participant, minus the sender's own. The viewer
     * is a participant, so their own devices came back with everybody else's — asking
     * for them again would be a round trip for a row already in hand. */
    const viewerDevices =
        conversation.participants.find((p) => p.profileId === viewer.id)?.profile.cryptoDevices ??
        []
    if (!viewerDevices.some((d) => d.id === senderDeviceId)) {
        throw invalid("That sending device is not registered.", { senderDeviceId: "Unknown" })
    }

    const addressable = new Set(viewerDevices.map((d) => d.id))
    const otherDevices = new Set()
    for (const other of others) {
        for (const device of other.profile.cryptoDevices) {
            addressable.add(device.id)
            otherDevices.add(device.id)
        }
    }
    addressable.delete(senderDeviceId)

    const rows = []
    const seen = new Set()
    for (const envelope of Array.isArray(envelopes) ? envelopes : []) {
        const { deviceId, type, body } = envelope ?? {}
        if (!addressable.has(deviceId) || seen.has(deviceId)) continue
        if (type !== "PREKEY" && type !== "RATCHET") continue
        if (typeof body !== "string" || !body || body.length > MAX_ENVELOPE_BYTES) continue
        seen.add(deviceId)
        rows.push({ deviceId, type, body })
    }

    /* A message none of the other side's devices can ever read is not a message —
     * it is ciphertext into the void, and the sender should hear about it now
     * rather than wonder why nobody replies. */
    if (!rows.some((row) => otherDevices.has(row.deviceId))) {
        throw conflict("That person can't receive messages yet.")
    }

    const now = new Date()
    const [message] = await prisma.$transaction([
        prisma.message.create({
            data: {
                conversationId,
                senderId: viewer.id,
                senderDeviceId,
                envelopes: { createMany: { data: rows } },
            },
        }),
        prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: now },
        }),
        prisma.conversationParticipant.update({
            where: {
                conversationId_profileId: { conversationId, profileId: viewer.id },
            },
            data: { lastReadAt: now },
        }),
    ])

    /* After the commit, never awaited — the standing rule for every push. The banner
     * is metadata-only either way (the server has nothing else); a recipient who has
     * not accepted the thread gets no name at all, matching the blurred row. */
    for (const other of others) {
        pushMessage({
            recipientId: other.profileId,
            actor: viewer,
            conversationId,
            request: !other.acceptedAt,
        })
    }

    return projectMessage({ ...message, envelopes: [] })
}

/* ---------------------------------------------------------------------------
 * Reading, accepting, leaving
 * ------------------------------------------------------------------------- */

export const markConversationRead = async (viewer, conversationId) => {
    requireAdult(viewer)
    await requireParticipant(viewer, conversationId)
    await prisma.conversationParticipant.update({
        where: { conversationId_profileId: { conversationId, profileId: viewer.id } },
        data: { lastReadAt: new Date() },
    })
}

export const acceptConversation = async (viewer, conversationId) => {
    requireAdult(viewer)
    const mine = await requireParticipant(viewer, conversationId)
    if (mine.acceptedAt) return
    await prisma.conversationParticipant.update({
        where: { conversationId_profileId: { conversationId, profileId: viewer.id } },
        data: { acceptedAt: new Date() },
    })
}

/* Deletes the thread outright — offered by the client on requests, where nothing has
 * been invested. Either participant may do it; ciphertext nobody wanted is not worth
 * a tombstone. */
export const deleteConversation = async (viewer, conversationId) => {
    requireAdult(viewer)
    await requireParticipant(viewer, conversationId)
    await prisma.conversation.delete({ where: { id: conversationId } })
}

/* Block, from a request's Block action: refuses the other participant for good and
 * removes the thread in the same breath. */
export const blockConversation = async (viewer, conversationId) => {
    requireAdult(viewer)
    await requireParticipant(viewer, conversationId)
    const other = await prisma.conversationParticipant.findFirst({
        where: { conversationId, profileId: { not: viewer.id } },
        select: { profileId: true },
    })
    if (!other) throw notFound("Conversation not found.")

    await prisma.$transaction([
        prisma.messageBlock.upsert({
            where: {
                blockerId_blockedId: {
                    blockerId: viewer.id,
                    blockedId: other.profileId,
                },
            },
            create: { blockerId: viewer.id, blockedId: other.profileId },
            update: {},
        }),
        prisma.conversation.delete({ where: { id: conversationId } }),
    ])
}

/* ---------------------------------------------------------------------------
 * Contacts
 * ------------------------------------------------------------------------- */

/* Who the New Message sheet may name: everyone the viewer shares an APPROVED group
 * with who is an adult with at least one registered device — a person E2EE can
 * actually reach. Minors are absent, not greyed out: the list must not know they
 * exist. */
export const listContacts = async (viewer, { query }) => {
    requireAdult(viewer)

    const orgIds = readableOrgIds(viewer)
    if (orgIds.length === 0) return { items: [], nextCursor: null }

    const search = String(query ?? "").trim()
    /* Eighteen years back from today, as a calendar date — anyone born on or before
     * it is an adult. The same arithmetic `isAdult` does, expressed as a bound so
     * the database can apply it. */
    const cutoff = new Date()
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18)

    const profiles = await prisma.profile.findMany({
        where: {
            id: { not: viewer.id },
            birthday: { not: null, lte: cutoff },
            memberships: { some: { status: "APPROVED", orgId: { in: orgIds } } },
            cryptoDevices: { some: {} },
            blocksMade: { none: { blockedId: viewer.id } },
            blocksReceived: { none: { blockerId: viewer.id } },
            ...(search
                ? {
                      OR: [
                          { handle: { contains: search, mode: "insensitive" } },
                          { displayName: { contains: search, mode: "insensitive" } },
                          { firstName: { contains: search, mode: "insensitive" } },
                          { lastName: { contains: search, mode: "insensitive" } },
                      ],
                  }
                : {}),
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        take: 20,
    })

    return { items: profiles.map((profile) => projectPerson(profile)), nextCursor: null }
}

/* ---------------------------------------------------------------------------
 * Unread
 * ------------------------------------------------------------------------- */

/* How many conversations hold something unread — conversations, not messages,
 * because that is what the badge means on every phone (three unread threads is "3",
 * however chatty each was). Raw SQL because the comparison is per-row (each
 * participant's own `lastReadAt`), which Prisma's filter grammar cannot express. */
export const unreadConversations = async (viewer) => {
    if (!isAdult(viewer.birthday)) return 0

    const [{ count }] = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count
        FROM conversation_participant p
        WHERE p.profile_id = ${viewer.id}::uuid
          AND EXISTS (
            SELECT 1 FROM message m
            WHERE m.conversation_id = p.conversation_id
              AND m.deleted_at IS NULL
              AND m.sender_id <> ${viewer.id}::uuid
              AND m.created_at > COALESCE(p.last_read_at, 'epoch'::timestamp)
          )`

    return count
}
