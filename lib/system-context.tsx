"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"

interface SystemContextValue {
  /** Current system name from URL ?system= param. Null if not specified. */
  systemName: string | null
  /** Whether a system is selected */
  hasSystem: boolean
}

const SystemContext = createContext<SystemContextValue | null>(null)

/**
 * Provider that reads systemName from URL search params.
 * Wrap your app or page layout with this provider.
 */
export function SystemProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  const systemName = searchParams.get("system")

  return (
    <SystemContext.Provider value={{ systemName, hasSystem: !!systemName }}>
      {children}
    </SystemContext.Provider>
  )
}

/**
 * Hook to access the current system context.
 * Returns { systemName, hasSystem }.
 * Throws if used outside SystemProvider.
 */
export function useSystem(): SystemContextValue {
  const context = useContext(SystemContext)
  if (!context) {
    throw new Error("useSystem must be used within a SystemProvider")
  }
  return context
}

/**
 * Hook that requires a system to be selected.
 * Returns the systemName (non-null) or throws.
 * Use this in components that cannot function without a system.
 */
export function useRequiredSystem(): string {
  const { systemName } = useSystem()
  if (!systemName) {
    throw new Error("No system selected. Add ?system=<name> to the URL.")
  }
  return systemName
}
