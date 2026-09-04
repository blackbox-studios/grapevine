import { requireViewer } from "@/lib/server/auth"
import { sweepDueReminders } from "@/lib/server/signups.service"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { unreadCount } from "@/lib/server/notifications.service"

/* GET /api/notifications/unread — `{ unread }`, the number the bell's dot stands for.
 *
 * **A separate endpoint from the list, deliberately.** The two are asked at completely
 * different rates: the chrome needs this on every boot, while the list is only wanted when
 * somebody opens the panel. Folding the tally into the collection response would mean
 * loading and projecting a page of rows on every sign-in to decide whether to draw a dot,
 * and folding the list into this one would mean fetching it for readers who never look.
 *
 * **The highest-frequency route in the app, and the one to keep cheapest.** Every client push
 * cannot reach polls it on a timer (`useNotificationsWatch`), so its cost is paid per viewer
 * per interval whether or not anything has happened — floor load rather than traffic. It is
 * two statements: `requireViewer`, then an index-only count over `(recipient_id, read_at)`.
 * Do not add a third.
 *
 * The `requireViewer` half is the larger one and is pure overhead here — the count needs only
 * an id, which the verified JWT already carries, so a viewer-id-only variant of it would halve
 * every tick. Worth reaching for if this ever shows up in Supabase's compute graph; not before,
 * since a second way to authenticate a request is a real cost of its own. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)

    /* **The app's closest thing to a clock, borrowed.** Sign-up reminders have to go out on
     * time, and a deploy with no cron behind `POST /api/signups/reminders` would otherwise never
     * send one — so this endpoint, which every client asks on boot, on every foreground, and on
     * a thirty-second poll where push cannot reach it, kicks a throttled sweep on the way past.
     *
     * Not awaited and unable to fail this request: it is fire-and-forget, throttled to once
     * every few minutes per process, and idempotent against other instances. See
     * `sweepDueReminders`, which carries the whole argument. */
    sweepDueReminders()
    return sendResource({ unread: await unreadCount(viewer) })
})

export const OPTIONS = preflight
