"use client"

import { Toaster } from "sonner"
import { Auth0Provider } from "@auth0/nextjs-auth0"

import { ThemeProvider, TooltipProvider, ScrollProvider } from "@/lib/providers"

/* Context providers shared by the whole app. next-themes handles the theme class on
 * <html> and the no-flash script (requires suppressHydrationWarning on <html> in the
 * root layout); we keep the storageKey the app has always used. */
export default function Providers({ children }) {
    return (
        <Auth0Provider>
            <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem
                storageKey="cmdc-ui-theme"
                disableTransitionOnChange
            >
                <TooltipProvider>
                    <ScrollProvider>
                        <Toaster richColors toastOptions={{ classNames: { toast: "!rounded-2xl" } }} />
                        {children}
                    </ScrollProvider>
                </TooltipProvider>
            </ThemeProvider>
        </Auth0Provider>
    )
}
