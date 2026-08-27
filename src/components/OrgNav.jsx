"use client"

import { useState } from "react"
import { motion } from "motion/react"

import PlusIcon from "@/assets/svg/icons/plus.svg"
import SettingsIcon from "@/assets/svg/icons/settings.svg"
import StackIcon from "@/assets/svg/icons/stack.svg"
import HoldMenu from "@/components/HoldMenu"
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
import { useCreateOrgEntrance, useCurrentOrg, useEditOrg, useOrgNav } from "@/lib/store/org/hook"
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

/* Whether this viewer may edit this group, and the one way in.
 *
 * **The switcher is the only entrance to group settings.** There was briefly a Groups row on
 * /profile leading to a list of the groups you administer, and it was a screen whose entire
 * job was to choose between things this menu had already listed. Deleting it left the action
 * where the object is: the row for a parish is the thing that should offer to edit that
 * parish.
 *
 * That costs the one affordance a list gave for free — a visible label — so it is paid for
 * twice, once per input device. A pointer gets a gear that appears on hover, which is the
 * convention for a per-row action. A touch screen has no hover, so it gets the press-and-hold
 * that <HoldMenu/> exists for; see that component's header, which names precisely this case
 * (a control a pointer reveals on hover needing a second way in on a phone).
 *
 * Both entrances set `editingId` in the org store; <OrgEditor/>, mounted once by the shell,
 * draws it as a dialog or a sheet. It is **not** a route — nobody needs to link to a settings
 * form, and component state is what keeps Android's back gesture closing the surface rather
 * than unwinding a history entry out from under it. */
const canEdit = (org) => org?.role === ROLES.ADMIN

/* Creating a group is offered from the same menu, as a row at the foot of the list, and only
 * to a platform owner.
 *
 * **Here because this is where the set of groups is**, which is the thing being added to — the
 * switcher is already the answer to "which groups do I have", so "and make another" belongs at
 * the bottom of that answer rather than on a settings screen a level away. It is the same
 * argument that put group settings on the row instead of in a list of its own.
 *
 * It is deliberately *not* an `OrgRow` and deliberately not styled like one. The rows above it
 * are memberships — places you can go — and this is an action; giving it the same avatar and
 * role line would make an eighth group appear in a list of seven. The dashed ring and the
 * missing second line are what tell them apart, with no rule between them — a divider before a
 * single trailing item reads as the start of a section that never arrives. */
const NewGroupRow = () => (
    <>
        {/* The dot gutter every OrgRow reserves, held empty. Without it the plus would sit a
            few pixels left of the avatars above and break the one column edge that runs down
            the whole list — the same reason the rows draw a transparent dot rather than
            omitting it. */}
        <span aria-hidden="true" className="size-1.5 shrink-0" />
        <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground"
        >
            {/* The drawn glyph, like the gear on a row above — a Material ligature here would
                be the only icon in this menu from a different set. */}
            <PlusIcon className="size-4 shrink-0" />
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-medium text-foreground!">
            New group
        </span>
    </>
)

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
    const { editOrg } = useEditOrg()
    const { openCreator, canCreate } = useCreateOrgEntrance()

    /* Controlled, and only because of the gear. Selecting a row closes the menu through
     * Radix's own machinery, but the gear has to stop that select from firing (see the note
     * on it), which also takes away the close that came with it — leaving the menu open
     * underneath the settings surface. Owning the flag is what lets the gear close it
     * explicitly. */
    const [menuOpen, setMenuOpen] = useState(false)

    return (
        <div className="hidden md:flex fixed right-[calc(var(--safe-right)+0.5rem)] top-[calc(var(--safe-top)+0.5rem)] z-2 items-center p-6">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger
                    disabled={skeleton}
                    aria-label="Switch group"
                    className="flex cursor-pointer items-center gap-1.5 rounded-full bg-background py-1.5 pl-1.5 pr-2 transition-colors hover:bg-accent disabled:opacity-50"
                >
                    <OrgAvatar org={current} className="size-9 text-[10px]" />
                    <Icon size="md" className="text-muted-foreground">expand_more</Icon>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" sideOffset={8} className="w-72">
                    {orgs.map(org => (
                        <DropdownMenuItem
                            key={org.id}
                            onSelect={() => select(org.id)}
                            className="group/org flex cursor-pointer items-center gap-3 rounded-xl py-2"
                        >
                            <OrgRow org={org} active={org.id === current?.id} />

                            {/* The gear, revealed by hovering the row it belongs to.
                                `group-hover` on the item rather than a state flag, so the two
                                cannot disagree about which row the pointer is over.

                                **It is focusable even while invisible**, deliberately: opacity
                                hides it from a pointer, not from Tab, so the action stays
                                reachable by keyboard. `focus-visible:opacity-100` then makes it
                                visible the moment it is focused, which is what keeps the focus
                                ring from landing on something nobody can see.

                                `stopPropagation` keeps the click from reaching the item and
                                firing its `onSelect` twice over — but suppressing that select
                                also suppresses the close that Radix performs with it, which is
                                why the menu is controlled and closed here by hand. Without
                                that the menu would sit open underneath the settings surface
                                and still be there when it is dismissed. */}
                            {canEdit(org) && (
                                <button
                                    type="button"
                                    aria-label={`Group settings for ${org.name}`}
                                    onClick={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        setMenuOpen(false)
                                        editOrg(org.id)
                                    }}
                                    className="ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover/org:opacity-100 -mr-2"
                                >
                                    {/* The drawn glyph the rest of the app uses for settings,
                                        not the Material ligature — every icon in a row like
                                        this one is a bespoke SVG at its natural size, and a
                                        ligature here would be the only one drawn from a
                                        different set. `size-5` because it sits in a 32px
                                        button rather than a 24px row. */}
                                    <SettingsIcon className="size-5 shrink-0" />
                                </button>
                            )}
                        </DropdownMenuItem>
                    ))}

                    {/* Radix closes the menu on select, so this one needs no `setMenuOpen`
                        of its own — unlike the gear, which has to suppress the select and
                        therefore loses the close that came with it. */}
                    {canCreate && (
                        <DropdownMenuItem
                            onSelect={openCreator}
                            className="flex cursor-pointer items-center gap-3 rounded-xl py-2"
                        >
                            <NewGroupRow />
                        </DropdownMenuItem>
                    )}
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
 * actually changes the scope, so the one symbol still means one thing.
 *
 * It is the button alone — the row it sits in belongs to the page, which shares that row with
 * the notifications bell on the opposite edge. */
