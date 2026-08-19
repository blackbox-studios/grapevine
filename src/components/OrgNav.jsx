"use client"

import { motion } from "motion/react"

import StackIcon from "@/assets/svg/icons/stack.svg"
import Icon from "@/components/Icon"
import { OrgAvatar } from "@/components/Widgets"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ROLES } from "@/lib/constants"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { useCurrentOrg, useOrgNav } from "@/lib/store/org/hook"
import { SLIDE_TRANSITION, cn, roleLabel } from "@/lib/utils"

/* The group switcher, in its two completely different presentations.
 *
 * Desktop is a dropdown pinned top-right, over a nav that never moves. Mobile is a panel
 * that **pushes** the app aside rather than covering it — the shell translates right by
 * exactly the panel's width, so the reader can see what they are switching away from and
 * tap it to come back. They are different components, not one responsive component, because
 * they share no layout, no motion and no dismissal model; all they share is the hook.
 *
 * Everything that moves rides `SLIDE_TRANSITION` — the same curve and duration the slide
 * routes use. That is not decoration: the shell can be mid-push from either mechanism, and
 * two curves on one surface read as a stutter.
 *
 * The push itself is applied by the two fixed layers that move (the scroll container and the
 * mobile rail), each reading `shift` from `useOrgNav`. It is not applied here, and it must
 * not be applied by a wrapper around them: a transformed ancestor becomes the containing
 * block for every `position: fixed` descendant, which would drag the slide-route surface
 * along with the shell and break the one overlay that has to stay put. */

/* One group's row, shared by both presentations so the two cannot describe the same
 * membership differently. The role is spelled out because it is the thing that changes when
 * you switch: an admin who reads their diocese needs to see *why* the composer disappeared.
 *
 * The selection is marked by a dot and a heavier name, not by a checkmark. A tick reads as
 * "chosen from a set of options you are still choosing between"; a dot is a status light —
 * this is the one you are in right now.
 *
 * The dot leads the row, and it is rendered on *every* row — transparent on the ones that
 * are not current, rather than omitted. A conditional element would let its width collapse,
 * so the avatars and names of the other groups would sit a few pixels left of the selected
 * one's; reserving the gutter keeps one column edge down the whole list.
 *
 * The text colours are important because `DropdownMenuItem` repaints every descendant on
 * focus: the row takes the accent background on hover, but nothing in it should change
 * colour. */
const OrgRow = ({ org, active }) => (
    <>
        <span
            aria-hidden="true"
            className={cn(
                "size-1.5 shrink-0 rounded-full",
                active ? "bg-foreground" : "bg-transparent",
            )}
        />
        <OrgAvatar org={org} className="size-10 text-sm text-white!" />
        <span className="flex min-w-0 flex-1 flex-col items-start text-left">
            <span
                className={cn(
                    "w-full truncate text-foreground!",
                    active ? "font-semibold" : "font-medium",
                )}
            >
                {org.name}
            </span>
            <span className="w-full truncate text-xs text-muted-foreground!">
                {org.role === ROLES.ADMIN ? "Administrator" : roleLabel(org.role)}
            </span>
        </span>
    </>
)

/* ------------------------------------------------------------------------- */
/* Desktop                                                                   */
/* ------------------------------------------------------------------------- */

/* Fixed top-right, above the scroll container and clear of the safe-area inset. Radix
 * closes the menu on select, and `select()` closes the mobile panel — the two dismissals are
 * independent and neither knows about the other, which is why re-selecting the group already
 * showing is harmless in both.
 *
 * The trigger keeps its pill and its caret but drops the group's name. A parish name is long
 * enough to need truncating there, so it was showing a clipped fragment of the one piece of
 * information it existed to carry; the name belongs in the open menu, where every group gets
 * a full line and they can actually be compared. The pill and the caret stay because without
 * them the avatar is just a picture — nothing says it opens anything. The main column below
 * reserves this row's height, so it reads as sitting in a header of its own rather than
 * floating over the feed. */
