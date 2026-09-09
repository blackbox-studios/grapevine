"use client"

import AppsIcon from "@/assets/svg/icons/apps-outline.svg"
import PowerIcon from "@/assets/svg/icons/power.svg"
import SettingsIcon from "@/assets/svg/icons/settings.svg"
import UsersIcon from "@/assets/svg/icons/users.svg"
import Badge from "@/components/Badge"
import Icon from "@/components/Icon"
import { SettingsRow } from "@/components/Settings"
import { Avatar, Count } from "@/components/Widgets"
import { ROUTES } from "@/lib/constants"
import { displayName } from "@/lib/name"
import { useLogout, useUser } from "@/lib/store/auth/hook"
import { useOpenProfile } from "@/lib/store/profile/hook"
import { roleLabel } from "@/lib/utils"

/* The account surface: who the viewer is, and everything that hangs off them. It is also
 * `/settings` itself — the index of the account tree rather than a sibling of it, so the list
 * of destinations *is* the landing page and General is one row on it.
 *
 * **One list, not a menu and a tab rail.** Reaching Settings from a desktop popover and then
 * moving between its pages on a two-column rail expresses the same handful of destinations
 * twice, in two shapes, neither of which fits a phone. One page with one list is the same
 * answer at every width, and adding a destination is a row rather than a decision about which
 * surface it belongs on.
 *
 * **Nothing here is about a group.** No admin check, no role, no roster — a group is not a
 * setting of yours: your standing in it can change and you can be removed from it, and its
 * surface is admin-only where this one is everyone's. That lives at `/group`, which is the same
 * shape asked about a different subject. What is left here is the person: their face, their
 * standing in the Church, and who they are connected to.
 *
 * **The picture opens their public card**, which is the same one anybody else's byline opens —
 * the way to see how the parish sees you is to look at what the parish looks at. Editing is a
 * row further down, because a form that long is a place you go. */

const SettingsPage = () => {
    const user = useUser()
    const { logout } = useLogout()
    const { openProfile } = useOpenProfile()

    /* The @handle is shown only when there is a name above it: `displayName` falls back to
     * `@handle` for someone who has not finished orientation, so showing it here as well would
     * print the same string twice. The condition is `displayName`'s own. */
    const handle =
        (user?.firstName || user?.lastName) && user?.handle ? `@${user.handle}` : null

    return (
        <div className="mx-auto w-full max-w-[470px] pt-6 md:pt-0">
            <header className="flex flex-col items-center gap-3 pb-8 text-center">
                <button
                    type="button"
                    disabled={!user?.handle}
                    onClick={() => openProfile(user.handle)}
                    aria-label="Your profile"
                    className="relative rounded-full outline-hidden not-disabled:cursor-pointer disabled:pointer-events-none"
                >
                    <Avatar person={user} className="size-24 text-2xl" />

                    {/* A picture is not obviously pressable, so it wears a badge in the same
                        corner and at the same size as `<AvatarPicker/>`'s edit pencil on
                        `/settings/info`. The glyph points up and out because what it opens is
                        not another page in this list: it is the card the rest of the parish
                        sees, over the top of wherever you are. A span rather than a button: it
                        is inside the one that already handles the tap, and a nested button
                        would be both invalid and a second target for the same action. */}
                    <span
                        aria-hidden="true"
                        className="absolute -right-2 -top-0.5 grid size-8 place-items-center rounded-full bg-background text-foreground ring-3 ring-background"
                    >
                        <Icon size="sm">arrow_outward</Icon>
                    </span>
                </button>

                <div className="flex flex-col items-center gap-0.5">
                    <h2 className="text-3xl font-semibold text-foreground">
                        {displayName(user) || "—"}
                    </h2>

                    {/* Their standing in the Church, which is global — unlike a role, which is
                        per-group and belongs on the group's own surface. */}
                    <Badge className="mt-1.5">{roleLabel(user?.vocation)}</Badge>

                    {/* The @handle rather than the address. It is the identity other people
                        see — the byline over a comment, the name in a mention — where an email
                        is a credential nobody else ever reads. */}
                    {handle && (
                        <p className="mt-2 text-sm text-muted-foreground">{handle}</p>
                    )}
                </div>

                {/* The tallies, which open the same card the picture does — but each on the
                    tab it names. They are here rather than in the row list because a number is
                    not a destination: it is a fact with a list behind it, the card is where that
                    list lives, and landing on Info would make the reader tap twice for the thing
                    they already pointed at. */}
                <div className="flex items-center gap-2 -mt-1">
                    <Count
                        value={user?.followers ?? 0}
                        label="followers"
                        onClick={() => user?.handle && openProfile(user.handle, "followers")}
                    />
                    <Count
                        value={user?.followingCount ?? 0}
                        label="following"
                        onClick={() => user?.handle && openProfile(user.handle, "following")}
                    />
                </div>
            </header>

            <nav className="flex flex-col gap-1 border-t pt-4">
                <SettingsRow icon={UsersIcon} label="Account" href={ROUTES.SETTINGS_INFO} />
                <SettingsRow
                    icon={SettingsIcon}
                    label="General"
                    href={ROUTES.SETTINGS_GENERAL}
                />
                <SettingsRow icon={AppsIcon} label="About" href={ROUTES.SETTINGS_ABOUT} />
                <SettingsRow icon={PowerIcon} label="Log out" onClick={logout} destructive />
            </nav>
        </div>
    )
}

export default SettingsPage