export const OrgNavTrigger = () => {
    const { open, toggle } = useOrgNav()

    return (
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
 * The panel runs to `inset-y-0`, under the notch and under the rail, so the drawer reads as
 * one edge-to-edge surface rather than something that stops short of the hardware. The
 * **plate** is what makes that safe, and it is rendered here rather than in the shell
 * precisely because this panel is the only reason it has to exist.
 *
 * What the shell relies on is that its scroll container is opaque on mobile. But that
 * container does not cover the viewport: it is inset at the top by --safe-top and at the
 * bottom by --bottombar. Anything in those two bands falls through to z-0 — which is this
 * panel, full height. Its bg-sidebar therefore painted both bands across the panel's width
 * permanently, drawer open *or* shut, against bg-background for the rest.
 *
 * Neither band gives the leak away directly, which is what made this expensive to find. The
 * top one reads as a two-tone status bar and got blamed on the grain overlay painted across
 * it (the grain had nothing to do with it). The bottom one is normally hidden by the rail's
 * own bg-background/80 — until the rail dims to opacity-35 while the reader is vibing, which
 * takes its backdrop to roughly a quarter opaque and lets the drawer show straight through.
 * Same single cause, two symptoms that look unrelated.
 *
 * So the plate is simply the shell's opaque surface, generalised to the whole viewport: it
 * is what the scroll container's own bg-background would be if the container were not inset.
 * It travels on the same `shift` and curve as the rest of the push — closed it hides the
 * panel, opening slides it off to uncover it — because it abuts the container and a plate
 * that lagged the surface it backs would tear along the safe-area line. Shares z-1 with the
 * container and is mounted before it, so the container paints over it. `md:hidden`: desktop
 * has no panel to leak, and an opaque plate there would cover the backdrop's gradient and
 * paint under the rail's translucency.
 *
 * If either band ever looks wrong again, look here first, and do not "fix" it by pulling the
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
    const { editOrg } = useEditOrg()
    const { openCreator, canCreate } = useCreateOrgEntrance()

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
                        /* Hold a group to act on it — the touch counterpart of the gear a
                           pointer gets on hover in <OrgSwitcher/>. <HoldMenu/> renders nothing
                           extra when `items` is empty, so a group the viewer merely belongs to
                           is left as a plain row that only selects.

                           `editOrg` also selects the group and closes this panel — see the
                           store action; the switcher the reader just acted from should not be
                           left standing behind the sheet.

                           `p-3` stays on the row itself rather than moving to a wrapper because
                           HoldMenu draws its lens copy at the row's *measured* box; changing the
                           padding between the two would make the content jump under the finger
                           at the moment of the press. See that component's header. */
                        <HoldMenu
                            key={org.id}
                            enabled={canEdit(org)}
                            items={
                                canEdit(org)
                                    ? [{
                                          icon: SettingsIcon,
                                          label: "Group settings",
                                          onSelect: () => editOrg(org.id),
                                      }]
                                    : []
                            }
                            className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left"
                        >
                            <button
                                type="button"
                                onClick={() => select(org.id)}
                                className="flex w-full cursor-pointer items-center gap-3 text-left"
                            >
                                <OrgRow org={org} active={org.id === current?.id} />
                            </button>
                        </HoldMenu>
                    ))}

                    {/* Same row, same padding as the memberships above it, so the plus lands
                        in the avatar column and the action reads as the last item in one list.
                        `openCreator` closes the panel itself — see the store action. */}
                    {canCreate && (
                        <button
                            type="button"
                            onClick={openCreator}
                            className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left"
                        >
                            <NewGroupRow />
                        </button>
                    )}
                </div>
            </div>

            {/* The plate. See the note above — without it this panel leaks out wherever the
                shell's own opaque surface has a gap, open or shut. */}
            <motion.div
                aria-hidden="true"
                initial={false}
                animate={{ x: shift }}
                transition={SLIDE_TRANSITION}
                className="md:hidden fixed inset-0 z-1 bg-background pointer-events-none"
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
