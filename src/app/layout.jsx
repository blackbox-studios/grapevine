import "@/globals.css"

import Providers from "@/app/providers"
import App from "@/app/App"

export const metadata = {
    title: "Ozora",
    icons: { icon: "/favicon.svg" },
}

export const viewport = {
    width: "device-width",
    initialScale: 1,
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
