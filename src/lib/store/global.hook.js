import { useMemo } from "react"

import useAppStore from "@/lib/store/app/store"
import useAuthStore from "@/lib/store/auth/store"
import useFeedStore from "@/lib/store/feed/store"
import usePostStore from "@/lib/store/post/store"
import useCommentsStore from "@/lib/store/comments/store"
import useMembersStore from "@/lib/store/members/store"
import useOrgStore from "@/lib/store/org/store"
import useGlobalStore from "@/lib/store/global.store"

/* Aggregates errors from every store. Error values may be primitives
 * (false | string | Error) or nested objects keyed by resource; useErrorListener
 * walks them recursively. */
export const useErrors = () => {
    const appError = useAppStore(state => state.error)
    const authError = useAuthStore(state => state.error)
    const feedError = useFeedStore(state => state.error)
    const postError = usePostStore(state => state.error)
    const commentsError = useCommentsStore(state => state.error)
    const membersError = useMembersStore(state => state.error)
    const orgError = useOrgStore(state => state.error)
    const clearErrors = useGlobalStore(state => state.clearErrors)

    return useMemo(() => ({
        errors: {
            app: appError,
            auth: authError,
            org: orgError,
            feed: feedError,
            post: postError,
            comments: commentsError,
            members: membersError,
        },
        clearErrors,
    }), [
        appError, authError, orgError, feedError,
        postError, commentsError, membersError, clearErrors,
    ])
}
