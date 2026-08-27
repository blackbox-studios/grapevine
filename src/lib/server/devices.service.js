import "server-only"

import { prisma } from "@/lib/db"
import { invalid } from "@/lib/server/errors"

/* Which installations of the app can be pushed to, and who is signed in on each.
 *
 * Three reads and two writes, all of them trivial — the interesting decisions are in the
 * `DeviceToken` model's doc comment (why the token is the primary key, why `profileId` is
 * reassigned rather than added to) and in `push.js` (why the transport is hand-rolled). This
 * file is the join between them. */

/* Long enough that a truncated or garbage value is rejected before it reaches the database,
 * short enough that no real token is. FCM registration tokens run to roughly 160-260
 * characters and the format is not documented as stable, so this is a sanity bound rather
 * than a validation of the shape — anything stricter would start rejecting live devices the
 * day Google lengthens them. */
const TOKEN_MIN = 32
const TOKEN_MAX = 4096

/* Mirrors `Capacitor.getPlatform()`. "web" is accepted now even though web push is not wired
 * up, so the column does not have to be widened by a migration the day it is — the value is
 * descriptive and nothing branches on it. */
const PLATFORMS = new Set(["ios", "android", "web"])

/* Records that this installation belongs to this viewer, and may be pushed to.
 *
 * **An upsert that reassigns**, which is the whole reason this is not a plain create. The
 * FCM token belongs to the *installation*, not to the person: a phone signed out of and back
 * into by somebody else presents the same token again. Creating a second row would leave the
 * previous occupant attached to a device that is no longer theirs, and the next like on one
 * of their posts would light up somebody else's lock screen. So the token is the key and the
 * profile is the mutable half.
 *
 * Called on every launch, not only on first grant — the SDK rotates tokens, an OS restore
 * can hand a device a stale one, and `seenAt` is what distinguishes a live installation from
 * an uninstalled app that will never present its token again. */
export const registerDevice = async (viewer, { token, platform }) => {
    const value = typeof token === "string" ? token.trim() : ""

    if (value.length < TOKEN_MIN || value.length > TOKEN_MAX) {
        throw invalid("That device token is not usable.", { token: "Invalid" })
    }
    if (!PLATFORMS.has(platform)) {
        throw invalid("Unknown device platform.", { platform: "Invalid" })
    }

    await prisma.deviceToken.upsert({
        where: { token: value },
        create: { token: value, profileId: viewer.id, platform },
        /* `seenAt` is `@updatedAt`, so it moves on its own — but only if the update writes
         * something. Assigning the profile and platform unconditionally is what guarantees
         * that, and it is also the reassignment described above. */
        update: { profileId: viewer.id, platform },
    })

    return { registered: true }
}

/* Detaches this installation, so nothing further is delivered to it.
 *
 * Called on sign-out, and it is not optional: the session is what makes the device *this*
 * person's, so a device that keeps its row after sign-out keeps receiving a stranger's
 * notifications on its lock screen until somebody signs in again. The reassignment in
 * `registerDevice` is the second line of defence for the sign-out that never reached the
 * API — an offline logout, a killed app — not a replacement for this.
 *
 * Scoped to the viewer as well as the token. The token alone would be enough to find the row,
 * and tokens are opaque and unguessable, but there is no reason for one account's request to
 * be able to unregister another's device and the extra predicate is free.
 *
 * `deleteMany`, never `delete`: signing out twice, or from a device that never registered,
 * must not fail. */
export const unregisterDevice = async (viewer, token) => {
    const value = typeof token === "string" ? token.trim() : ""
    if (!value) throw invalid("A device token is required.", { token: "Required" })

    await prisma.deviceToken.deleteMany({ where: { token: value, profileId: viewer.id } })
}

/* Every token belonging to a set of people — the send side's one query.
 *
 * Takes an array because the NEW_POST fan-out asks about a whole parish at once, and asking
 * per member would be a round trip per member before a single push had been sent. One
 * person's like is the same call with an array of one. */
export const pushTokensFor = async (profileIds) => {
    if (profileIds.length === 0) return []

    const rows = await prisma.deviceToken.findMany({
        where: { profileId: { in: profileIds } },
        select: { token: true },
    })

    return rows.map((row) => row.token)
}

/* Forgets the tokens FCM has disowned.
 *
 * Only ever called with what `sendPush` returned, which is exclusively UNREGISTERED verdicts
 * — never a timeout or a 5xx. That distinction is the whole safety of this function: pruning
 * on a transient failure would delete a live device, which then silently stops receiving
 * anything until the app is next opened. See `isUnregistered` in push.js. */
export const prunePushTokens = async (tokens) => {
    if (tokens.length === 0) return
    await prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } })
}
