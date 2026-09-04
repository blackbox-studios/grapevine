import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS, PAGE_SIZE, ROLES } from '@/lib/constants'
import { mockId } from '@/lib/mock'
import useAuthStore from '@/lib/store/auth/store'
import { documentType, formatBytes, toErrorList } from '@/lib/utils'

/* The dashboard feed: one paginated list of posts, and nothing else.
 *
 * The open post lives in the `post` store, not here. The split matters because the two have
 * different lifetimes and different owners — the feed is a long-lived list the reader scrolls
 * and refreshes, while the open post is transient and addressed by id (including on a cold
 * deep link, where there is no feed at all). What this store keeps of a post is a
 * *projection*: the row it paged in. `cachedPost` / `patchPost` are how the `post` store
 * reads and writes that projection.
 *
 * **The feed is scoped to the selected group.** `orgId` records which one is loaded, and
 * `load` takes the target as an argument rather than reading the org store — that is what
 * keeps the imports one-directional (see the header of lib/store/org/store.js). A different
 * id empties the list and drops readiness, so the switcher's tap paints a skeleton on the
 * next frame instead of leaving another parish's posts on screen under a new heading. */

/* The uploaded descriptors a composer holds → the media shape a card renders.
 *
 * A local twin of `projectMedia` on the server, and deliberately the same shape: the
 * optimistic row is on screen for a round trip and is then swapped for the real resource, so
 * anything the two disagree about is a visible reflow at the moment of confirmation. The two
 * split by `kind` identically and format through the same `formatBytes`/`documentType`, which
 * is why those live in `lib/utils.js` rather than in the projection.
 *
 * It cannot simply *be* `projectMedia`: that one reads database rows behind `server-only`,
 * and these are upload descriptors that have never been near the database. */
const projectPending = (media) => {
    const images = media.filter(item => item.kind !== 'DOCUMENT')
    const document = media.find(item => item.kind === 'DOCUMENT')

    return {
        ...(images.length === 1
            ? { image: images[0].url, width: images[0].width, height: images[0].height }
            : {}),
        ...(images.length > 1 ? { images: images.map(item => item.url) } : {}),
        ...(document
            ? {
                  document: {
                      name: document.fileName ?? 'Attachment',
                      size: formatBytes(document.sizeBytes) ?? '',
                      type: documentType(document),
                      url: document.url,
                  },
              }
            : {}),
    }
}

const ERROR_INIT = {
    list: false,
    publish: false,
}

