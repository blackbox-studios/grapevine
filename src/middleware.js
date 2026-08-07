import { NextResponse } from "next/server"

import { auth0 } from "@/lib/auth0"

/* Auth gate backed by Auth0. auth0.middleware() mounts the /auth/* endpoints; we
 * gate the rest on the session. Unauthenticated → /login; authed on /login → /. */
const LOGIN_PATH = "/login"

export async function middleware(request) {
    const authRes = await auth0.middleware(request)

    const { pathname } = request.nextUrl

    /* SDK owns /auth/*. */
    if (pathname.startsWith("/auth")) {
        return authRes
    }

    const session = await auth0.getSession(request)
    const authed = Boolean(session)
    const onLogin = pathname === LOGIN_PATH

    if (!authed && !onLogin) {
        const url = request.nextUrl.clone()
        url.pathname = LOGIN_PATH
        return NextResponse.redirect(url)
    }

    if (authed && onLogin) {
        const url = request.nextUrl.clone()
        url.pathname = "/"
        return NextResponse.redirect(url)
    }

    /* Return the SDK response so a refreshed session cookie is preserved. */
    return authRes
}

/* Skip Next internals, the API, the public asset folders, and top-level static
 * files. `[^/]*\.` excludes a dot only in the first segment, so nested paths
 * like /foo/bar.jpg still hit the gate; add a folder here to serve deeper assets. */
export const config = {
    matcher: ["/((?!api|_next/static|_next/image|ext/|theme/|img/|[^/]*\\.).*)"],
}
