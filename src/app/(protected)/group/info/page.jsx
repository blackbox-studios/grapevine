"use client"

import { BackHeader } from "@/components/BackHeader"
import OrgSettings from "@/components/OrgSettings"
import { ROUTES } from "@/lib/constants"

/* A group's own name, description and picture — the account tree's Info page, asked about a
 * parish. The form and its danger zone are `<OrgSettings/>`; this is the frame.
 *
 * `bleed` for the reason every other sub-page passes it: a back arrow is a phone's affordance,
 * and on a desktop the nav rail never leaves. */
const GroupInfoPage = () => (
    <>
        <BackHeader title="Group settings" back={ROUTES.GROUP} bleed />

        <div className="mx-auto w-full max-w-[470px] pb-10 md:pt-0">
            <OrgSettings />
        </div>
    </>
)

export default GroupInfoPage
