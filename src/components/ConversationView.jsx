"use client"

import { ConversationPane } from "@/components/Conversation"
import { SlideSurface } from "@/components/SlideSurface"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useSlideDismiss } from "@/lib/hooks/useSlideRoute.hook"

/* The slide route at `/inbox/c/:id`.
 *
 * **On a desktop this draws nothing.** The thread is not an overlay there — it is the
 * right half of the inbox, which is already mounted and reads the same id out of the URL
 * (`pushed` is false above the breakpoint, so the page underneath never moved). Drawing
 * here too would put a second copy of the conversation on screen with a second poller
 * behind it. A cold load has nothing mounted underneath, and the registry answers that
 * one by drawing the inbox instead — see the `inline` variant in <RuntimeRoute/>. */
const ConversationView = ({ conversationId, variant = "modal" }) => {
    const isDesktop = useIsDesktop()
    const dismiss = useSlideDismiss()

    if (isDesktop) return null

    return (
        <SlideSurface variant={variant} className="bg-background">
            <ConversationPane conversationId={conversationId} onBack={dismiss} />
        </SlideSurface>
    )
}

export default ConversationView
