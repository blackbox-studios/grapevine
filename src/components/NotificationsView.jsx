"use client"

import { BackHeader } from "@/components/BackHeader"
import { NotificationList } from "@/components/Notifications"
import { SlideSurface } from "@/components/SlideSurface"
import { Close } from "@/components/Widgets"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useSlideDismiss } from "@/lib/hooks/useSlideRoute.hook"

/* The URL-driven surface for `/notifications`, which is how the panel is reached on a phone.
 *
 * It is the second slide route, and it is deliberately thin — everything that makes it behave
 * like one comes from the shared pieces rather than from here. <SlideSurface/> is the sheet
 * and the animation, `useSlideDismiss` is the close button, Escape, and the hardware back
 * gesture, and <SlidePage/> handles the cold load. What is left is a header and the list, and
 * the list is the same <NotificationList/> the desktop popover renders.
 *
 * **Desktop presents it as a centered dialog**, mirroring how a post does. The bell in the nav
 * rail opens the popover rather than this route, so the only ways here on a wide screen are a
 * bookmarked URL or a window resized while it was open — but both are reachable, and a
 * full-screen sheet on a desktop would read as the app having navigated somewhere. */
const NotificationsView = ({ variant = "modal" }) => {
    const isDesktop = useIsDesktop()
    const dismiss = useSlideDismiss()

    const heading = (
        <h2 className="text-xl font-semibold tracking-tight">Notifications</h2>
    )

    if (isDesktop) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
                {/* The backdrop dismisses; the panel above it does not, so a click inside the
                    list never closes the thing being read. */}
                <button
                    type="button"
                    aria-label="Close notifications"
                    onClick={dismiss}
                    className="absolute inset-0 cursor-default"
                />
                <div className="relative flex h-[min(70dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-background shadow-lg">
                    <div className="flex items-center justify-between px-5 py-4">
                        {heading}
                        <Close aria-label="Close notifications" onClick={dismiss} />
                    </div>
                    <NotificationList className="min-h-0 flex-1 pb-3" />
                </div>
            </div>
        )
    }

    return (
        <SlideSurface variant={variant} className="bg-background">
            {/* A back arrow rather than the floating <Close/> pill: this surface fills the
                screen and reads as a place, so the affordance that fits is the one that says
                "go back". */}
            <BackHeader title="Notifications" back={dismiss} />

            {/* Pads its foot by the home-indicator inset, less whatever the surface has
                already been lifted by — the surface covers the mobile rail, which is what used
                to provide that clearance. */}
            <NotificationList className="min-h-0 flex-1 pb-[calc(1rem+var(--bottom-inset)-var(--keyboard-inset))]" />
        </SlideSurface>
    )
}

export default NotificationsView
