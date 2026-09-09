"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence } from "motion/react"

import Ripple from "@/assets/svg/ripple.svg"
import Badge from "@/components/Badge"
import Skeleton, { PeopleSkeleton, TabsSkeleton } from "@/components/Skeleton"
import { Avatar, Close, FollowButton, Overlay } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
import Transition from "@/components/Transition"
import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEndSentinel } from "@/lib/hooks/useScroll.hook"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { displayName } from "@/lib/name"
import { useFollows } from "@/lib/store/follows/hook"
import { useOpenProfile, useProfileCard } from "@/lib/store/profile/hook"
import { formatCompact, formatDateCompact, formatNameDay, roleLabel } from "@/lib/utils"

/* Somebody's public face: who they are, what the parish knows about them, and who they are
 * connected to — one card, three tabs.
 *
 * **A modal, not a route.** It is peeked at from a byline and dismissed, which is
 * component-state semantics: Android's back gesture closes it rather than unwinding a history
 * entry, and it can be opened from a comment thread without taking the thread down. The
 * *editable* half of a profile is not here at all — that is `/settings/info`, a page in the
 * account tree, because a form that long is a place you go.
 *
 * **Mounted once by the shell**, with the open subject in the profile store. A handle is
 * tapped from a comment row, a feed byline, the account page and a row inside this card, and
 * those are four separate subtrees; one of them owning the surface would mean four copies of
 * it, or a card that dies with the thread that opened it.
 *
 * **The follower lists are tabs here rather than a second modal on top.** Walking from a person
 * to their followers to one of *those* people is the whole point of the surface, and a stack of
 * modals makes every step of that a layer to dismiss. Tabs keep it one card whose subject
 * changes — tapping a row calls `openProfile` again, and the card stays up.
 *
 * **It shows a vocation where a post card shows a blue check.** The check means "administers the
 * group you are reading this in", and a card is not read inside a group; a vocation is global and
 * true anywhere. `projectProfile` is where that is settled — it ships no `verified` at all.
 *
 * Dialog on a desktop, bottom sheet on a phone, matching every other surface here that is acted
 * in and dismissed. */

const TABS = [
    { id: "info", label: "Info" },
    { id: "followers", label: "Followers" },
    { id: "following", label: "Following" },
]

/* One fact about a person: what it is on the left, what it says on the right.
 *
 * `truncate` on the value alone, so a long patron ("The Right-Believing Prince Alexander
 * Nevsky") ellipses instead of wrapping under its own label and breaking the rhythm of the
 * rows below it. */
const Stat = ({ label, value }) => (
    <div className="flex items-baseline justify-between gap-6 px-5 py-5">
        <span className="shrink-0 text-sm font-medium">{label}</span>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{value}</span>
    </div>
)

/* What the parish knows about a person: a labelled row each, between hairlines.
 *
 * The facts are of unrelated kinds (a saint, a feast, a date) and there are never many, so
 * the reader is looking one of them up rather than comparing them. A row gives the label its
 * own words and the value the rest of the line, which is how a phone states a fact everywhere
 * else in this app.
 *
 * **Rows that have nothing to say are absent, not blank**, so a catechumen who has just
 * joined gets the empty state below rather than a list of dashes. */
const InfoTab = ({ profile }) => {
    const rows = [
        profile.patronSaint && { label: "Patron", value: profile.patronSaint },
        profile.nameDay && {
            label: "Name day",
            value: formatNameDay(profile.nameDay, { short: true }),
        },
        profile.ordinationDate && {
            label: "Ordained",
            value: formatDateCompact(profile.ordinationDate),
        },
    ].filter(Boolean)

    if (rows.length === 0) {
        return (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                Nothing here yet.
            </p>
        )
    }

    return (
        <div className="flex flex-col divide-y border-y">
            {rows.map((row) => (
                <Stat key={row.label} {...row} />
            ))}
        </div>
    )
}

/* One person in a follower list: who they are, and the one thing you can do about them.
 *
 * The name in the app's usual two-line shape — how they are addressed ("Dn. Paul") over the
 * handle that identifies them — because a parish is a list of people the reader mostly knows by
 * the first and looks up by the second.
 *
 * `isSelf` draws no button rather than a disabled one: "you cannot follow yourself" is not a
 * state anybody needs explaining, and a greyed control invites a tap that can never work. */
