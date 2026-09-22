"use client"

import { useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"

import EventsCalendar, { CalendarLegend } from "@/components/EventsCalendar"
import { OrgNavTrigger } from "@/components/OrgNav"
import SignupSheets, { ModeSwitch } from "@/components/SignupSheets"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ROUTES } from "@/lib/constants"
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
 * arrivals has to land on the *same screen*, tabs and all, rather than on a stripped surface
 * that happens to show the same rota. Which rota is open is read from the pathname
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
 * on; the switch itself sits on the end of the tab bar and stays there on both tabs.
 */

const TABS = [
    { id: "calendar", label: "Calendar" },
    { id: "signups", label: "Sign-ups" },
]

const EventsView = () => {
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
        <div className="mx-auto w-full max-w-[640px] pb-10">
            {/* Both panels stay mounted and cross-fade, the way <ProfileCard/>'s do — the
                primitive already handles it: `<Tabs/>` lays its list and its panels out as two
                grid rows and both panels take the same cell, and `<TabsContent/>` force-mounts
                and animates opacity between them.

                Do **not** add `hidden` to a panel to keep it out of the way. It is `display:
                none`, so the outgoing panel vanishes on the first frame instead of fading, and
                the transition the primitive is built around never plays. */}
            <Tabs value={showing} onValueChange={changeTab} className="gap-7 md:gap-4">
                {/* The page's head, and the whole of it: the group switcher, the tabs and the
                    edit switch on one line. The bar is the `underline` variant rather than the
                    pill a card uses — these two words are the page's own title, and a track
                    drawn around them would read as a widget sitting on the page rather than as
                    the page.

                    A phone has no rail, so the switcher belongs here: it is the only thing on
                    screen naming the parish whose calendar this is.

                    ── Two fixed things, so nothing else can move ──

                    **The side columns are an equal, fixed width**, which is what centres the
                    tabs on the *screen* rather than on whatever space is left over. Centring
                    them between flexible neighbours would shift them every time the edit switch
                    appeared or went away, which is exactly what happens when somebody switches
                    between a group they administer and one they only belong to. A member sees
                    the switcher alone, the right-hand box empty, and the tabs where they were.

                    **The row is a fixed `h-10`**, the switcher's own size and the tallest thing
                    in it, so the content below sits at the same height for everybody. The edit
                    switch's caption hangs out of flow for the same reason; see `<ModeSwitch/>`.

                    Above `md` the switcher is gone (the rail carries it there) and there is
                    nothing to centre between, so this folds to an ordinary row: tabs at the
                    column's left edge, lining up with the calendar and the rotas below, and the
                    edit switch at the end.

                    The wrapper is an ordinary grid item in the `<Tabs/>` root's first row; the
                    panels keep their own `row-start-2`, so they still stack and cross-fade. */}
                <div className="grid h-10 grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3 md:flex">
                    <div className="md:hidden">
                        <OrgNavTrigger />
                    </div>

                    <TabsList
                        variant="underline"
                        className="w-full justify-center md:flex-1 md:justify-start"
                    >
                        {TABS.map(({ id, label }) => (
                            <TabsTrigger key={id} value={id}>
                                {label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <ModeSwitch />
                </div>

                <TabsContent value="calendar">
                    <EventsCalendar />
                </TabsContent>

                <TabsContent value="signups">
                    <SignupSheets />
                </TabsContent>
            </Tabs>

            {/* Pinned to the foot of the screen and portalled to `<body>`, so it sits in the same
                place on the month and on a day rather than drifting with the content — which
                means it is outside the tab it belongs to, and this has to say when it applies.
                See `<CalendarLegend/>`. */}
            {showing === "calendar" && <CalendarLegend />}
        </div>
    )
}

export default EventsView
