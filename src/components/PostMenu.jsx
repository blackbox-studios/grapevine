"use client"

import { useCallback, useMemo, useState } from "react"

import Icon from "@/components/Icon"
import { ConfirmDialog } from "@/components/Widgets"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePostDelete } from "@/lib/store/post/hook"
import { cn } from "@/lib/utils"

/* What can be done to a post, and the one way of offering it.
 *
 * **What the viewer may do is the server's answer, not this file's.** `post.canDelete` is
 * composed in `projectPost` from their role in that post's group — so the same person carries
 * it in the parish they administer and not in the diocese they merely belong to, and a shared
 * link that opens a post from neither carries nothing. Nothing here re-derives that rule;
 * this only decides how to present it, and the endpoint refuses regardless.
 *
 * **An empty menu is not rendered.** A reader with no available action sees no ellipsis at
 * all, rather than a control that opens onto nothing.
 *
 * **One presentation on every surface and every platform**, unlike a comment row, which
 * offers a hover-revealed trash on a pointer and a press-and-hold on a touch screen. A
 * comment needs that split because it has no chrome of its own to hang a control off — a
 * trash icon on every row would crowd the thread. A post card already has a header with room
 * in its top corner, so the ellipsis is available to a finger and a cursor alike, and adding a
 * hold beside it would give one action two entrances and a different amount of confirmation
 * depending on which was used. */

/* The actions available on a post, as data.
 *
 * A list rather than a boolean so that pinning, editing, or reporting slot in as another
 * entry with no change here. `confirm` is the wording the menu asks with; an action without
 * it runs immediately.
 *
 * `dismiss` is how the surface showing this post closes itself, and it belongs to the action
 * rather than to the caller's `onSelect`: removing the open post has to take the overlay with
 * it, and doing that a round trip later leaves the reader looking at something that no longer
 * exists. Omit it on the feed card, where there is nothing to close. */
const usePostActions = (post, dismiss) => {
    const { remove } = usePostDelete()

    /* A post the server hasn't confirmed yet has no id to delete by, exactly as an optimistic
     * comment row doesn't. */
    const deletable = Boolean(post?.canDelete) && !post?.pending
    const postId = post?.id

    return useMemo(() => {
        if (!deletable) return []

        return [{
            key: "delete",
            label: "Delete post",
            icon: "delete",
            destructive: true,
            confirm: {
                title: "Delete post?",
                description:
                    "This removes it from the group's feed for everyone, along with its comments. It cannot be undone.",
            },
            run: () => remove(postId, dismiss),
        }]
    }, [deletable, postId, remove, dismiss])
}

/* The ellipsis, and the menu behind it. Renders nothing when there is nothing to offer. */
export const PostMenuTrigger = ({ post, dismiss, className }) => {
    const actions = usePostActions(post, dismiss)
    /* The action awaiting confirmation, or null. Holding the action rather than a boolean is
     * what lets a second entry arrive later without a second piece of state. */
    const [confirming, setConfirming] = useState(null)

    const select = useCallback((action) => {
        if (action.confirm) setConfirming(action)
        else action.run()
    }, [])

    if (actions.length === 0) return null

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label="Post options"
                        className={cn(
                            "cursor-pointer text-muted-foreground transition-colors hover:text-foreground",
                            className,
                        )}
                    >
                        <Icon size="lg">more_horiz</Icon>
                    </button>
                </DropdownMenuTrigger>
                {/* The primitive sizes its panel to the trigger, which here is a single
                  * glyph — so the width is taken back and set from the content instead. */}
                <DropdownMenuContent align="end" className="w-auto min-w-44 gap-1">
                    {actions.map((action) => (
                        <DropdownMenuItem
                            key={action.key}
                            variant={action.destructive ? "destructive" : "default"}
                            onSelect={() => select(action)}
                        >
                            <Icon size="md">{action.icon}</Icon>
                            {action.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <ConfirmDialog
                open={confirming !== null}
                onOpenChange={(open) => !open && setConfirming(null)}
                title={confirming?.confirm.title}
                description={confirming?.confirm.description}
                onConfirm={() => confirming?.run()}
            />
        </>
    )
}
