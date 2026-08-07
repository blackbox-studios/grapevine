import { MOCK_LATENCY_MS } from "@/lib/constants"

/* Fake network latency so loading skeletons/spinners actually show up in the
 * demo. Every store action should await this before mutating state. Pass an
 * override for one-off timings. */
export const mockDelay = (ms = MOCK_LATENCY_MS) =>
    new Promise((resolve) => setTimeout(resolve, ms))

/* RFC-ish random id — not cryptographically strong, but unique enough for
 * in-session ids on new nodes, events, etc. */
export const mockId = (prefix = "id") =>
    `${prefix}-${Math.random().toString(36).slice(2, 10)}`
