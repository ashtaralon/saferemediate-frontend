"use client"

import { X } from "lucide-react"

interface RestoreCheckpointModalProps {
  isOpen: boolean
  onClose: () => void
  checkpoint: any
  onRestore?: (checkpoint: any) => void
}

export function RestoreCheckpointModal({ isOpen, onClose, checkpoint, onRestore }: RestoreCheckpointModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="rounded-lg p-6 max-w-md w-full"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Restore Checkpoint
          </h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Are you sure you want to restore to checkpoint {checkpoint?.date} {checkpoint?.time}?
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onRestore?.(checkpoint)
              onClose()
            }}
            className="flex-1 px-4 py-2 rounded-lg text-white"
            style={{ background: "var(--action-primary)" }}
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  )
}
