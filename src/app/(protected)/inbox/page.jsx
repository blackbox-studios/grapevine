"use client"

import { MessagesList } from "@/components/Messages"
import { useMessagingPermitted } from "@/lib/store/messages/hook"

/* Direct messages. The list is this page; a conversation is the `/inbox/c/:id` slide
 * route that pushes in over it. The surface itself is <MessagesList/> — this file is
 * the route and the adult gate.
 *
 * **No back arrow**, unlike a settings sub-page: this is a nav destination the rail
 * reaches directly, and an arrow on it would point at whatever the reader happened to
 * be looking at rather than at a parent.
 *
 * The gate renders nothing rather than an explanation: the nav entry is already hidden
 * from a viewer under 18, so the only way here is a typed URL, and a blank page
 * confirms less than a refusal would. The server refuses every messaging request
 * regardless — this is presentation, `requireMessaging` is the control. */
const InboxPage = () => {
    const permitted = useMessagingPermitted()

    return permitted ? <MessagesList /> : null
}

export default InboxPage
