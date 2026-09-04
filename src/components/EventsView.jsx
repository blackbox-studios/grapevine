"use client"

import { useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"

import EventsCalendar, { CalendarLegend } from "@/components/EventsCalendar"
import MobileHeader from "@/components/MobileHeader"
import SignupSheets, { ModeSwitch } from "@/components/SignupSheets"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ROUTES } from "@/lib/constants"
import { useCurrentOrg } from "@/lib/store/org/hook"
import { useEventsView } from "@/lib/store/signups/hook"
import { signupIdFor } from "@/lib/utils"

/* Events: what is happening in this parish, and what it needs hands for.
 *
 * ── Two tabs, one subject ────────────────────────────────────────────────────
 *
 * The parish's own calendar and its sign-up sheets are the same question asked twice — "what is
 * going on here" — so they are two tabs rather than two destinations. Putting the rotas
 * somewhere else would mean a member finding out that coffee hour needs somebody only if they
 * went looking; here it is one tap from the feast it serves, and the calendar's rings already
 * say which Sundays have one. **The calendar leads**, because it is the tab worth opening when
 * nothing is being asked of you.
 *
 * ── One component, two ways in ───────────────────────────────────────────────
 *
 * This is rendered by `/events/page.jsx` *and* by `RUNTIME_SURFACES` for `/events/s/:sheetId`,
 * and that is the whole reason it is a component rather than a page body. A rota has a real
 * URL, so it can be linked to, reminded about and cold-loaded — and every one of those
 * arrivals has to land on the *same screen*, header and tabs and all, rather than on a stripped
 * surface that happens to show the same rota. Which rota is open is read from the pathname
 * below rather than passed in, so the two entrances cannot drift.
 *
 * ── Why arriving at a rota does not fade the page ────────────────────────────
 *
 * `/events` is in `NESTED_TRANSITION_ROUTES`, so `pageTransitionKey` collapses everything under
 * it to one key and the shell's cross-fade does not fire. Only the sign-ups panel changes, and
 * it runs its own fade between the list and the rota — which is what makes a rota read as a
 * level *inside* this page rather than as a different page that looks like it.
 *
 * ── Administering is a mode, not a page ──────────────────────────────────────
 *
 * A priest looking at Sunday and noticing nobody has signed up should be able to add a place
 * from where he is standing. The list is identical either way, so what differs is only what
 * each date offers. The group tree's **Manage events** row opens this with that mode already
 * on; the switch itself sits in the header, opposite the title, and stays there on both tabs.
 */

const TABS = [
    { id: "calendar", label: "Calendar" },
    { id: "signups", label: "Sign-ups" },
]

const EventsView = () => {
    const { current } = useCurrentOrg()
    const { tab, setTab } = useEventsView()
    const pathname = usePathname()
    const router = useRouter()

    /* A rota in the URL means the sign-ups half, whatever the tab was last left on — the reader
     * followed a link to a rota, and showing them the calendar instead would be answering a
     * different question. Derived rather than set in an effect: this is what the URL *means*,
     * not something that has to be synchronised into place. */
    const openRota = signupIdFor(pathname)
    const showing = openRota ? "signups" : tab

    /* **Leaving a rota is part of changing tab.** The line above makes the URL win, so with a
     * rota open a tap on Calendar would set the tab and change nothing on screen — the pathname
     * would still be naming a rota. Navigating back to `/events` first is what lets the
     * derivation stand. */
    const changeTab = useCallback(
        (next) => {
            if (openRota) router.push(ROUTES.EVENTS, { scroll: false })
            setTab(next)
        },
        [openRota, router, setTab],
    )

    return (
        /* The same column treatment the feed uses — no top padding, and the mobile header paying
           its own `pb-6` — so the group switcher and the bell sit in exactly the same place on
           both screens. They are the two things a reader's eye tracks between pages, and a few
           pixels of drift between them is the kind of thing that reads as sloppiness without
           being nameable. */
        <div className="mx-auto w-full max-w-[640px] pb-10">
            <MobileHeader className="pb-6" />

            <div className="flex flex-col gap-6">
                <header className="flex items-start justify-between gap-4">
                    <div className="flex flex-col">
                        <h1 className="text-3xl">Events</h1>
                        <p className="text-sm text-muted-foreground">{current?.name ?? "—"}</p>
                    </div>
                    <ModeSwitch />
                </header>

                {/* Both panels stay mounted and cross-fade, the way <ProfileCard/>'s do — the
                    primitive already handles it: `<Tabs/>` lays its list and its panels out as
                    two grid rows and both panels take the same cell, and `<TabsContent/>`
                    force-mounts and animates opacity between them.

                    Do **not** add `hidden` to a panel to keep it out of the way. It is `display:
                    none`, so the outgoing panel vanishes on the first frame instead of fading,
                    and the transition the primitive is built around never plays.

                    A rule under the bar, sitting in the middle of the gap rather than against
                    either side of it: the panels below are whole surfaces — a month grid, a list
                    of rotas — rather than continuations of the control, and the line is what
                    says so. The `pb-8` on the wrapper and the `gap-8` on the grid are the two
                    halves of that spacing and have to match, or the rule reads as belonging to
                    whichever side it is nearer. */}
                <Tabs value={showing} onValueChange={changeTab} className="gap-8">
                    {/* Wrapped so the border has something to hang off that is not the bar
                        itself — on `<TabsList/>` it would be a line drawn under the pills. The
                        wrapper is an ordinary grid item in row one; the panels keep their own
                        `row-start-2`, so they still stack and cross-fade.

                        `-mx-4 px-4` is the full bleed: the negative margin cancels the shell's
                        mobile gutter so the rule reaches both screen edges, and the padding puts
                        the bar itself back in the column. Exactly `4`, because that is the
                        gutter it is cancelling — see `px-4` on the shell's page wrapper. From
                        `md` it goes back to the column's width, where the page is a centred
                        640px band and a rule running out to a desktop's edges would be
                        underlining the whitespace rather than the content. */}
                    <div className="-mx-4 border-b px-4 pb-8 md:mx-0 md:px-0">
                        <TabsList className="w-full rounded-full bg-muted/50 px-2">
                            {TABS.map(({ id, label }) => (
                                <TabsTrigger key={id} value={id}>
                                    {label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>

                    <TabsContent value="calendar">
                        <EventsCalendar />
                    </TabsContent>

                    <TabsContent value="signups">
                        <SignupSheets />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Pinned to the foot of the screen and portalled to `<body>`, so it sits in the same
                place on the month and on a day rather than drifting with the content — which
                means it is outside the tab it belongs to, and this has to say when it applies.
                See `<CalendarLegend/>`. */}
            {showing === "calendar" && <CalendarLegend />}
        </div>
    )
}

export default EventsView
