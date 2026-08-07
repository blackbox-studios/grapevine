import { NextResponse } from "next/server"

/* Server-side auth gate — the idiomatic Next.js replacement for client route guards.
 * Reads the `scrolls-auth` cookie the mock login sets (see lib/store/auth/store.js):
 * unauthenticated requests are bounced to /login, and authenticated requests to
 * /login are sent to the dashboard. */
const AUTH_COOKIE = "scrolls-auth"
const LOGIN_PATH = "/login"

export function middleware(request) {
    const authed = request.cookies.has(AUTH_COOKIE)
    const { pathname } = request.nextUrl
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

    return NextResponse.next()
}

/* Run on every route except Next internals, the API, and static files (anything with
 * a dot, e.g. /favicon.svg, /grain.png). */
export const config = {
    matcher: ["/((?!api|_next/static|_next/image|.*\\.).*)"],
}
