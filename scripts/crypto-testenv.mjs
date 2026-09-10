/* Lets `src/lib/crypto/engine.js` run under plain Node, so the session layer can be
 * tested the same way the protocol layer already is.
 *
 * Two things stand between the engine and a bare `node` process, and neither is about
 * the cryptography. `storage.js` imports `@/lib/native` — an alias the bundler resolves
 * and Node does not, behind a chain that reaches Capacitor — and it persists through
 * `globalThis.localStorage`, which a Node process does not have, so every session would
 * silently fail to save and every test would fail for the wrong reason.
 *
 * So: the alias resolves to a stub that answers `isNative()` with false, which is the
 * browser path and the one the store actually takes on the web; and localStorage is an
 * in-memory Map. The engine and everything under it is the real code.
 *
 * Registered by `crypto-selftest.mjs` before it imports anything from `src/`. */

import { register } from "node:module"
import { pathToFileURL } from "node:url"

const HERE = new URL("./", import.meta.url)

/* `isNative()` false is not a simplification for the test's benefit — it is the branch
 * every browser takes, and the one whose failure mode (a quota error swallowed, the
 * next decrypt re-deriving what it can) the tests want to exercise. */
const NATIVE_STUB = `export const isNative = () => false\n`

const LOADER = `
export const resolve = async (specifier, context, next) => {
    if (specifier === "@/lib/native") {
        return { url: "data:text/javascript,${encodeURIComponent(NATIVE_STUB)}", shortCircuit: true }
    }
    if (specifier.startsWith("@/")) {
        return next(new URL(specifier.slice(2), ${JSON.stringify(new URL("../src/", HERE).href)}).href, context)
    }
    return next(specifier, context)
}
`

/* An in-memory localStorage. `storage.js` reaches for it optionally and swallows what it
 * throws, so leaving it undefined would make every save a no-op and every session
 * unreadable — a green-looking test of nothing. */
export const installStorage = () => {
    const cells = new Map()
    globalThis.localStorage = {
        getItem: (key) => (cells.has(key) ? cells.get(key) : null),
        setItem: (key, value) => cells.set(key, String(value)),
        removeItem: (key) => cells.delete(key),
        clear: () => cells.clear(),
    }
    return cells
}

export const installResolver = () => {
    register(`data:text/javascript,${encodeURIComponent(LOADER)}`, pathToFileURL("./"))
}
