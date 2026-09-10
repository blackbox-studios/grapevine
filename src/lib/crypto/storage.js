import { Preferences } from "@capacitor/preferences"

import { isNative } from "@/lib/native"

/* Where the private half of the messaging feature lives: identity and prekey secrets,
 * ratchet sessions, and the plaintext this device has decrypted. None of it ever
 * reaches the server — that is the entire design — so where it sits on the device is
 * a security decision, not a caching one.
 *
 * On native that is Capacitor **Preferences** (`UserDefaults` / `SharedPreferences`),
 * for the same reason the auth session lives there: a WebView's localStorage is
 * website data the OS may reclaim, and reclaiming a ratchet state does not sign
 * anybody out — it silently makes every conversation unreadable. In a browser,
 * localStorage is what there is, and losing it is the accepted new-device case.
 *
 * Everything is namespaced by profile id, so two accounts signed into one browser in
 * turn cannot read each other's sessions. Signing out deliberately does NOT clear any
 * of it — the keys are what let the same person sign back in and still read their
 * history; `clearCryptoStorage` exists for account erasure, not for sign-out. */

const get = async (key) => {
    if (isNative()) {
        const { value } = await Preferences.get({ key })
        return value ? JSON.parse(value) : null
    }
    try {
        const value = globalThis.localStorage?.getItem(key)
        return value ? JSON.parse(value) : null
    } catch {
        return null
    }
}

const set = async (key, value) => {
    const raw = JSON.stringify(value)
    if (isNative()) {
        await Preferences.set({ key, value: raw })
        return
    }
    try {
        globalThis.localStorage?.setItem(key, raw)
    } catch {
        /* Quota or private mode. The next decrypt re-derives what it can. */
    }
}

const remove = async (key) => {
    if (isNative()) {
        await Preferences.remove({ key })
        return
    }
    try {
        globalThis.localStorage?.removeItem(key)
    } catch {
        /* Already unreadable is as good as removed. */
    }
}

/* ---------------------------------------------------------------------------
 * Keys. `gvc` is the crypto half (secrets), `gvm` the message cache (plaintext).
 * ------------------------------------------------------------------------- */

const deviceKey = (profileId) => `gvc.${profileId}.device`
const sessionKey = (profileId, remoteDeviceId) => `gvc.${profileId}.s.${remoteDeviceId}`
const cacheKey = (profileId, conversationId) => `gvm.${profileId}.c.${conversationId}`
const snippetsKey = (profileId) => `gvm.${profileId}.snippets`
const indexKey = (profileId) => `gvc.${profileId}.index`

/* The device record: identity secret, signed prekey pair, one-time prekey pool. */
export const loadDevice = (profileId) => get(deviceKey(profileId))
export const saveDevice = (profileId, device) => set(deviceKey(profileId), device)

/* One session record per remote device. `engine.js` owns the shape and documents it. */
export const loadSession = (profileId, remoteDeviceId) =>
    get(sessionKey(profileId, remoteDeviceId))
export const saveSession = async (profileId, remoteDeviceId, session) => {
    await set(sessionKey(profileId, remoteDeviceId), session)
    /* The index is what lets erasure enumerate sessions without a key scan, which
     * Preferences cannot do. */
    const index = (await get(indexKey(profileId))) ?? []
    if (!index.includes(remoteDeviceId)) {
        index.push(remoteDeviceId)
        await set(indexKey(profileId), index)
    }
}

/* ---------------------------------------------------------------------------
 * Plaintext cache — what this device has decrypted, so history renders without
 * re-decrypting (which a ratchet cannot do anyway: each key works once).
 * ------------------------------------------------------------------------- */

/* Bounded so one busy thread cannot grow without limit; older plaintext simply
 * falls back off this device, exactly as the no-backup posture promises. */
const CACHE_LIMIT = 300

export const loadMessages = async (profileId, conversationId) =>
    (await get(cacheKey(profileId, conversationId))) ?? []

export const saveMessages = (profileId, conversationId, messages) =>
    set(cacheKey(profileId, conversationId), messages.slice(-CACHE_LIMIT))

/* `{ [conversationId]: { messageId, senderId, text, at } }` — the inbox's one read
 * for every row's snippet. */
export const loadSnippets = async (profileId) => (await get(snippetsKey(profileId))) ?? {}
export const saveSnippets = (profileId, snippets) => set(snippetsKey(profileId), snippets)

export const forgetConversation = async (profileId, conversationId) => {
    await remove(cacheKey(profileId, conversationId))
    const snippets = await loadSnippets(profileId)
    if (snippets[conversationId]) {
        delete snippets[conversationId]
        await saveSnippets(profileId, snippets)
    }
}

/* Everything this module ever wrote for one profile. */
export const clearCryptoStorage = async (profileId, conversationIds = []) => {
    const index = (await get(indexKey(profileId))) ?? []
    for (const remoteDeviceId of index) await remove(sessionKey(profileId, remoteDeviceId))
    for (const conversationId of conversationIds) await remove(cacheKey(profileId, conversationId))
    await remove(indexKey(profileId))
    await remove(snippetsKey(profileId))
    await remove(deviceKey(profileId))
}
