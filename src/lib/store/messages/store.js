import { create } from "zustand"
import { immer } from "zustand/middleware/immer"

import api from "@/lib/api"
import { API_ENDPOINTS, PAGE_SIZE } from "@/lib/constants"
import {
    decryptEnvelope,
    encryptText,
    ensureDevice,
    markPublished,
    sessionlessDevices,
    topUpPreKeys,
} from "@/lib/crypto/engine"
import {
    forgetConversation,
    loadMessages,
    loadSnippets,
    saveMessages,
    saveSnippets,
} from "@/lib/crypto/storage"
import { isAdult, toErrorList } from "@/lib/utils"
import useNotificationsStore from "@/lib/store/notifications/store"

/* Direct messages: the inbox, the one open thread, and the whole client side of the
 * E2EE pipeline — this store is where ciphertext becomes text and text becomes
 * ciphertext, because the crypto engine may not fetch and the API layer may not hold
 * keys, and the store is the seam where the two are allowed to meet.
 *
 * ── What the server gives us, and what we make of it ─────────────────────────
 *
 * Every message arrives as an envelope for this install (`deviceId`), decrypted here
 * exactly once — a ratchet key works once and is gone — and the plaintext goes
 * straight into the on-device cache (`lib/crypto/storage.js`). Everything rendered is
 * read from that cache merged with the wire, keyed by message id, so refetching a
 * page never re-attempts a decrypt that cannot succeed. A message the cache does not
 * hold and the ratchet cannot reach renders as unreadable, which is the no-backup
 * design telling the truth.
 *
 * **Envelopes decrypt in thread order** (ascending), because the ratchet steps
 * forward: out-of-order arrival is handled by the protocol's skipped-key ledger, but
 * there is no reason to exercise it on every page when sorting first costs nothing.
 *
 * ── Dependencies ─────────────────────────────────────────────────────────────
 *
 * `messages` → `notifications` is one narrow arrow, `setMessagesTally` — the unread
 * badge lives in the notifications store because it arrives on that store's poll,
 * and opening a thread here has to settle it without waiting for the next tick. Same
 * shape as `profile` → `notifications`' `patchActor`. */

const ERROR_INIT = {
    inbox: false,
    thread: false,
    send: false,
    contacts: false,
    boot: false,
    /* Accept / Delete / Block. Separate from `thread`, which is about *reading* one: a
     * refusal to block somebody has to be able to say so while the thread it refused to
     * block is still on screen and perfectly readable. */
    action: false,
}

const LOADING_INIT = {
    inbox: false,
    thread: false,
    older: false,
    send: false,
    contacts: false,
    open: false,
    action: false,
}

const INIT = {
    /* Whether messaging is this viewer's to use at all: an adult. **A fact about the
     * person, so it is settled from the profile in the same frame the boot starts,
     * before any request** — the nav entrance and the surfaces' gates are drawn off it,
     * and one drawn off `available` instead is absent for the width of a round trip and
     * then snaps in, on every refresh. */
    permitted: false,
    /* Adult viewer *with a registered device* — the gate for everything that needs
     * `deviceId`, which is everything that reads or writes an envelope. Distinct from
     * `permitted` because it cannot be known without asking the server. */
    available: false,
    booting: false,
    /* Whether the automatic attempt has been spent, win or lose. Distinct from
     * `available`, which says whether it *worked* — collapsing the two is what makes a
     * single failed registration permanent, since the boot effect fires on a stable
     * `user` reference and would never run again. */
    booted: false,
    deviceId: null,
    profileId: null,

    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* The inbox: projected conversations, each carrying a decrypted `snippet`. */
    conversations: [],

    /* The one open thread: `{ id, conversation, items, cursor, hasMore, loaded }`, items
     * ascending with `{ id, senderId, text, at, sending?, failed? }`.
     *
     * **`loaded` is what separates "empty" from "not answered yet"**, and without it the
     * two are the same state — an empty array — so a thread that is merely loading
     * renders as one that has no messages. That is a sentence about somebody's
     * conversation appearing for a frame before the conversation does. */
    thread: null,

    contacts: { query: "", items: [], loaded: false },
}

