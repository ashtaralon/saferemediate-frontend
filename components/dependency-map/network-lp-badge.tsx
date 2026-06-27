"use client"

// Compact "Network LP N" badge for a subnet node in the Traffic Flow Map.
// Prop-driven (count supplied by a parent that fetched findings once) to avoid
// N per-subnet fetches in the canvas. Clicking opens the dedicated Network LP
// panel filtered to this subnet — it does NOT render the full cards inline.

import { Network } from "lucide-react"

export function NetworkLpBadge({
  subnetId,
  count,
  onOpen,
  sharedRt = false,
}: {
  subnetId: string
  count: number
  onOpen?: (subnetId: string) => void
  sharedRt?: boolean
}) {
  if (!count) return null
  const label = sharedRt && count > 1 ? `${count - 1} candidates · shared RT` : `Network LP ${count}`
  const href = `/network-lp?subnet=${encodeURIComponent(subnetId)}`

  const content = (
    <>
      <Network className="w-3 h-3" />
      <span>{label}</span>
    </>
  )

  // If a parent handler is provided, use it (in-app panel open); otherwise link.
  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(subnetId)}
        title="Open Network LP candidates for this subnet"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-teal-500/40 bg-teal-500/10 text-teal-600 dark:text-teal-400 hover:bg-teal-500/20 transition-colors"
      >
        {content}
      </button>
    )
  }
  return (
    <a
      href={href}
      title="Open Network LP candidates for this subnet"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-teal-500/40 bg-teal-500/10 text-teal-600 dark:text-teal-400 hover:bg-teal-500/20 transition-colors"
    >
      {content}
    </a>
  )
}

export default NetworkLpBadge
