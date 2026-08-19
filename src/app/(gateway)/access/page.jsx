"use client"

import GatewayShell, { GatewayButton } from "@/components/GatewayShell"
import { ACCESS } from "@/lib/constants"
import { useLogout, useUser } from "@/lib/store/auth/hook"

/* The closed door.
 *
 * Reached by anyone who is signed in but has no group that will have them. Revoking is a
 * status change rather than a delete, so their Supabase account still works and they can
 * still authenticate — which means without this screen they would land in the app and find
 * an empty feed, with nothing to tell them why. An empty feed reads as a broken app; this
 * reads as a decision, which is the truth.
 *
 * Two states share the surface because they are the same situation from the viewer's side
 * — there is nothing here for you — and differ only in the wording that is true. Signing
 * out is the one action offered, and that is the whole point: admission is the admin's to
 * give, nobody can ask for it, and so the only honest next step is to talk to a person. */

const COPY = {
    [ACCESS.REVOKED]: {
        heading: "Your access has been removed",
        subheading:
            "You are no longer a member of this parish community. If you think this is a mistake, please speak with your parish administrator.",
    },
    [ACCESS.NONE]: {
        heading: "No parish yet",
        subheading:
            "Your account exists, but it is not attached to a parish. Your parish administrator can add you.",
    },
}

const AccessPage = () => {
    const user = useUser()
    const { logout } = useLogout()

    /* Falls back to the revoked wording rather than rendering nothing: whatever unexpected
     * state got someone here, "there is nothing for you and here is who to ask" is the
     * useful thing to say. */
    const copy = COPY[user?.access] ?? COPY[ACCESS.REVOKED]

    return (
        <GatewayShell heading={copy.heading} subheading={copy.subheading}>
            <div className="flex w-full max-w-88 flex-col items-center gap-5">
                <GatewayButton type="button" onClick={logout}>
                    Sign out
                </GatewayButton>

                {user?.email && (
                    <p className="text-center text-xs leading-relaxed text-muted-foreground">
                        Signed in as{" "}
                        <span className="font-medium text-foreground">{user.email}</span>
                    </p>
                )}
            </div>
        </GatewayShell>
    )
}

export default AccessPage
