"use client"

/**
 * S3RemediationModal — overlay wrapper around S3RemediationCard.
 *
 * Drop-in replacement for the legacy S3PolicyAnalysisModal at its call
 * sites (crown-jewel-protection, LeastPrivilegeTab, identity-attack-paths,
 * nhi-profile/data-plane). Matches the legacy prop shape so existing
 * call sites need only swap the import.
 *
 * Intentionally thin: this owns nothing except modal chrome. All
 * remediation logic lives in <S3RemediationCard>.
 */

import React, { useEffect } from "react"
import { S3RemediationCard } from "./s3-remediation-card"

interface Props {
  isOpen: boolean
  onClose: () => void
  bucketName: string
  systemName?: string
  /**
   * Legacy props accepted for back-compat with call sites that haven't
   * been migrated yet. Ignored — the new card owns its own flow.
   */
  resourceData?: any
  onApplyFix?: (data?: any) => void
  /** Called after a successful apply for parent-side refresh. */
  onRemediationSuccess?: () => void
}

export function S3RemediationModal({
  isOpen,
  onClose,
  bucketName,
  systemName,
  onRemediationSuccess,
}: Props) {
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  if (!isOpen || !bucketName) return null

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`S3 bucket remediation — ${bucketName}`}
    >
      <div className="w-full max-w-4xl my-8 relative">
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
        <S3RemediationCard
          bucketName={bucketName}
          onApplied={() => {
            onRemediationSuccess?.()
          }}
        />
        {systemName && (
          <div className="text-center mt-2 text-xs text-white/70">
            system: {systemName}
          </div>
        )}
      </div>
    </div>
  )
}

export default S3RemediationModal