/* Sorts wire messages ascending, decrypts the unknown ones, merges with the cache,
 * persists, and returns the merged ascending list. The one path every envelope
 * takes.
 *
 * `held` is whatever the thread is currently rendering, and it is here for one reason:
 * to carry `localId` across the merge. The cache is keyed by the server's id and knows
 * nothing about the temporary identity a row was sent under, so a rebuild would hand
 * every recently-sent bubble a new React key — remounting it, replaying the send
 * animation, and re-registering it with the rail's spring engine, on every poll. */
const absorb = async (profileId, deviceId, conversationId, wire, held = []) => {
    const cached = await loadMessages(profileId, conversationId)
    const known = new Map(cached.map((item) => [item.id, item]))

    const incoming = [...wire].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    let changed = false

    for (const message of incoming) {
        if (known.has(message.id)) continue

        let text = null
        if (message.envelope && message.senderDeviceId !== deviceId) {
            text = await decryptEnvelope(profileId, message.senderDeviceId, message.envelope)
        }
        known.set(message.id, {
            id: message.id,
            senderId: message.senderId,
            text,
            at: message.at,
        })
        changed = true
    }

    const merged = [...known.values()].sort((a, b) =>
        a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1,
    )
    if (changed) await saveMessages(profileId, conversationId, merged)

    /* Written back onto the returned rows only, never into the cache: `localId` is a
     * fact about this session's render, not about the message. */
    const locals = new Map(held.filter((item) => item.localId).map((item) => [item.id, item.localId]))
    return locals.size
        ? merged.map((item) =>
              locals.has(item.id) ? { ...item, localId: locals.get(item.id) } : item,
          )
        : merged
}

/* The line under a conversation's name. Newest readable text wins; an envelope this
 * device cannot read still moves the row, it just cannot say what with. */
const snippetFrom = (merged) => {
    for (let i = merged.length - 1; i >= 0; i--) {
        if (merged[i].text) {
            return { messageId: merged[i].id, senderId: merged[i].senderId, text: merged[i].text, at: merged[i].at }
        }
    }
    return null
}