export const OrgSwitcher = () => {
    const { current, orgs, select, skeleton } = useCurrentOrg()

    return (
        <div className="hidden md:flex fixed right-[calc(var(--safe-right)+0.5rem)] top-[calc(var(--safe-top)+0.5rem)] z-2 items-center p-6">
            <DropdownMenu>
                <DropdownMenuTrigger
                    disabled={skeleton}
                    aria-label="Switch group"
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-background/70 supports-backdrop-filter:bg-background/50 py-1.5 pl-1.5 pr-2 backdrop-blur-md transition-colors hover:bg-accent disabled:opacity-50"
                >
                    <OrgAvatar org={current} className="size-9 text-[10px]" />
                    <Icon size="sm" className="text-muted-foreground">expand_more</Icon>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" sideOffset={8} className="w-72">
                    {orgs.map(org => (
                        <DropdownMenuItem
                            key={org.id}
                            onSelect={() => select(org.id)}
                            className="flex cursor-pointer items-center gap-3 rounded-xl py-2"
                        >
                            <OrgRow org={org} active={org.id === current?.id} />
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}

/* ------------------------------------------------------------------------- */
/* Mobile                                                                    */
/* ------------------------------------------------------------------------- */

/* The trigger, rendered **in the flow of the page** as the first row of the scroll
 * container — not as a fixed layer over it.
 *
 * It used to be pinned to the top-left and retract on scroll, animating itself up past the
 * safe-area inset off the same `useVibing` signal the bottom rail reads. That was an
 * imitation of scrolling: two things moving up the screen at once, at different speeds,
 * because only one of them was actually attached to the content. Putting it in the layout
 * means it leaves the same way the first post does — it *is* scrolled, so there is nothing
 * to synchronise and nothing to get out of step.
 *
 * It therefore no longer needs `shift` either: the scroll container it lives in carries the
 * push, so the button travels with the page for free.
 *
 * There is no close affordance here. The button is under the scrim once the panel is out
 * (the container sits at z-1, the scrim at z-30), so it cannot be pressed to dismiss, and an
 * X drawn on an inert control is a promise the layer above it will not keep. Dismissal is
 * the scrim, the back gesture, or picking a group.
 *
 * The glyph is the group icon the nav rail used to carry a "Groups" tab with, not a generic
 * hamburger. That tab is gone because it was the wrong shape for the idea: a group is the
 * scope the whole app is read in, not a page you visit. The icon moves to the control that
 * actually changes the scope, so the one symbol still means one thing. */
export const OrgNavTrigger = () => {
    const { open, toggle } = useOrgNav()

    return (
        <div className="md:hidden flex items-center pb-6">
            <button
                type="button"
                onClick={toggle}
                aria-label="Switch group"
                aria-expanded={open}
                /* Pulled left by the button's own padding so the glyph lines up with the
                   content column's edge rather than the box around it. */
                className="-ml-2 flex size-10 cursor-pointer items-center justify-center rounded-full text-foreground"
            >
                <StackIcon aria-hidden="true" className="w-7 h-7" />
            </button>
        </div>
    )
}

/* The panel, and the scrim that dismisses it.
 *
 * The panel sits at the far left **behind** the shell (z-0 against the scroll container's
 * z-1) and never moves: the shell slides off it to reveal it, the way a drawer under a card
 * works. Animating the panel in as well would double the motion on screen and mean matching
 * two distances that must not disagree.
 *
 * It renders unconditionally rather than under an `AnimatePresence`, because there is
 * nothing to animate in or out — it is only ever uncovered. `inert` while closed is what
 * keeps its buttons out of the tab order and away from screen readers while they are hidden
 * behind the shell.
 *
 * Its heading sits at exactly the hamburger's elevation — same top inset, same 2.5rem row —
 * so the label lands where the button that opened it was, rather than below it. That is the
 * only alignment the push makes visible, since the two are briefly side by side mid-slide.
 *
 * The panel runs to `inset-y-0`, under the notch, so the drawer reads as one edge-to-edge
 * surface rather than something that stops short of the hardware. The **cap** is what makes
 * that safe, and it is rendered here rather than in the shell precisely because the panel is
 * the only reason it has to exist.
 *
 * The shell's scroll container starts at --safe-top, so the status-bar strip above it is
 * left to whatever is behind — and that is this panel, at z-0, full height. Its bg-sidebar
 * therefore painted the strip across the panel's width permanently, drawer open *or* shut,
 * against bg-background for the rest: a two-tone status bar exactly as wide as the drawer.
 * That is easy to blame on whatever else is painted up there — it was first reported as the
 * grain overlay failing to blend, and the grain had nothing to do with it.
 *
 * So the cap covers the strip and travels with the shell on the same `shift`: closed, it
 * hides the panel; opening slides it off to uncover it. Same curve as everything else in the
 * push, because it touches the scroll container and a cap that lagged the surface it caps
 * would tear along the safe-area line. It sits at z-1 with that container and never overlaps
 * it — one starts where the other ends. `md:hidden` because desktop has no panel to leak,
 * and an opaque band there would paint over the rail's own translucent top.
 *
 * If that strip ever looks wrong again, look here first, and do not "fix" it by pulling the
 * panel off the notch: that hides it and costs the continuity the full-height drawer is for.
 *
 * The scrim is the only piece that fades. It covers the shell, not the panel, so the strip
 * of app still showing is tappable to dismiss and nothing underneath can be scrolled or
 * pressed by accident — which is also why no scroll lock is needed here.
 *
 * This component is also where Android's back gesture is claimed, because it is the one
 * layer that maps to the open surface — the hook is called by four of them, and registering
 * there would push four handlers for one panel. Back dismisses rather than navigates: the
 * panel owns the screen and is not a URL, so there is nothing in history to unwind. */
export const OrgNavPanel = () => {
    const { open, close, shift } = useOrgNav()
    const { current, orgs, select } = useCurrentOrg()

    useBackHandler(open, close)

    return (
        <>
            <div
                inert={!open}
                className="md:hidden fixed inset-y-0 left-0 z-0 flex w-(--org-nav-width) flex-col bg-sidebar pt-[calc(var(--safe-top)+1rem)] pb-(--safe-bottom) pl-(--safe-left)"
            >
                <h2 className="flex h-10 items-center px-5 text-base font-semibold text-muted-foreground">
                    Memberships
                </h2>

                <div className="flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-6">
                    {orgs.map(org => (
                        <button
                            key={org.id}
                            type="button"
                            onClick={() => select(org.id)}
                            className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left"
                        >
                            <OrgRow org={org} active={org.id === current?.id} />
                        </button>
                    ))}
                </div>
            </div>

            {/* The cap. See the note above — without it this panel leaks into the status bar
                whether it is open or shut. */}
            <motion.div
                aria-hidden="true"
                initial={false}
                animate={{ x: shift }}
                transition={SLIDE_TRANSITION}
                className="md:hidden fixed inset-x-0 top-0 h-(--safe-top) z-1 bg-background pointer-events-none"
            />

            <motion.button
                type="button"
                tabIndex={open ? 0 : -1}
                aria-label="Close group switcher"
                onClick={close}
                initial={false}
                animate={{ x: shift, opacity: open ? 1 : 0 }}
                transition={SLIDE_TRANSITION}
                className={cn(
                    "md:hidden fixed inset-0 z-30 bg-background/60",
                    open ? "pointer-events-auto" : "pointer-events-none",
                )}
            />
        </>
    )
}
