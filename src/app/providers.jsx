"use client"

import { Toaster } from "sonner"

import { ThemeProvider, TooltipProvider, ScrollProvider } from "@/lib/providers"

/* Context providers shared by the whole app. next-themes handles the theme class on
 * <html> and the no-flash script (requires suppressHydrationWarning on <html> in the
 * root layout). */
export default function Providers({ children }) {
    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="grapevine-ui-theme"
            disableTransitionOnChange
        >
            <TooltipProvider>
                <ScrollProvider>
                    {/* Toasts sit at the foot of a phone's screen, which is exactly where an
                        open keyboard is — and the surfaces that toast most (the comment
                        composer, the login form) are the ones that raise it. `--bottom-inset`
                        is the keyboard's height when it is up and the home indicator's when
                        it is not, so the toast clears whichever is currently there. Only the
                        mobile offset moves; a desktop toast has nothing to clear. */}
                    <Toaster
                        richColors
                        mobileOffset={{ bottom: "calc(var(--bottom-inset) + 1rem)" }}
                        toastOptions={{ classNames: { toast: "!rounded-2xl" } }}
                    />
                    {children}
                </ScrollProvider>
            </TooltipProvider>
        </ThemeProvider>
    )
}
