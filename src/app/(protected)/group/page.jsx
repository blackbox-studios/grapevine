"use client"

import { useRouter } from "next/navigation"

import SettingsIcon from "@/assets/svg/icons/settings.svg"
import UsersIcon from "@/assets/svg/icons/users.svg"
import Icon from "@/components/Icon"
import { SettingsRow } from "@/components/Settings"
import { OrgAvatar } from "@/components/Widgets"
import { ROLES, ROUTES } from "@/lib/constants"
import { useCurrentOrg } from "@/lib/store/org/hook"
import { roleLabel } from "@/lib/utils"

/* Administering a group: the index of the group tree, and deliberately the same shape as
 * `/settings`.
 *
 * **The parallel is the design.** The account surface is a picture, a name, a standing, and a
 * list of destinations; so is this, asked about a parish instead of a person. A reader who has
 * used one already knows how to read the other, and both trees are drawn by the same
 * `<SettingsRow/>` so that stays true.
 *
 * **Scoped to the selected group, with no id in the URL.** The switcher's gear selects the row
 * it belongs to on the way in (`useEditOrg`), which is what lets all three pages here be static
 * routes — a group id is a cuid from a live database, and a `/group/[orgId]` segment would need
 * `generateStaticParams` under the static export.
 *
 * **The picture goes to the feed.** On `/settings` the picture opens the card the parish sees
 * of you; the equivalent for a parish is the thing the parish actually is, which is its feed.
 * Both are "show me the public face of this subject". */

const GroupPage = () => {
    const { current } = useCurrentOrg()
    const router = useRouter()

    return (
        <div className="mx-auto w-full max-w-[470px] pt-6 md:pt-0">
            <header className="flex flex-col items-center gap-3 pb-8 text-center">
                <button
                    type="button"
                    onClick={() => router.push(ROUTES.DEFAULT, { scroll: false })}
                    aria-label="Go to the feed"
                    className="relative cursor-pointer rounded-full outline-hidden"
                >
                    <OrgAvatar org={current} className="size-24 text-2xl" />

                    {/* The badge `/settings` puts on the viewer's picture, saying the same
                        thing about a different subject: this opens the public face of what you
                        are looking at. A span rather than a button — it is inside the one that
                        already handles the tap. */}
                    <span
                        aria-hidden="true"
                        className="absolute -right-2 -top-0.5 grid size-8 place-items-center rounded-full bg-background text-foreground ring-3 ring-background"
                    >
                        <Icon size="sm">arrow_outward</Icon>
                    </span>
                </button>

                <div className="flex flex-col items-center gap-0.5">
                    <h2 className="text-3xl font-semibold text-foreground">
                        {current?.name ?? "—"}
                    </h2>

                    {/* Your role *here*, which is the one thing on this surface that is about
                        you rather than about the group — and the reason the account page no
                        longer carries it. A role is per-group, so it belongs on the group. */}
                    <p className="text-sm text-muted-foreground">
                        {roleLabel(current?.role ?? ROLES.MEMBER)}
                    </p>
                </div>
            </header>

            <nav className="flex flex-col gap-1 border-t pt-4">
                <SettingsRow icon={SettingsIcon} label="Group settings" href={ROUTES.GROUP_INFO} />
                <SettingsRow icon={UsersIcon} label="Users" href={ROUTES.GROUP_USERS} />
            </nav>
        </div>
    )
}

export default GroupPage