const PersonRow = ({ person, onOpen }) => (
    <div className="flex items-center gap-3 px-4 py-2">
        <button
            type="button"
            onClick={() => onOpen(person.handle)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
            <Avatar person={person} className="size-11" />
            <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold">{displayName(person)}</span>
                <span className="truncate text-sm text-muted-foreground">@{person.handle}</span>
            </span>
        </button>

        {!person.isSelf && <FollowButton person={person} className="w-28" />}
    </div>
)

/* One direction's list. **It takes its rows rather than fetching them**: both lists are loaded
 * together the moment the card opens (see `lib/store/follows/store.js`), so a tab switch shows
 * what is already in hand instead of spending a round trip on a spinner.
 *
 * The next page loads when the reader reaches the foot — `useEndSentinel` rather than
 * `useInfiniteScroll`, because this list scrolls inside its own panel and never moves the
 * shell's container. Same call the comment thread makes. */
const FollowsTab = ({ list, kind, skeleton, loadingMore, onLoadMore, onOpen }) => {
    const people = list.items

    const sentinelRef = useEndSentinel({
        hasMore: list.hasMore,
        loading: loadingMore,
        count: people.length,
        onLoadMore: () => onLoadMore(kind),
    })

    /* Skeleton, empty state and rows cross-fade rather than cutting. Walking from one person to
     * the next re-loads both lists, so this swap happens on every step of that walk — a hard cut
     * makes the panel flicker under a reader who is doing exactly what the surface is for. */
    return (
        <AnimatePresence mode="wait" initial={false}>
            {skeleton ? (
                <Transition fast key="skeleton">
                    <PeopleSkeleton />
                </Transition>
            ) : people.length === 0 ? (
                <Transition fast key="empty">
                    <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                        {kind === "followers"
                            ? "Nobody follows them yet."
                            : "They are not following anyone yet."}
                    </p>
                </Transition>
            ) : (
                <Transition fast key="content">
                    {people.map((person) => (
                        <PersonRow key={person.id} person={person} onOpen={onOpen} />
                    ))}
                    {list.hasMore && (
                        /* The sentinel below usually gets there first, so this is the fallback:
                         * a failed page leaves the list the same length, which is the state that
                         * stops the sentinel re-firing, and the reader needs something to
                         * press. */
                        <div className="flex justify-center py-3">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={loadingMore}
                                onClick={() => onLoadMore(kind)}
                                className="rounded-full text-muted-foreground"
                            >
                                {loadingMore ? (
                                    <Ripple
                                        aria-label="Loading people"
                                        className="size-5 [&_circle]:stroke-current"
                                    />
                                ) : (
                                    "Show more"
                                )}
                            </Button>
                        </div>
                    )}
                    {/* Mounted unconditionally: a node that appears only once `hasMore` is
                      * known would need a second intersection event, which a panel nobody has
                      * scrolled never produces. */}
                    <div ref={sentinelRef} aria-hidden className="h-px w-full shrink-0" />
                </Transition>
            )}
        </AnimatePresence>
    )
}

/* The identity block: the picture, how the person is addressed, their standing, their handle,
 * and the single thing there is to do about them.
 *
 * **It lives inside the Info tab rather than above the tab bar.** The bar is the card's one
 * piece of fixed chrome, pinned at the very top, so every tab gets the same full height beneath
 * it — a header above it would give Followers a shorter list than Info's content for no reason,
 * and would move as the card's subject changed.
 *
 * **One button, two meanings, in the same place.** Your own card offers the way to the form
 * that edits it; everybody else's offers the follow. Which it is follows from who they are, so
 * there is never a moment where both are on screen competing. */
const CardHeader = ({ profile, onEdit }) => (
    <div className="flex flex-col items-center gap-3 px-4 pb-10 pt-6 text-center">
        <Avatar person={profile} className="size-20 text-2xl" />

        <div className="flex flex-col items-center gap-1.5">
            <h2 className="text-2xl font-semibold">{displayName(profile)}</h2>

            {/* Their standing in the Church — the card's answer to a post card's blue check. */}
            <Badge>{roleLabel(profile.vocation)}</Badge>

            <p className="text-sm text-muted-foreground">@{profile.handle}</p>
        </div>

        {/* One control, two meanings, in the same place: your own card offers the way to the
            form that edits it, everybody else's offers the follow. Which it is follows from who
            they are, so the two are never on screen competing. */}
        {profile.isSelf ? (
            <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={onEdit}
                className="mt-1 w-full max-w-64"
            >
                Edit profile
            </Button>
        ) : (
            <FollowButton person={profile} size="lg" className="mt-1 w-full max-w-64" />
        )}
    </div>
)

/* The card's skeleton — for somebody else's, since the viewer's own is seeded from `/api/me`
 * and never shows one (see `lib/store/profile/store.js`). Its geometry mirrors the header's, so
 * the card does not step as it resolves. */
const CardSkeleton = () => (
    /* `p-3` is `<Tabs/>`'s own padding, restated so the bar below lands exactly where the real
     * one does — without it the whole card steps sideways and up as it resolves. */
    <div className="p-3">
        <TabsSkeleton />
        <div className="flex flex-col items-center gap-3 px-4 pb-5 pt-6 text-center">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-1 h-12 w-full max-w-64 rounded-full" />
        </div>
    </div>
)

/* Everything inside the sheet or the dialog. Both presentations render exactly this, which is
 * what keeps a person from meaning something slightly different on a phone. */
const CardBody = ({ handle, openTab, profile, skeleton, missing, onOpen, onEdit }) => {
    const [tab, setTab] = useState(openTab)
    /* Both lists, loaded the moment the card opens rather than on the tab that shows them —
     * see `lib/store/follows/store.js`. Mounted here, once, so the panels below are pure.
     *
     * Keyed on the handle the card was *opened at*, not on the loaded profile's: for anybody
     * but the viewer, `profile` is null until `GET /api/profiles/:handle` answers, so keying on
     * it would hold both lists behind that request and make the pair sequential — the one thing
     * loading them here instead of per tab exists to avoid. */
    const follows = useFollows(handle)

    /* Back to the tab the card was opened at whenever the card is opened — at a new person, or
     * at the same one from a different entry point. A reader who walked into somebody from a
     * follower list is looking at a new person rather than at the same list again; a reader who
     * tapped the *following* tally on `/settings` wants that list even though they were just
     * shown their followers.
     *
     * Both are the same event, so both are one key: the subject and the tab it was opened at.
     * That is also why `close` puts `openTab` back to "info" — tapping one tally twice has to
     * change this string in between, or the second tap would find nothing to react to.
     *
     * Adjusted during render (React's own pattern for state derived from a changing prop)
     * rather than in an effect, so the right tab is what paints; an effect would show the
     * previous one for a frame first. */
    const opened = `${profile?.id ?? ""}:${openTab}`
    const [shown, setShown] = useState(opened)
    if (shown !== opened) {
        setShown(opened)
        setTab(openTab)
    }

    /* **One `<AnimatePresence/>` over all three states**, so the swap between them is a
     * cross-fade rather than a cut. Two presence trees — an early return for the skeleton and a
     * separate one for the content — would animate each state's own entrance and exit but never
     * *between* them, which is the only transition anyone sees.
     *
     * `mode="wait"` is safe here only because the viewer's own card never renders a skeleton at
     * all: `open` seeds the store before this mounts, so `skeleton` is false on the first render
     * rather than flipping after it. A skeleton that *is* committed, even for a frame, is one
     * this would hold the content back to play an exit for. */
    return (
        <AnimatePresence mode="wait" initial={false}>
            {skeleton ? (
                <Transition fast key="skeleton">
                    <CardSkeleton />
                </Transition>
            ) : missing || !profile ? (
                <Transition fast key="missing">
                    <div className="px-6 py-16 text-center">
                        <p className="text-base font-semibold">Person not found</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            They may have left, or you may not share a group with them.
                        </p>
                    </div>
                </Transition>
            ) : (
                /* The column classes are the card's, not this wrapper's own: it stands in the
                 * flex slot `<Tabs/>` would otherwise occupy, so it has to size the same way or
                 * the panels lose the bounded height they scroll inside. */
                <Transition fast key="content" className="flex min-h-0 flex-1 flex-col">
                    {/* `<Tabs/>` lays its list and its panels out as two grid rows; naming them
                        here is what turns that into a fixed header over a scrolling body —
                        `auto` for the bar, and `minmax(0,1fr)` for the panels, because a bare
                        `1fr` refuses to shrink below its content and the overflow lands on the
                        card instead of inside it. */}
                    <Tabs
                        value={tab}
                        onValueChange={setTab}
                        className="min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] p-3"
                    >
                        {/* **The bar spans the card's width at the very top.** It is the one
                            piece of fixed chrome here, so it reads as the card's header rather
                            than as a control floating inside it — and it stays a pill, inset by
                            the card's own padding, so it sits inside the surface's radius
                            rather than fighting it. */}
                        <TabsList className="w-full shrink-0 rounded-full bg-muted/50 px-2">
                            {TABS.map(({ id, label }) => (
                                <TabsTrigger key={id} value={id}>
                                    {label}
                                    {/* The tallies ride on the tabs that mean them. Info has
                                        nothing to count and would only gain a stray zero. */}
                                    {id !== "info" && (
                                        <span className="tabular-nums">
                                            {formatCompact(
                                                id === "followers"
                                                    ? profile.followers
                                                    : profile.followingCount,
                                            )}
                                        </span>
                                    )}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        {/* All three panels stay mounted and cross-fade, which is what
                            `<TabsContent/>`'s `forceMount` is for. It only works because the two
                            lists have a slot each in the `follows` store rather than sharing
                            one — with a single slot, two mounted lists would fight over which
                            direction it was loading. */}
                        <TabsContent
                            value="info"
                            className="overflow-y-auto overscroll-contain py-2"
                        >
                            <CardHeader profile={profile} onEdit={onEdit} />
                            <InfoTab profile={profile} />
                        </TabsContent>

                        {["followers", "following"].map((kind) => (
                            <TabsContent
                                key={kind}
                                value={kind}
                                className="overflow-y-auto overscroll-contain py-2"
                            >
                                <FollowsTab
                                    list={follows.lists[kind]}
                                    kind={kind}
                                    skeleton={follows.skeleton}
                                    loadingMore={follows.loadingMore[kind]}
                                    onLoadMore={follows.loadMore}
                                    onOpen={onOpen}
                                />
                            </TabsContent>
                        ))}
                    </Tabs>
                </Transition>
            )}
        </AnimatePresence>
    )
}

const ProfileCard = () => {
    const { handle, openTab, open, profile, skeleton, missing, close, edit } = useProfileCard()
    const { openProfile } = useOpenProfile()
    const isDesktop = useIsDesktop()
    const mounted = useMounted()

    /* React state, not a URL, so Android's back gesture has nothing of its own to unwind and
     * would otherwise close whatever the card was opened over. */
    useBackHandler(open && !isDesktop, close)

    /* Escape, which `<Overlay/>` does not bind — it is a plain box rather than a Radix dialog,
     * so the pill and the backdrop are the only ways out it brings. Marked handled, so a slide
     * route open underneath does not also unwind on the same keypress.
     *
     * Desktop only: the mobile presentation is a Vaul drawer, which handles Escape itself. */
    useEffect(() => {
        if (!open || !isDesktop) return
        const onKey = (event) => {
            if (event.key !== "Escape" || event.defaultPrevented) return
            event.preventDefault()
            close()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [open, isDesktop, close])

    if (!open) return null

    const body = (
        <CardBody
            handle={handle}
            openTab={openTab}
            profile={profile}
            skeleton={skeleton}
            missing={missing}
            onOpen={openProfile}
            onEdit={edit}
        />
    )

    if (isDesktop) {
        /* **Portalled to <body>.** The shell mounts this inside its scroll container, which is
         * a `motion.div` the group switcher and a slide route both translate — and a
         * transformed ancestor becomes the containing block for every `position: fixed`
         * descendant, which would tie this overlay to whatever the container is doing instead
         * of to the viewport. The mobile half needs no such note: a Vaul drawer portals itself. */
        if (!mounted) return null

        return createPortal(
            /* `close={false}` and the pill drawn here instead: <Overlay/>'s own sits in the
             * *window's* corner, which reads as the surface's corner only while the surface is
             * most of the window — true of the photo dialog and not of a narrow card. Anchored
             * just outside this panel's top-right, it is unmistakably this card's. Same
             * `<Close/>`, so the two still match. */
            <Overlay dismiss={close} label="Close profile" close={false}>
                {/* The pill is a sibling of the panel, not a child of it: the panel clips its
                    own contents so the tab bar can sit flush against a rounded corner, and
                    anything positioned outside those bounds is clipped with it. This wrapper is
                    the panel's box without the clipping, which is what the pill anchors to —
                    <Overlay/>'s own sits in the *window's* corner, which reads as the surface's
                    corner only while the surface is most of the window. Same `<Close/>`, so the
                    two still match. */}
                <div className="relative z-10 w-full max-w-md">
                    <Close
                        onClick={close}
                        aria-label="Close profile"
                        className="absolute -top-12 -right-6"
                    />
                    <div className="flex h-[min(75dvh,44rem)] w-full flex-col overflow-hidden rounded-4xl border bg-background shadow-lg">
                        {body}
                    </div>
                </div>
            </Overlay>,
            document.body,
        )
    }

    return (
        /* repositionInputs is off for the same reason as every other drawer here: Vaul's
         * implementation keeps react-aria's scroll lock installed, which swallows touches
         * inside the Capacitor WebView. */
        <Drawer open onOpenChange={(next) => !next && close()} repositionInputs={false}>
            {/* dvh, not vh: on a mobile browser vh is the tall viewport, so the foot of the
                list would sit under the browser's own toolbar. */}
            {/* `overflow-hidden` so the sheet's own radius clips the full-width tab bar sitting
                flush beneath the grabber; without it the bar's square corners poke out past the
                rounded top. */}
            <DrawerContent className="h-[85dvh] max-h-[85dvh] overflow-hidden">
                <div className="flex min-h-0 flex-1 flex-col pt-3">{body}</div>
            </DrawerContent>
        </Drawer>
    )
}

export default ProfileCard
