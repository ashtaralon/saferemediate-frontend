"use client"

import { Suspense, type ReactNode } from "react"
import { ThemeProvider } from "next-themes"
import { SystemProvider } from "@/lib/system-context"

/**
 * Client-side providers wrapper.
 * - ThemeProvider (next-themes): class-based light/dark.
 *   `forcedTheme="light"` overrides any persisted user preference while
 *   the dark-mode color migration is in flight. Without it, users who
 *   toggled dark before the toggle was hidden still load with `.dark` on
 *   <html>, and the few semantic-token components (sidebar, etc.) flip
 *   to dark while the hardcoded-color components stay light — a visually
 *   inconsistent half-state. `forcedTheme` doesn't touch localStorage,
 *   so when the migration finishes we drop this prop and any persisted
 *   toggle is honored again without users having to re-set anything.
 *   enableSystem is OFF for the same reason. <ThemeToggle/> is held
 *   until the migration is done; flip both back on at that point.
 * - SystemProvider with required Suspense boundary for useSearchParams.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false} disableTransitionOnChange>
      <Suspense fallback={null}>
        <SystemProvider>
          {children}
        </SystemProvider>
      </Suspense>
    </ThemeProvider>
  )
}
