"use client"

import {
  composeOverriddenBy,
  resolveOperatorIdentity,
  writeOperatorIdentity,
} from "@/lib/operator-identity"

export type ApprovalActionMode = "request" | "approve" | "reject" | "execute"

type ApprovalActionModalProps = {
  isOpen: boolean
  mode: ApprovalActionMode
  actorName: string
  actorEmail: string
  note: string
  busy?: boolean
  error?: string | null
  onChange: (next: { actorName: string; actorEmail: string; note: string }) => void
  onClose: () => void
  onSubmit: (payload: { actorIdentifier: string; note: string }) => Promise<void>
}

const COPY: Record<
  ApprovalActionMode,
  {
    title: string
    blurb: string
    noteLabel: string
    notePlaceholder: string
    confirmLabel: string
    requireNote: boolean
    accent: string
  }
> = {
  request: {
    title: "Request approval",
    blurb:
      "Freeze this exact permission set and send it into the approval workflow. The request will be stored with your identity and notes.",
    noteLabel: "Why does this change need approval?",
    notePlaceholder:
      "e.g. Payments platform confirmed these actions are no longer needed; requesting approval for production narrowing.",
    confirmLabel: "Create approval request",
    requireNote: true,
    accent: "text-amber-700",
  },
  approve: {
    title: "Approve request",
    blurb:
      "Approving authorizes execution of this exact stored change set. Execution still happens as a separate step.",
    noteLabel: "Approval note",
    notePlaceholder:
      "e.g. Reviewed CloudTrail evidence and consumer impact. Approved for execution.",
    confirmLabel: "Approve request",
    requireNote: false,
    accent: "text-emerald-700",
  },
  reject: {
    title: "Reject request",
    blurb:
      "Rejecting closes this request without touching AWS. Add a short reason so the requester understands what needs to change.",
    noteLabel: "Why are you rejecting this request?",
    notePlaceholder:
      "e.g. Missing telemetry for the DynamoDB path. Re-run after enabling the required data events.",
    confirmLabel: "Reject request",
    requireNote: true,
    accent: "text-rose-700",
  },
  execute: {
    title: "Execute approved request",
    blurb:
      "Execution will use the exact approved permission set stored on the request, not a live recomputed set.",
    noteLabel: "Execution note",
    notePlaceholder:
      "e.g. Executing during the approved maintenance window. Monitoring on-call notified.",
    confirmLabel: "Execute approved request",
    requireNote: false,
    accent: "text-sky-700",
  },
}

export function buildApprovalActionInitialState() {
  const identity = resolveOperatorIdentity()
  return {
    actorName: identity.name,
    actorEmail: identity.email || "",
    note: "",
  }
}

export function ApprovalActionModal({
  isOpen,
  mode,
  actorName,
  actorEmail,
  note,
  busy = false,
  error,
  onChange,
  onClose,
  onSubmit,
}: ApprovalActionModalProps) {
  if (!isOpen) return null

  const copy = COPY[mode]

  const handleSubmit = async () => {
    const trimmedName = actorName.trim()
    const trimmedEmail = actorEmail.trim()
    const trimmedNote = note.trim()
    if (!trimmedName) return
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) return
    if (copy.requireNote && !trimmedNote) return

    writeOperatorIdentity(trimmedName, trimmedEmail)
    await onSubmit({
      actorIdentifier: composeOverriddenBy(trimmedName, trimmedEmail),
      note: trimmedNote,
    })
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className={`text-xl font-semibold ${copy.accent}`}>{copy.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{copy.blurb}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          Identity is self-attested in this pilot login. It is recorded for audit, but it is not IdP-verified until SSO is connected.
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Your name
            </label>
            <input
              value={actorName}
              onChange={(event) => onChange({ actorName: event.target.value, actorEmail, note })}
              placeholder="e.g. Alice Operator"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Email
            </label>
            <input
              type="email"
              value={actorEmail}
              onChange={(event) => onChange({ actorName, actorEmail: event.target.value, note })}
              placeholder="alice@company.com"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {copy.noteLabel}
          </label>
          <textarea
            value={note}
            onChange={(event) => onChange({ actorName, actorEmail, note: event.target.value })}
            rows={4}
            placeholder={copy.notePlaceholder}
            className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || !actorName.trim() || !/^\S+@\S+\.\S+$/.test(actorEmail.trim()) || (copy.requireNote && !note.trim())}
            className="rounded-full bg-[#2D51DA] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2446c0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Working…" : copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