const LOADING_INIT = {
    list: false,
    more: false,
    publish: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* The loaded pages of the feed, flattened. `cursor` is the opaque continuation token
     * the server handed back for the next page; treat it as a string and never parse it. */
    items: [],
    cursor: null,
    hasMore: true,

    /* Which group's feed is loaded. Also what every in-flight response is checked against,
     * so a slow page for a group the reader has already switched away from is dropped
     * rather than appended under the new one. */
    orgId: null,
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Loads a group's feed. Called from the hook with the current selection, so it re-runs
     * when the switcher moves — and when the selection resolves after the first render.
     *
     * Idempotent for the group already showing, which is what makes it safe to call on
     * every mount: navigating away from the dashboard and back must not re-fetch a list the
     * reader has already scrolled. */
    load: async (orgId) => {
        if (!orgId) return
        if (get().orgId === orgId && get().ready) return

        /* A different group is a different list, so the old one goes immediately rather
         * than at the end of the request. Emptying `items` alongside `ready` is what puts
         * the skeleton up on the very next frame — leaving them would show one parish's
         * posts under another's name for the length of a round trip. */
        set(state => {
            state.orgId = orgId
            state.items = []
            state.cursor = null
            state.hasMore = true
            state.ready = false
        })

        await get().refresh()
    },

    /* (Re)loads the first page of the group already selected. Also what pull-to-refresh
     * calls, which is why it replaces `items` outright rather than merging: a refresh
     * should show the newest page, not reconcile against what the reader was holding. */
    refresh: async () => {
        const orgId = get().orgId
        if (!orgId) return

        set(state => { state.loading.list = true })
        try {
            const { items, nextCursor } = await api.get(API_ENDPOINTS.FEED, {
                params: { limit: PAGE_SIZE.FEED, orgId },
            })
            set(state => {
                /* Landed after the reader switched groups — this page belongs to a list
                 * that is no longer on screen. */
                if (state.orgId !== orgId) return
                state.items = items
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
                state.ready = true
            })
        } catch (error) {
            set(state => {
                if (state.orgId !== orgId) return
                state.error.list = toErrorList(error, 'Could not load the feed. Please try again.')
                /* Readiness resolves on the failure path too, or the skeleton spins forever
                 * instead of settling on an empty feed the reader can pull to retry. */
                state.ready = true
            })
        } finally {
            set(state => {
                if (state.orgId === orgId) state.loading.list = false
            })
        }
    },

    /* Appends the next page. `nextCursor === null` is the only end-of-collection signal
     * the server gives, so `hasMore` is derived from it rather than from a total count. */
    loadMore: async () => {
        const { cursor, hasMore, loading, orgId } = get()
        if (!hasMore || !cursor || loading.more || loading.list || !orgId) return

        set(state => { state.loading.more = true })
        try {
            const { items, nextCursor } = await api.get(API_ENDPOINTS.FEED, {
                params: { limit: PAGE_SIZE.FEED, cursor, orgId },
            })
            set(state => {
                if (state.orgId !== orgId) return
                /* A refresh can land mid-append and reset the list. Dropping ids we
                 * already hold keeps that from duplicating rows. */
                const seen = new Set(state.items.map(post => post.id))
                state.items.push(...items.filter(post => !seen.has(post.id)))
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
            })
        } catch (error) {
            set(state => {
                if (state.orgId !== orgId) return
                state.error.list = toErrorList(error, 'Could not load more posts.')
            })
        } finally {
            set(state => {
                if (state.orgId === orgId) state.loading.more = false
            })
        }
    },

    /* Publishes a post into a group and puts it at the top of the feed.
     *
     * **Creation lives here, not in the `post` store.** That store owns writes to a post
     * that already exists, because the same post can be on screen twice and both copies
     * have to move together. A post being created has no copies — it is an insertion into
     * this list, and this list owns its own contents.
     *
     * Admin-only, and the real check is the server's: `requireMembership(..., { role:
     * "ADMIN" })` runs before anything is written. The composer is hidden from members as
     * a courtesy, not as a control.
     *
     * Optimistic in the same shape as a new comment: the row appears immediately under a
     * temporary id and marked `pending`, then is swapped for the created resource — which
     * carries the real id, the server's timestamp, and the author it stamped. A failure
     * removes the row and parks the error.
     *
     * **Only when the target is the group on screen.** The composer lets an admin of two
     * parishes publish into whichever they choose, which need not be the one they are
     * reading — and this list is scoped, so inserting a post into a feed that does not
     * contain it would show a row that vanishes on the next refresh. So the optimistic row
     * is conditional, and publishing elsewhere **switches to that group** instead: the feed
     * reloads on it and the new post is simply at the top, a beat later than it would have
     * appeared but genuinely there. A post the author cannot see is indistinguishable from
     * one that failed, so the switch is the point rather than a side effect.
     *
     * **`select` is handed in rather than imported**, the same way `auth`'s actions take a
     * `router`. It is the org store's action, and importing that store here is the one thing
     * `org/store.js` rules out in its header: this store is reset *by* a selection change,
     * so reaching back to cause one would close the loop into a cycle. Taking it as an
     * argument keeps the imports one-directional while leaving the decision of *when* to
     * switch where the rest of that decision already lives — right here, next to the branch
     * it belongs to. */
    publish: async ({ orgId, title, body, media = [] }, select) => {
        if (!orgId || !body?.trim()) return null

        const optimistic = get().orgId === orgId
        const user = useAuthStore.getState().user
        const tempId = mockId('pending')
        /* The group's display name, resolved from the viewer's own memberships rather than
         * borrowed from whatever happens to be at the top of the feed — which is null on
         * an empty feed and wrong the moment a viewer belongs to more than one group. */
        const orgName = user?.orgs?.find(org => org.id === orgId)?.name ?? null

        set(state => {
            state.loading.publish = true
            state.error.publish = false
            if (!optimistic) return
            state.items.unshift({
                id: tempId,
                localId: tempId,
                author: user
                    ? {
                          handle: user.handle,
                          /* The same name fields the server's author block carries, so the
                           * card runs displayName() over the optimistic row exactly as it
                           * will over the reply that replaces it. */
                          displayName: user.displayName,
                          firstName: user.firstName,
                          lastName: user.lastName,
                          vocation: user.vocation,
                          avatar: user.avatar,
                          /* Publishing requires ADMIN of this org, so the check is not a
                           * guess here — reaching this line proves it. */
                          verified:
                              user.orgs?.find(org => org.id === orgId)?.role === ROLES.ADMIN,
                      }
                    : null,
                orgId,
                orgName,
                createdAt: new Date().toISOString(),
                title: title ?? null,
                body,
                /* Mirror the media shape the server will send back — the same split by kind
                 * `projectMedia` performs, formatted with the same helpers — so the card does
                 * not reflow when the optimistic row is replaced. */
                ...projectPending(media),
                likes: 0,
                likedBy: null,
                comments: 0,
                liked: false,
                /* Publishing requires ADMIN of this group, and deleting requires the same
                 * role — so the answer is known here without asking, and the optimistic row
                 * offers the same options menu the confirmed one will. */
                canDelete: true,
                pending: true,
            })
        })

        try {
            const post = await api.post(API_ENDPOINTS.POSTS, { orgId, title, body, media })
            set(state => {
                const index = state.items.findIndex(item => item.id === tempId)
                /* `localId` carries forward so the feed's React key survives the swap —
                 * otherwise the card remounts and replays its fade-in. */
                if (index !== -1) state.items[index] = { ...post, localId: tempId }
            })
            /* The other half of the `optimistic` branch above: no row was inserted because
             * the post does not belong in the list on screen, so switch to the group that
             * does. Only after the server has confirmed it — switching on a publish that then
             * failed would move the reader for nothing. */
            if (!optimistic) select?.(orgId)
            return post
        } catch (error) {
            set(state => {
                state.items = state.items.filter(item => item.id !== tempId)
                state.error.publish = toErrorList(error, 'Could not publish your post.')
            })
            return null
        } finally {
            set(state => { state.loading.publish = false })
        }
    },

    /* The loaded row for a post, or null if this page of the feed doesn't hold it.
     *
     * Read by the `post` store when a post opens: that row carries the photo the reader just
     * tapped, already fetched and decoded by the browser, so promoting it lets the post
     * surface paint whole on the first frame. It is a fast path and never a precondition —
     * a cold deep link gets null here and loads from the endpoint. */
    cachedPost: (postId) => get().items.find(post => post.id === postId) ?? null,

    /* Applies a partial update to a loaded row, if this page of the feed holds it.
     *
     * Every write to a post goes through the `post` store, which calls this so the feed's
     * copy moves with it. Without that the same post visibly disagrees with itself: the
     * overlay sits on the live feed, so a heart filled in the overlay would empty again the
     * moment it was dismissed. */
    patchPost: (postId, patch) => set(state => {
        const row = state.items.find(post => post.id === postId)
        if (row) Object.assign(row, patch)
    }),

    /* Takes a post out of the loaded pages, and hands back what it removed so the caller can
     * put it back. The third of this store's surface to the `post` store, alongside
     * `cachedPost` and `patchPost`, and the reason it is shaped this way rather than as a
     * plain delete: a failed removal has to restore the row *at its index*, which is where a
     * reader last saw it and not where a refresh would place it.
     *
     * Returns `{ row, index }`, or null if this page doesn't hold the post — which is a
     * normal outcome, not a failure: a post opened from a shared link has no feed behind it.
     *
     * The delete itself lives in the `post` store, which owns writes to a post that already
     * exists. This is only the list's half of it. */
    removePost: (postId) => {
        const index = get().items.findIndex(post => post.id === postId)
        if (index === -1) return null

        const row = get().items[index]
        set(state => { state.items.splice(index, 1) })
        return { row, index }
    },

    /* Puts a removed row back where it was. Only ever called with what `removePost`
     * returned. */
    restorePost: (index, row) => set(state => {
        state.items.splice(index, 0, row)
    }),

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
