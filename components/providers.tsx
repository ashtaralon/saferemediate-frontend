"use client"

import { Suspense, type ReactNode } from "react"
import { ThemeProvider } from "next-themes"
import { SystemProvider } from "@/lib/system-context"

/**
 * Client-side providers wrapper.
 * - ThemeProvider (next-themes): class-based light/dark with a user toggle.
 *   defaultTheme="light" preserves today's look; dark = the navy/teal
 *   attacker-view aesthetic. enableSystem is OFF until the component color
 *   migration (bg-white → bg-card etc.) is done — otherwise an OS-dark user
 *   would land on half-migrated screens. The toggle is held for the same
 *   reason; flip enableSystem on + surface <ThemeToggle/> when dark is clean.
 * - SystemProvider with required Suspense boundary for useSearchParams.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <Suspense fallback={null}>
        <SystemProvider>
          {children}
        </SystemProvider>
      </Suspense>
    </ThemeProvider>
  )
}
