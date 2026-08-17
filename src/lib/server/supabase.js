import "server-only"

import { createClient } from "@supabase/supabase-js"

/* Server-side Supabase clients. Two of them, with very different powers — read the
 * distinction before importing either.
 *
 * Neither persists a session or refreshes a token: these are stateless, per-request
 * clients, not a signed-in user's. Leaving `persistSession` on would have every request in
 * the process share one auth state, which is exactly the bug you would expect.
 *
 * The *browser* client is a separate file (`src/lib/supabase.js`) and is the only one the
 * app bundle may import. This one is behind `server-only` because it can hold the service
 * role key, which must never reach a client. */

/* Supabase's key names changed: `anon` → publishable (`sb_publishable_...`) and
 * `service_role` → secret (`sb_secret_...`). The legacy pair is deprecated at the end of
 * 2026. Both are read so an existing project keeps working; new projects should set only
 * the publishable/secret names. */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

const STATELESS = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}

/* Anon-key client. Used for one job: verifying an access token presented by a caller
 * (`auth.getUser(jwt)`). It has no privileges of its own. */
export const supabaseAnon = () => {
    if (!SUPABASE_URL || !ANON_KEY) {
        throw new Error(
            "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
        )
    }
    return createClient(SUPABASE_URL, ANON_KEY, STATELESS)
}

/* Secret-key (service-role) client. Bypasses every Row Level Security policy and can
 * create, delete, and impersonate users — it is the database's root account in HTTP form.
 *
 * Only two paths should ever need it: provisioning a user (the invite flow) and the seed
 * script. Never call it in response to unvalidated input, and never import it from
 * anything that is not itself `server-only`. */
export const supabaseAdmin = () => {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        throw new Error(
            "Supabase admin is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
        )
    }
    return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, STATELESS)
}
