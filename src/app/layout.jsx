import "@/globals.css"

import Providers from "@/app/providers"
import App from "@/app/App"

export const metadata = {
    title: "Synaxis",
    icons: { icon: "/favicon.svg" },
}

/* viewportFit "cover" lets the page paint edge to edge under a notch / home indicator
 * and is what makes env(safe-area-inset-*) report real values on iOS and in mobile
 * browsers — required for the Capacitor build, a no-op on a device without cutouts.
 * (Android reports its insets a different way; globals.css reads both.) Everything that
 * touches a screen edge pads by the --safe-* tokens there. */
export const viewport = {
    width: "device-width",
    initialScale: 1,
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
 * The `__synaxisBoot` latch makes it strictly once-per-document. Anything rendered from
 * the tree also travels in the RSC payload, so React re-inserts this script during
 * hydration — and an inserted <script> executes. Without the latch that second run could
 * land after a gate had already redirected and yank the URL back to the root. */
const ROOT = `${(process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "")}/`

const NATIVE_BOOT = `(function(){try{if(window.__synaxisBoot)return;window.__synaxisBoot=1;
var c=window.Capacitor;
if(!((c&&c.isNativePlatform&&c.isNativePlatform())||location.protocol==='capacitor:'))return;
if(location.pathname!==${JSON.stringify(ROOT)})history.replaceState(null,'',${JSON.stringify(ROOT)});
}catch(e){}})();`

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
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
