"use client"

import { X } from "lucide-react"

interface CreateCheckpointModalProps {
  isOpen: boolean
  onClose: () => void
  onSave?: (data: any) => void
}

export function CreateCheckpointModal({ isOpen, onClose, onSave }: CreateCheckpointModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="rounded-lg p-6 max-w-md w-full"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Create Checkpoint
          </h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Create a snapshot of the current configuration state
        </p>
        <button
          onClick={() => {
            onSave?.({})
            onClose()
          }}
          className="w-full px-4 py-2 rounded-lg text-white"
          style={{ background: "var(--action-primary)" }}
        >
          Create Checkpoint
        </button>
      </div>
    </div>
  )
}
