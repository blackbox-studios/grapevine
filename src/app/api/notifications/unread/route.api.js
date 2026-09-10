import { after } from "next/server"

import { requireViewer } from "@/lib/server/auth"
import { sweepDueReminders } from "@/lib/server/signups.service"
import { preflight, route } from "@/lib/server/handler"
import { sweepOwedInvites } from "@/lib/server/invites"
import { unreadConversations } from "@/lib/server/messages.service"
import { sendResource } from "@/lib/server/respond"
import { unreadCount } from "@/lib/server/notifications.service"

/* GET /api/notifications/unread — `{ unread }`, the number the bell's dot stands for.
 *
 * `GET /api/notifications/unread` — `{ unread, messages }`, the bell's tally and the inbox's.
 *
 * **A separate endpoint from the list, deliberately.** The two are asked at completely
 * different rates: the chrome needs this on every boot, while the list is only wanted when
 * somebody opens the panel. Folding the tally into the collection response would mean
 * loading and projecting a page of rows on every sign-in to decide whether to draw a dot,
 * and folding the list into this one would mean fetching it for readers who never look.
 *
 * **The highest-frequency route in the app, and the one to keep cheapest.** Every client push
 * cannot reach polls it on a timer (`useNotificationsWatch`), so its cost is paid per viewer
 * per interval whether or not anything has happened — floor load rather than traffic. Both
 * tallies are index-only counts issued in parallel, so the cost is one round trip on top of
 * `requireViewer`. Keep it that way: anything added here is paid by every viewer every tick.
 *
 * The `requireViewer` half is the larger one and is pure overhead here — the count needs only
 * an id, which the verified JWT already carries, so a viewer-id-only variant of it would halve
 * every tick. Worth reaching for if this ever shows up in Supabase's compute graph; not before,
 * since a second way to authenticate a request is a real cost of its own. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)

    /* **The app's closest thing to a clock, borrowed** — this is the endpoint every client asks
     * on boot, on every foreground, and on a thirty-second poll, which is what makes it the one
     * worth hanging a sweep off. Neither can fail this request or slow its tallies; see
     * `sweepDueReminders` for why that is safe.
     *
     * Two of them, throttled independently rather than merged: a reminder is punctual and
     * sweeps every five minutes, while a letter nobody is waiting on sweeps every two. Both are
     * a timestamp comparison and nothing else on almost every call.
     *
     * The letters go through `after`, which is what keeps a serverless instance alive long
     * enough to send them: a batch is seconds of paced HTTP with the response already gone, and
     * a detached promise is dropped when the instance freezes on its way out. */
    sweepDueReminders()
    after(sweepOwedInvites)

    /* The message badge rides on the same tick rather than costing a poll of its own —
     * the count is per-viewer like the bell's, and this is already the request every
     * client makes at every interval. In parallel: the two counts share nothing. */
    const [unread, messages] = await Promise.all([
        unreadCount(viewer),
        unreadConversations(viewer),
    ])
    return sendResource({ unread, messages })
})

export const OPTIONS = preflight
