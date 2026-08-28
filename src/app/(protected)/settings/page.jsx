"use client"

import Link from "next/link"

import PowerIcon from "@/assets/svg/icons/power.svg"
import SettingsIcon from "@/assets/svg/icons/settings.svg"
import UsersIcon from "@/assets/svg/icons/users.svg"
import VerifiedIcon from "@/assets/svg/icons/verified.svg"
import { AvatarPicker } from "@/components/AvatarPicker"
import Icon from "@/components/Icon"
import { ROLES, ROUTES } from "@/lib/constants"
import { displayName } from "@/lib/name"
import { useLogout } from "@/lib/store/auth/hook"
import { useUser } from "@/lib/store/auth/hook"
import { useCurrentOrg } from "@/lib/store/org/hook"
import { cn, roleLabel } from "@/lib/utils"

/* The account surface: who the viewer is, and every destination that hangs off them. It is
 * also `/settings` itself — the index of the settings tree rather than a sibling of it, so
 * the list of destinations *is* the landing page and General is one row on it.
 *
 * **One list, not a menu and a tab rail.** Reaching Settings from a desktop popover and then
 * moving between its pages on a two-column rail expresses the same handful of destinations
 * twice, in two shapes, neither of which fits a phone — a fixed 10rem column pushes the roster
 * table off the right edge. One page with one list is the same answer at every width, and
 * adding a destination is a row rather than a decision about which surface it belongs on.
 *
 * **Both the check and the role describe the *selected* group, not the viewer globally.** That
 * is the switcher's whole purpose: someone who administers their parish and merely belongs to
 * their diocese is an administrator on one and a member on the other, from the same session.
 * A global `user.role` here would state the role of whichever membership happened to load
 * first, and the check beside it would then disagree with the composer's presence two taps
 * away. It is the same rule the server applies to an author's check — `Membership.role ==
 * ADMIN` in the group the content is being read in. */

/* One destination. An icon, the label, and a chevron — a shape that reads as "this goes
 * somewhere", which a bare text row does not.
 *
 * `onClick` rather than `href` is what lets logout share it: signing out is not a place, but
 * it belongs in this list because it is one of the things a person comes here to do, and a
 * button that looked different from its neighbours would only be drawing attention to an
 * implementation detail. */
const Row = ({ icon: RowIcon, label, href, onClick, destructive = false }) => {
    const body = (
        <>
            {/* The bare icon — no disc, no ring. The span stays only to carry the row's tone:
                `icon` is a drawn SVG whose paths are all currentColor, so it inherits red on
                the destructive row the same way the chevron below does.

                Unlike that chevron, these are not Material Symbols ligature names. They are
                bespoke files that ship at their natural 24px, and every row uses that one size,
                which is what keeps the labels aligned without a fixed-width slot. */}
            <span
                className={cn(
                    "flex shrink-0 items-center justify-center",
                    destructive ? "text-destructive" : "text-foreground",
                )}
            >
                <RowIcon className="size-6 shrink-0" />
            </span>
            <span
                className={cn(
                    "flex-1 text-base font-medium",
                    destructive && "text-destructive",
                )}
            >
                {label}
            </span>
            {/* The chevron takes the row's tone too. Leaving it muted on the destructive row
                left one grey element in a line that is otherwise entirely red, which reads as
                the arrow belonging to something else. */}
            <Icon
                size="xl"
                className={destructive ? "text-destructive" : "text-muted-foreground"}
            >
                chevron_right
            </Icon>
        </>
    )

    const className =
        "flex w-full cursor-pointer items-center gap-5 rounded-full px-4 py-3 text-left transition-colors hover:bg-accent"

    if (href) {
        return (
            <Link href={href} scroll={false} className={className}>
                {body}
            </Link>
        )
    }

    return (
        <button type="button" onClick={onClick} className={className}>
            {body}
        </button>
    )
}

const SettingsPage = () => {
    const user = useUser()
    const { current, isAdmin } = useCurrentOrg()
    const { logout } = useLogout()

    /* The @handle is shown only when there is a name above it: `displayName` falls back to
     * `@handle` for someone who has not finished orientation, so showing it here as well would
     * print the same string twice. The condition is `displayName`'s own. */
    const handle =
        (user?.firstName || user?.lastName) && user?.handle ? `@${user.handle}` : null

    /* No `pb-10` of its own any more: this page sits inside the settings layout now, and that
     * layout supplies it. Everything else is as it was as a top-level route. */
    return (
        <div className="mx-auto w-full max-w-[470px] pt-6 md:pt-0">
            <header className="flex flex-col items-center gap-3 pb-8 text-center">
                {/* The only editable thing on this surface, so the control lives on the
                    picture itself rather than behind an "Edit profile" row that would lead to
                    a screen holding one field. */}
                <AvatarPicker person={user} className="size-24" />

                <div className="flex flex-col items-center gap-0.5">
                    <div className="flex items-baseline justify-center gap-2">
                        <h2 className="text-3xl font-semibold text-foreground">
                            {displayName(user) || "—"}
                        </h2>
                        {isAdmin && (
                            <VerifiedIcon
                                aria-label={`Administrator of ${current?.name ?? "this group"}`}
                                className="shrink-0 text-foreground"
                            />
                        )}
                    </div>

                    {/* The role, held in the *selected* group — the line that explains why the
                        check above is or is not there. */}
                    <p className="text-sm text-muted-foreground">
                        {roleLabel(current?.role ?? ROLES.MEMBER)}
                    </p>

                    {/* The @handle rather than the address. It is the identity other people
                        see — the byline over a comment, the name in a mention — where an email
                        is a credential nobody else ever reads. */}
                    {handle && <p className="text-sm text-muted-foreground">{handle}</p>}
                </div>
            </header>

            <nav className="flex flex-col gap-1 border-t pt-4">
                <Row icon={SettingsIcon} label="General" href={ROUTES.SETTINGS_GENERAL} />

                {/* Only for an admin of the group currently selected — which is the same gate
                    the roster page applies to itself, and the same one the API enforces. A
                    member switching into a group they administer gets the row without a
                    reload; switching back takes it away. */}
                {isAdmin && (
                    <Row icon={UsersIcon} label="Users" href={ROUTES.SETTINGS_USERS} />
                )}

                <Row icon={PowerIcon} label="Log out" onClick={logout} destructive />
            </nav>
        </div>
    )
}

export default SettingsPage
