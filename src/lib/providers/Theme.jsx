"use client"

/* Theme is handled by next-themes. Re-exported here so the rest of the app keeps
 * importing `useTheme`/`ThemeProvider` from a single app-internal path. The provider
 * is configured (attribute/defaultTheme/storageKey) where it's mounted, in
 * app/providers.jsx. */
export { ThemeProvider, useTheme } from "next-themes"
