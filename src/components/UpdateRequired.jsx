"use client"

import { Button } from "@/components/ui/button"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { APP_STORES } from "@/lib/constants"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { platform } from "@/lib/native"
import { useUpdateRequired } from "@/lib/store/config/hook"

/* The wall in front of a build too old to keep running.
 *
 * ── What raises it ───────────────────────────────────────────────────────────
 *
 * `minimum_version` in Remote Config, and nothing else. A release does not raise it on its own,
 * because being one patch behind is not a reason to stand between a parishioner and their
 * parish; `npm run release:android -- --force-user-update` is how a release that genuinely
 * cannot be left behind sets the floor. Everything about reading and validating that value is
 * `lib/server/config.js` and `olderThan`, both of which refuse to raise a wall on a value they
 * do not fully understand.
 *
 * ── Why it cannot be dismissed ───────────────────────────────────────────────
 *
 * Because it is only ever shown for a build that cannot be trusted to work. A sheet that could
 * be swiped away would put the reader back in the app the flag was flipped to get them out of,
 * so the grab bar is off, the overlay does not close it, and Android's back does nothing while
 * it is up. Leaving is the home button, and coming back lands here again until the phone has
 * the new build.
 *
 * ── Mounted at the root ──────────────────────────────────────────────────────
 *
 * Above both route groups, so it covers the login screen as surely as the feed. A version floor
 * that only applied once somebody was signed in would be missing in the case it exists for: a
 * build so far behind that signing in is itself what fails. */

/* Where to send them, or null on a platform whose listing has no address yet. The iOS entry of
 * `APP_STORES` is null until the app is accepted, and a button pointing at nothing is worse
 * than the sentence below, which at least names the place. */
const storeUrl = () => APP_STORES[platform()] ?? null

const UpdateRequired = () => {
    const required = useUpdateRequired()
    const store = storeUrl()

    /* Swallows the gesture rather than handling it. `useBackHandler` is a stack, so claiming
     * the top of it is what stops back falling through to whatever was open underneath and
     * leaving the reader in the app this is here to keep them out of. */
    useBackHandler(required, () => {})

    return (
        <Drawer open={required} onOpenChange={() => {}} dismissible={false}>
            <DrawerContent handle={false} className="pb-(--safe-bottom)">
                <DrawerHeader className="pt-8">
                    <DrawerTitle className="text-xl">Update Grapevine</DrawerTitle>
                    <DrawerDescription className="text-balance">
                        {store
                            ? "This version is no longer supported. Update to carry on reading your parish."
                            : "This version is no longer supported. Open the App Store and update Grapevine to carry on."}
                    </DrawerDescription>
                </DrawerHeader>

                {store && (
                    <DrawerFooter>
                        {/* A plain anchor, which is all a native build needs: Capacitor's
                            navigation delegate cancels any navigation off the app's origin and
                            hands the URL to the OS, so this opens the store app itself. */}
                        <Button asChild size="lg">
                            <a href={store} target="_blank" rel="noreferrer">
                                Update
                            </a>
                        </Button>
                    </DrawerFooter>
                )}
            </DrawerContent>
        </Drawer>
    )
}

export default UpdateRequired
