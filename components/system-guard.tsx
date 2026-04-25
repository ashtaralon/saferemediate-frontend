"use client"

import { useSystem } from "@/lib/system-context"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"
import type { ReactNode } from "react"

interface SystemGuardProps {
  children: ReactNode
  /** Optional fallback UI when no system is selected. Defaults to an alert. */
  fallback?: ReactNode
}

/**
 * Guard component that only renders children if a system is selected.
 * Shows a friendly message if ?system= param is missing from URL.
 */
export function SystemGuard({ children, fallback }: SystemGuardProps) {
  const { systemName, hasSystem } = useSystem()

  if (!hasSystem) {
    return fallback ?? (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No system selected</AlertTitle>
          <AlertDescription>
            Add <code className="bg-muted px-1 rounded">?system=your-system-name</code> to
            the URL to view data for a specific system, or go to{" "}
            <a href="/systems" className="underline font-medium">Systems</a> to select one.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return <>{children}</>
}
