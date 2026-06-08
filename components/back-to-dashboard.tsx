"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

interface BackToDashboardProps {
  className?: string
  iconClassName?: string
  href?: string
  ariaLabel?: string
}

// Shared back-arrow used on every standalone sub-page (any route under
// app/ that doesn't render LeftSidebarNav). Defaults to the light/zinc
// theme used by the home dashboard; pages on dark backgrounds pass
// slate-flavored overrides via className/iconClassName.
export function BackToDashboard({
  className = "p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
  iconClassName = "w-5 h-5 text-zinc-700 dark:text-zinc-300",
  href = "/",
  ariaLabel = "Back to dashboard",
}: BackToDashboardProps = {}) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className={className}
      aria-label={ariaLabel}
    >
      <ArrowLeft className={iconClassName} />
    </button>
  )
}
