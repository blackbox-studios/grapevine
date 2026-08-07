import { useMemo } from "react"

import useAppStore from "@/lib/store/app/store"
import useAuthStore from "@/lib/store/auth/store"
import useGlobalStore from "@/lib/store/global.store"

/* Aggregates errors from every store. Error values may be primitives
 * (false | string | Error) or nested objects keyed by resource; useErrorListener
 * walks them recursively. */
export const useErrors = () => {
    const appError = useAppStore(state => state.error)
    const authError = useAuthStore(state => state.error)
    const clearErrors = useGlobalStore(state => state.clearErrors)

    return useMemo(() => ({
        errors: {
            app: appError,
            auth: authError,
        },
        clearErrors,
    }), [appError, authError, clearErrors])
}
