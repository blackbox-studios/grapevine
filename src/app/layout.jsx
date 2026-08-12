import "@/globals.css"

import Providers from "@/app/providers"
import App from "@/app/App"

export const metadata = {
    title: "Synaxis",
    icons: { icon: "/favicon.svg" },
}

/* viewportFit "cover" lets the page paint edge to edge under a notch / home indicator
 * and is what makes env(safe-area-inset-*) report real values — required for the
 * Capacitor build, a no-op on a device without cutouts. Everything that touches a
 * screen edge pads by the --safe-* tokens in globals.css. */
export const viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
}

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                {/* WHole app will load a lot faster if you specify all icons used within the
                    app aka &icon_names=anchor,search */}
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,300,0,0"
                />
            </head>
            <body>
                <Providers>{children}</Providers>
                <App />
            </body>
        </html>
    )
}
