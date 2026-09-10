import { useMemo } from "react"

import useAppStore from "@/lib/store/app/store"
import useAuthStore from "@/lib/store/auth/store"
import useCalendarStore from "@/lib/store/calendar/store"
import useFeedStore from "@/lib/store/feed/store"
import useFollowsStore from "@/lib/store/follows/store"
import usePostStore from "@/lib/store/post/store"
import useProfileStore from "@/lib/store/profile/store"
import useCommentsStore from "@/lib/store/comments/store"
import useMembersStore from "@/lib/store/members/store"
import useMessagesStore from "@/lib/store/messages/store"
import useNotificationsStore from "@/lib/store/notifications/store"
import useOrgStore from "@/lib/store/org/store"
import usePushStore from "@/lib/store/push/store"
import useSheetStore from "@/lib/store/sheet/store"
import useSignupsStore from "@/lib/store/signups/store"
import useUploadsStore from "@/lib/store/uploads/store"
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
    const profileError = useProfileStore(state => state.error)
    const followsError = useFollowsStore(state => state.error)
    const membersError = useMembersStore(state => state.error)
    const messagesError = useMessagesStore(state => state.error)
    const notificationsError = useNotificationsStore(state => state.error)
    const orgError = useOrgStore(state => state.error)
    const calendarError = useCalendarStore(state => state.error)
    const signupsError = useSignupsStore(state => state.error)
    const sheetError = useSheetStore(state => state.error)
    const pushError = usePushStore(state => state.error)
    const uploadsError = useUploadsStore(state => state.error)
    const clearErrors = useGlobalStore(state => state.clearErrors)

    return useMemo(() => ({
        errors: {
            app: appError,
            auth: authError,
            org: orgError,
            calendar: calendarError,
            signups: signupsError,
            sheet: sheetError,
            feed: feedError,
            post: postError,
            comments: commentsError,
            profile: profileError,
            follows: followsError,
            members: membersError,
            messages: messagesError,
            notifications: notificationsError,
            push: pushError,
            uploads: uploadsError,
        },
        clearErrors,
    }), [
        appError, authError, orgError, calendarError, signupsError, sheetError,
        feedError, postError, commentsError,
        profileError, followsError, membersError, messagesError, notificationsError, pushError,
        uploadsError, clearErrors,
    ])
}
