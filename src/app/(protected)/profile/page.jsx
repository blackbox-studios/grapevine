"use client"

import Link from "next/link"

import VerifiedIcon from "@/assets/svg/icons/verified.svg"
import Icon from "@/components/Icon"
import { Avatar } from "@/components/Widgets"
import { ROLES, ROUTES } from "@/lib/constants"
import { displayName } from "@/lib/name"
import { useLogout } from "@/lib/store/auth/hook"
import { useUser } from "@/lib/store/auth/hook"
import { useCurrentOrg } from "@/lib/store/org/hook"
import { cn, roleLabel } from "@/lib/utils"

/* The account surface: who the viewer is, and every destination that hangs off them.
 *
 * **This replaced a popover, and the replacement is the point.** Settings and the roster used
 * to be reached from a menu on a desktop and from a two-column tab rail once you were inside
 * Settings — the same handful of destinations expressed twice, in two shapes, neither of which
 * fitted a phone (the rail's fixed 10rem column pushed the roster table off the right edge).
 * One page with one list is the same answer at every width, and adding a destination is a row
 * rather than a decision about which surface it belongs on.
 *
 * **Both the check and the role describe the *selected* group, not the viewer globally.** That
 * is the switcher's whole purpose: someone who administers their parish and merely belongs to
 * their diocese is an administrator on one and a member on the other, from the same session.
 * A global `user.role` here would state the role of whichever membership happened to load
 * first, and the check beside it would then disagree with the composer's presence two taps
 * away. It is the same rule the server applies to an author's check — `Membership.role ==
 * ADMIN` in the group the content is being read in. */

/* One destination. The circular icon disc, the label, and a chevron — a shape that reads as
 * "this goes somewhere", which a bare text row does not.
 *
 * `onClick` rather than `href` is what lets logout share it: signing out is not a place, but
 * it belongs in this list because it is one of the things a person comes here to do, and a
 * button that looked different from its neighbours would only be drawing attention to an
 * implementation detail. */
const Row = ({ icon, label, href, onClick, destructive = false }) => {
    const body = (
        <>
            <span
                className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted",
                    destructive ? "text-destructive" : "text-foreground",
                )}
            >
                <Icon size="md">{icon}</Icon>
            </span>
            <span
                className={cn(
                    "flex-1 text-base font-medium",
                    destructive && "text-destructive",
                )}
            >
                {label}
            </span>
            <Icon size="xl" className="text-muted-foreground">chevron_right</Icon>
        </>
    )

    const className =
        "flex w-full cursor-pointer items-center gap-3 rounded-full px-4 py-3 text-left transition-colors hover:bg-accent"

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

const ProfilePage = () => {
    const user = useUser()
    const { current, isAdmin } = useCurrentOrg()
    const { logout } = useLogout()

    return (
        <div className="mx-auto w-full max-w-[470px] pt-6 pb-10 md:pt-0">
            <header className="flex flex-col items-center gap-3 pb-8 text-center">
                <Avatar person={user} className="size-24 text-2xl" />

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

                    {/* The role, then the group it is held in. Without the group the word
                        "Member" is unanswerable for anyone in more than one — and it is the
                        line that explains why the check above is or is not there. */}
                    <p className="text-sm text-muted-foreground">
                        {roleLabel(current?.role ?? ROLES.MEMBER)}
                    </p>

                    {user?.email && (
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                    )}
                </div>
            </header>

            <nav className="flex flex-col gap-1 border-t pt-4">
                <Row icon="settings" label="General" href={ROUTES.SETTINGS} />

                {/* Only for an admin of the group currently selected — which is the same gate
                    the roster page applies to itself, and the same one the API enforces. A
                    member switching into a group they administer gets the row without a
                    reload; switching back takes it away. */}
                {isAdmin && (
                    <Row icon="group" label="Users" href={ROUTES.SETTINGS_USERS} />
                )}

                <Row icon="logout" label="Log out" onClick={logout} destructive />
            </nav>
        </div>
    )
}

export default ProfilePage