const useStore = create(
    immer((set, get) => ({
        ...INIT,

        /* Once per sign-in: create-or-load this install's device, register its public
         * bundle, and top the one-time pool up against the server's count. Unawaited by
         * anything — a viewer who never opens the surface still becomes reachable, which
         * is what makes the *other* side's first send deliverable. */
        boot: async (user, { retry = false } = {}) => {
            if (!user?.id || get().booting) return
            if (get().profileId === user.id && get().available) return
            /* One failed attempt must not be the end of it, but neither may a re-render
             * become a retry loop against a server that is refusing. `booted` records that
             * the automatic attempt has been spent; only an explicit `retry` gets past it. */
            if (get().booted && !retry) return

            if (!isAdult(user.birthday)) {
                set((state) => {
                    state.permitted = false
                    state.available = false
                    state.booted = true
                    state.profileId = user.id
                })
                return
            }

            set((state) => {
                state.permitted = true
                state.booting = true
                state.profileId = user.id
            })
            try {
                const { deviceId, registration } = await ensureDevice(user.id)
                const { preKeyCount } = await api.post(API_ENDPOINTS.MESSAGE_KEYS, registration)
                await markPublished(user.id)

                const refill = await topUpPreKeys(user.id, preKeyCount)
                if (refill) {
                    await api.post(API_ENDPOINTS.MESSAGE_KEYS, refill)
                    await markPublished(user.id)
                }

                set((state) => {
                    state.deviceId = deviceId
                    state.available = true
                })
            } catch (error) {
                /* **Not silent.** A failure here leaves the install unreachable over
                 * E2EE with nothing on screen saying so, and mail sent meanwhile is
                 * encrypted for devices this one is not among — unreadable even once it
                 * recovers. */
                set((state) => {
                    state.error.boot = toErrorList(error, "Messaging couldn't start on this device.")
                })
            } finally {
                set((state) => {
                    state.booting = false
                    state.booted = true
                })
            }
        },

        /* The inbox. Decrypts at most one envelope per conversation — the newest —
         * against the snippet cache, so a warm refresh is zero crypto. */
        refreshInbox: async ({ silent = false } = {}) => {
            const { available, deviceId, profileId } = get()
            if (!available) return

            if (!silent) {
                set((state) => {
                    state.loading.inbox = true
                })
            }
            try {
                const { items } = await api.get(API_ENDPOINTS.CONVERSATIONS, {
                    params: { deviceId },
                })

                const snippets = await loadSnippets(profileId)
                let snippetsChanged = false

                for (const conversation of items) {
                    const last = conversation.lastMessage
                    const held = snippets[conversation.id]

                    if (!last) {
                        conversation.snippet = null
                        continue
                    }
                    if (held?.messageId === last.id) {
                        conversation.snippet = held
                        continue
                    }

                    /* New newest message: absorb it (and remember it) so the row can
                     * speak. Own sends from this device were cached at send time and
                     * resolve without touching the ratchet. */
                    const merged = await absorb(profileId, deviceId, conversation.id, [last])
                    const snippet = snippetFrom(merged)
                    conversation.snippet = snippet
                    if (snippet) {
                        snippets[conversation.id] = snippet
                        snippetsChanged = true
                    }
                }
                if (snippetsChanged) await saveSnippets(profileId, snippets)

                set((state) => {
                    state.conversations = items
                    state.ready = true
                })
            } catch (error) {
                set((state) => {
                    if (silent) return
                    state.error.inbox = toErrorList(error, "Could not load your messages.")
                    state.ready = true
                })
            } finally {
                set((state) => {
                    state.loading.inbox = false
                })
            }
        },

        /* Opens one thread. The cache paints first — a conversation you have read
         * before shows its bubbles before any request lands — then the wire merges
         * in behind it, exactly the promote-then-refresh order `post.load` follows. */
        open: async (conversationId) => {
            const { available, deviceId, profileId } = get()
            if (!available || !conversationId) return

            const held = get().conversations.find((c) => c.id === conversationId) ?? null
            set((state) => {
                state.thread = {
                    id: conversationId,
                    conversation: held,
                    items: [],
                    cursor: null,
                    hasMore: false,
                    loaded: false,
                }
                state.error.thread = false
                state.loading.thread = true
            })

            const cached = await loadMessages(profileId, conversationId)
            set((state) => {
                if (state.thread?.id !== conversationId) return
                state.thread.items = cached
                /* Anything in the cache is this conversation, so the surface can stop
                 * waiting; the wire refreshes behind it. An empty cache is not an
                 * answer, though — it is exactly the state that has to keep waiting. */
                if (cached.length) state.thread.loaded = true
            })

            try {
                const { conversation, messages } = await api.get(
                    API_ENDPOINTS.CONVERSATION(conversationId),
                    { params: { deviceId, limit: PAGE_SIZE.MESSAGES } },
                )
                const merged = await absorb(profileId, deviceId, conversationId, messages.items)

                set((state) => {
                    if (state.thread?.id !== conversationId) return
                    state.thread.conversation = conversation
                    state.thread.items = merged
                    state.thread.cursor = messages.nextCursor
                    state.thread.hasMore = messages.nextCursor !== null
                    state.thread.loaded = true
                })

                get().settleRead(conversationId)
            } catch (error) {
                set((state) => {
                    if (state.thread?.id !== conversationId) return
                    state.error.thread = toErrorList(error, "Could not load this conversation.")
                    /* A refusal settles the surface too, or it waits forever on a
                     * request that is not coming back. */
                    state.thread.loaded = true
                })
            } finally {
                set((state) => {
                    if (state.thread?.id === conversationId) state.loading.thread = false
                })
            }
        },

        /* The open thread's poll tick, and the push handler's landing point: first
         * page again, merge, and nothing else moves. Silent by design. */
        refreshThread: async () => {
            const { thread, deviceId, profileId, available } = get()
            if (!available || !thread) return

            try {
                const { conversation, messages } = await api.get(
                    API_ENDPOINTS.CONVERSATION(thread.id),
                    { params: { deviceId, limit: PAGE_SIZE.MESSAGES } },
                )
                const merged = await absorb(
                    profileId,
                    deviceId,
                    thread.id,
                    messages.items,
                    thread.items,
                )

                const before = get().thread
                if (before?.id !== thread.id) return
                const grew = merged.length > before.items.filter((i) => !i.sending).length

                set((state) => {
                    if (state.thread?.id !== thread.id) return
                    state.thread.conversation = conversation
                    /* Keep optimistic sends that have not landed yet on the end. */
                    const pending = state.thread.items.filter((item) => item.sending)
                    state.thread.items = [...merged, ...pending]
                })

                if (grew) get().settleRead(thread.id)
            } catch {
                /* A poll; the next one will make it. */
            }
        },

        /* Older history above the first page. */
        loadOlder: async () => {
            const { thread, deviceId, profileId, loading } = get()
            if (!thread?.hasMore || !thread.cursor || loading.older) return

            set((state) => {
                state.loading.older = true
            })
            try {
                const { messages } = await api.get(API_ENDPOINTS.CONVERSATION(thread.id), {
                    params: { deviceId, limit: PAGE_SIZE.MESSAGES, cursor: thread.cursor },
                })
                const merged = await absorb(
                    profileId,
                    deviceId,
                    thread.id,
                    messages.items,
                    thread.items,
                )

                set((state) => {
                    if (state.thread?.id !== thread.id) return
                    const pending = state.thread.items.filter((item) => item.sending)
                    state.thread.items = [...merged, ...pending]
                    state.thread.cursor = messages.nextCursor
                    state.thread.hasMore = messages.nextCursor !== null
                })
            } catch (error) {
                set((state) => {
                    state.error.thread = toErrorList(error, "Could not load older messages.")
                })
            } finally {
                set((state) => {
                    state.loading.older = false
                })
            }
        },

        /* Encrypt, optimistically append, relay. The bubble is on screen before the
         * request leaves — the iMessage feel depends on it — and a refusal turns it
         * into a marked failure rather than silently vanishing. */
        send: async (text) => {
            const { thread, deviceId, profileId, loading } = get()
            const body = String(text ?? "").trim()
            if (!thread?.conversation || !body || loading.send) return false

            const conversationId = thread.id
            const targets = (thread.conversation.targets ?? []).filter(
                (target) => target.deviceId !== deviceId,
            )

            /* **A stable key across the ack, separate from the id.** The optimistic row
             * is written with a temporary id and replaced by the server's record a
             * moment later; keying the bubble on `id` would unmount it and mount a
             * different element in its place, which restarts the send animation
             * half-played and re-registers the row with the rail's spring engine. The
             * id still changes — everything that addresses a message uses it — but the
             * row keeps one identity from the tap to the receipt. */
            const tempId = `pending-${Date.now()}`
            set((state) => {
                state.loading.send = true
                state.error.send = false
                state.thread.items.push({
                    id: tempId,
                    localId: tempId,
                    senderId: profileId,
                    text: body,
                    at: new Date().toISOString(),
                    sending: true,
                })
            })

            try {
                /* Sessions for devices we have none with — bundles are fetched for
                 * exactly those, per person, so the prekey pools drain only on
                 * genuinely new pairings. */
                const missing = new Set(
                    await sessionlessDevices(
                        profileId,
                        targets.map((target) => target.deviceId),
                    ),
                )
                const bundles = {}
                const byProfile = new Map()
                for (const target of targets) {
                    if (!missing.has(target.deviceId)) continue
                    const list = byProfile.get(target.profileId) ?? []
                    list.push(target.deviceId)
                    byProfile.set(target.profileId, list)
                }
                await Promise.all(
                    [...byProfile.entries()].map(async ([targetProfileId, deviceIds]) => {
                        const { devices } = await api.get(
                            API_ENDPOINTS.MESSAGE_BUNDLES(targetProfileId),
                            { params: { exclude: deviceId, devices: deviceIds.join(",") } },
                        )
                        for (const bundle of devices) bundles[bundle.deviceId] = bundle
                    }),
                )

                const envelopes = await encryptText(
                    profileId,
                    targets.map((target) => ({
                        deviceId: target.deviceId,
                        bundle: bundles[target.deviceId],
                    })),
                    body,
                )

                const message = await api.post(
                    API_ENDPOINTS.CONVERSATION_MESSAGES(conversationId),
                    { senderDeviceId: deviceId, envelopes },
                )

                const record = {
                    id: message.id,
                    localId: tempId,
                    senderId: profileId,
                    text: body,
                    at: message.at,
                }

                /* Into the cache before the state swap, so a thread reopened a moment
                 * later reads its own send back.
                 *
                 * **Its own catch: the message is already sent by this point.** Falling
                 * through to the outer handler would mark a bubble the recipient has
                 * *received* as failed, and the retry that invites sends it twice. Losing
                 * the local copy costs this device the plaintext — a hole in one thread's
                 * history rather than a duplicate in somebody else's. */
                const snippet = {
                    messageId: record.id,
                    senderId: profileId,
                    text: body,
                    at: record.at,
                }
                try {
                    const cached = await loadMessages(profileId, conversationId)
                    if (!cached.some((item) => item.id === record.id)) {
                        cached.push(record)
                        await saveMessages(profileId, conversationId, cached)
                    }
                    const snippets = await loadSnippets(profileId)
                    snippets[conversationId] = snippet
                    await saveSnippets(profileId, snippets)
                } catch {
                    /* Nothing to do about it here; the bubble is on screen either way. */
                }

                set((state) => {
                    if (state.thread?.id === conversationId) {
                        const index = state.thread.items.findIndex((item) => item.id === tempId)
                        if (index !== -1) state.thread.items[index] = record
                    }
                    const row = state.conversations.find((c) => c.id === conversationId)
                    if (row) {
                        row.lastMessageAt = record.at
                        row.snippet = snippet
                        row.unread = false
                        state.conversations.sort((a, b) =>
                            a.lastMessageAt < b.lastMessageAt ? 1 : -1,
                        )
                    }
                })
                return true
            } catch (error) {
                set((state) => {
                    state.error.send = toErrorList(error, "Couldn't send that message.")
                    if (state.thread?.id === conversationId) {
                        const item = state.thread.items.find((entry) => entry.id === tempId)
                        if (item) {
                            item.sending = false
                            item.failed = true
                        }
                    }
                })
                return false
            } finally {
                set((state) => {
                    state.loading.send = false
                })
            }
        },

        /* A failed bubble's retry: take it off the rail and run the send again.
         *
         * **`send`'s own guards are tested before the row is removed.** It bails silently
         * when the thread has gone or another send is in flight, and a retry that had
         * already swallowed the row would delete the message in response to being asked to
         * send it. Restoring it afterwards would not do — by then a genuine failure has
         * pushed a second failed bubble of its own. */
        retry: async (itemId) => {
            const { thread, loading } = get()
            const item = thread?.items.find((entry) => entry.id === itemId)
            if (!item?.failed) return false
            if (!thread.conversation || loading.send) return false

            set((state) => {
                state.thread.items = state.thread.items.filter((entry) => entry.id !== itemId)
            })
            return get().send(item.text)
        },

        /* Marks the open thread read — server cursor, inbox row, and the badge the
         * notifications store carries, all in one place so they cannot disagree. */
        settleRead: (conversationId) => {
            const row = get().conversations.find((c) => c.id === conversationId)
            if (row?.unread === false) return

            set((state) => {
                const held = state.conversations.find((c) => c.id === conversationId)
                if (held) held.unread = false
            })
            get().settleTally()
            api.post(API_ENDPOINTS.CONVERSATION_READ(conversationId)).catch(() => {})
        },

        /* Re-counts the badge from the rows in hand, so opening a thread settles it now
         * rather than a poll interval later.
         *
         * **Only once the inbox has actually answered.** A cold launch straight into a
         * thread — a tapped banner, which is the common way this surface is reached — has
         * never listed the conversations, so the count would be taken over an empty array
         * and clear a badge that other unread threads are still owed. Deferring to the
         * poll costs one interval of staleness; counting nothing costs the badge. */
        settleTally: () => {
            if (!get().ready) return
            useNotificationsStore
                .getState()
                .setMessagesTally(get().conversations.filter((c) => c.unread).length)
        },

        /* Accept / Delete / Block, the three verbs of the request gate.
         *
         * **All three report failure rather than throwing it.** Each is a control whose
         * only feedback is the surface changing underneath it, so a rejected promise reads
         * as the button doing nothing — and for Block, the reasonable reading of that
         * silence is that it worked. The boolean lets the caller dismiss only on success;
         * `error.action` carries the reason to the toast. */
        runAction: async (label, work) => {
            if (get().loading.action) return false
            set((state) => {
                state.loading.action = true
                state.error.action = false
            })
            try {
                await work()
                return true
            } catch (error) {
                set((state) => {
                    state.error.action = toErrorList(error, label)
                })
                return false
            } finally {
                set((state) => {
                    state.loading.action = false
                })
            }
        },

        /* The request gate's Accept: the composer unlocks and the blur lifts. */
        accept: async () => {
            const { thread } = get()
            if (!thread) return false
            return get().runAction("Couldn't accept that conversation.", async () => {
                await api.post(API_ENDPOINTS.CONVERSATION_ACCEPT(thread.id))
                set((state) => {
                    if (state.thread?.conversation) {
                        state.thread.conversation.accepted = true
                        state.thread.conversation.isRequest = false
                    }
                    const row = state.conversations.find((c) => c.id === thread.id)
                    if (row) {
                        row.accepted = true
                        row.isRequest = false
                    }
                })
            })
        },

        /* Delete (a request, or any thread) — removes it for both sides and forgets
         * the local plaintext with it. */
        remove: async (conversationId) =>
            get().runAction("Couldn't delete that conversation.", async () => {
                await api.delete(API_ENDPOINTS.CONVERSATION(conversationId))
                await get().dropConversation(conversationId)
            }),

        /* Block, from a request: refuse the sender for good. */
        block: async (conversationId) =>
            get().runAction("Couldn't block that person.", async () => {
                await api.post(API_ENDPOINTS.CONVERSATION_BLOCK(conversationId))
                await get().dropConversation(conversationId)
            }),

        /* Takes a thread off every surface at once, local plaintext included. Shared by
         * Delete and Block because the two differ only in what the server does about the
         * *person*; what happens to the conversation here is identical. */
        dropConversation: async (conversationId) => {
            await forgetConversation(get().profileId, conversationId)
            set((state) => {
                state.conversations = state.conversations.filter((c) => c.id !== conversationId)
                if (state.thread?.id === conversationId) state.thread = null
            })
            get().settleTally()
        },

        /* New Message → a person picked → their thread, existing or fresh. Returns
         * the conversation id for the caller to navigate to. */
        startWith: async (profileId) => {
            if (get().loading.open) return null
            set((state) => {
                state.loading.open = true
            })
            try {
                const conversation = await api.post(API_ENDPOINTS.CONVERSATIONS, { profileId })
                set((state) => {
                    const held = state.conversations.find((c) => c.id === conversation.id)
                    if (!held) {
                        conversation.snippet = null
                        state.conversations.unshift(conversation)
                    }
                })
                return conversation.id
            } catch (error) {
                set((state) => {
                    state.error.contacts = toErrorList(error, "Couldn't start that conversation.")
                })
                return null
            } finally {
                set((state) => {
                    state.loading.open = false
                })
            }
        },

        searchContacts: async (query) => {
            const value = String(query ?? "")
            set((state) => {
                state.contacts.query = value
                state.loading.contacts = true
            })
            try {
                const { items } = await api.get(API_ENDPOINTS.MESSAGE_CONTACTS, {
                    params: value.trim() ? { query: value.trim() } : {},
                })
                set((state) => {
                    /* A slower response for an older query must not clobber the
                     * newer one's rows. */
                    if (state.contacts.query !== value) return
                    state.contacts.items = items
                    state.contacts.loaded = true
                })
            } catch (error) {
                set((state) => {
                    if (state.contacts.query !== value) return
                    state.error.contacts = toErrorList(error, "Couldn't search people.")
                    state.contacts.loaded = true
                })
            } finally {
                set((state) => {
                    if (state.contacts.query === value) state.loading.contacts = false
                })
            }
        },

        closeThread: () =>
            set((state) => {
                state.thread = null
                state.error.thread = false
                state.error.send = false
            }),

        reset: () => set(() => ({ ...INIT })),
        clearErrors: () =>
            set((state) => {
                state.error = ERROR_INIT
            }),
    })),
)

export default useStore
