"use client"

import { Suspense, type ReactNode } from "react"
import { SystemProvider } from "@/lib/system-context"

/**
 * Client-side providers wrapper.
 * Includes SystemProvider with required Suspense boundary for useSearchParams.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SystemProvider>
        {children}
      </SystemProvider>
    </Suspense>
  )
}
