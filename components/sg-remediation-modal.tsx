"use client"

/**
 * SGRemediationModal — overlay wrapper around SGRemediationCard.
 *
 * Exists to provide a drop-in replacement for the legacy
 * SGLeastPrivilegeModal at its call sites (crown-jewel-protection.tsx,
 * LeastPrivilegeTab.tsx, nhi-profile/network-plane.tsx,
 * identity-attack-paths/identity-attack-paths.tsx) — same prop shape,
 * but renders the new IAM-style remediation card with action ceilings,
 * override modal, operator identity capture, and durable audit trail.
 *
 * The legacy modal had ~1700 lines of inline business logic. This
 * wrapper is intentionally thin: it owns nothing except the
 * close-on-backdrop-click behavior. All the remediation logic lives
 * inside <SGRemediationCard>.
 */

import React, { useEffect } from "react"
import { SGRemediationCard } from "./sg-remediation-card"

interface Props {
  isOpen: boolean
  onClose: () => void
  sgId: string
  sgName?: string
  systemName?: string
  /**
   * Fired after a successful apply. The old modal's signature was
   * (sgId, rules, result) — this wrapper exposes the same callback
   * with a slimmer shape (sgId + summary).
   */
  onRemediate?: (
    sgId: string,
    summary?: { removed: number; snapshot_id: string | null },
  ) => void
}

export function SGRemediationModal({
  isOpen,
  onClose,
  sgId,
  sgName,
  systemName,
  onRemediate,
}: Props) {
  // Lock body scroll while open, restore on close.
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  if (!isOpen || !sgId) return null

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        // Close only when clicking the dim backdrop, not inside the card.
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Security Group remediation — ${sgName || sgId}`}
    >
      <div className="w-full max-w-4xl my-8 relative">
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
        <SGRemediationCard
          sgId={sgId}
          onApplied={(applied_sgId, summary) => {
            onRemediate?.(applied_sgId, summary)
          }}
        />
        {(sgName || systemName) && (
          <div className="text-center mt-2 text-xs text-white/70">
            {sgName ? <span className="font-mono">{sgName}</span> : null}
            {sgName && systemName ? " · " : ""}
            {systemName ? <span>system: {systemName}</span> : null}
          </div>
        )}
      </div>
    </div>
  )
}

export default SGRemediationModal
