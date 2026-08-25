import "@/globals.css"

import Providers from "@/app/providers"
import App from "@/app/App"

export const metadata = {
    title: "Grapevine",
    icons: { icon: "/favicon.svg" },
}

/* viewportFit "cover" lets the page paint edge to edge under a notch / home indicator
 * and is what makes env(safe-area-inset-*) report real values on iOS and in mobile
 * browsers — required for the Capacitor build, a no-op on a device without cutouts.
 * (Android reports its insets a different way; globals.css reads both.) Everything that
 * touches a screen edge pads by the --safe-* tokens there.
 *
 * maximumScale + userScalable stop iOS Safari / WKWebView from auto-zooming when an
 * input under 16px gets focus — so composers and fields can stay at text-sm without
 * each one needing text-base as a workaround. Safari still lets users pinch-zoom for
 * accessibility despite user-scalable=no (iOS 10+); Capacitor's webview honors the cap. */
export const viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
}

/* Capacitor hands the webview index.html for *every* extensionless path — iOS always
 * (CapacitorRouter), Android whenever server.html5mode is on (the default). So a cold
 * start or reload at /settings serves the root document while location still reads
 * /settings, and the router paints the feed under the wrong URL. Rewriting to the root
 * before hydration keeps the two in agreement. Web is left alone: there every route
 * exports its own HTML, so deep links must keep resolving. If native deep links ever
 * land here, capture the incoming path first and replay it once mounted.
 *
 * It lives in <head> so it runs ahead of the framework chunks, which ship as async
 * scripts and can execute before a <body> script has even been parsed.
 *
 * The `__grapevineBoot` latch makes it strictly once-per-document. Anything rendered from
 * the tree also travels in the RSC payload, so React re-inserts this script during
 * hydration — and an inserted <script> executes. Without the latch that second run could
 * land after a gate had already redirected and yank the URL back to the root. */
const ROOT = `${(process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "")}/`

const NATIVE_BOOT = `(function(){try{if(window.__grapevineBoot)return;window.__grapevineBoot=1;
var c=window.Capacitor;
if(!((c&&c.isNativePlatform&&c.isNativePlatform())||location.protocol==='capacitor:'))return;
if(location.pathname!==${JSON.stringify(ROOT)})history.replaceState(null,'',${JSON.stringify(ROOT)});
}catch(e){}})();`

/* Marks the document as the packaged app, which globals.css keys the selection and callout
 * suppression off (`html.native`). Build-time rather than the runtime `isNative()` the rest
 * of the app branches on, because this has to be true on the very first paint: a class added
 * from an effect would leave a window in which a hold on text still raised the WebView's
 * selection handles. `NEXT_PUBLIC_NATIVE=1` is set only by `npm run build:native`, so the web
 * build never sets the class and every one of those rules stays unmatched there.
 *
 * next-themes owns the light/dark class on the same element and adds/removes only its own
 * values, so a second class here is safe. */
const NATIVE = process.env.NEXT_PUBLIC_NATIVE === "1"

export default function RootLayout({ children }) {
    return (
        <html lang="en" className={NATIVE ? "native" : undefined} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: NATIVE_BOOT }} />
            </head>
            <body>
                {/* <App/> sits inside <Providers> because its native effects read the
                    resolved theme to match the status bar to it (see useNative). */}
                <Providers>
                    {children}
                    <App />
                </Providers>
            </body>
        </html>
    )
}
