"use client"

import type { BrssHold } from "@/lib/brss-held"

/**
 * The typed code(s) and the backend's reason for a held BRSS, verbatim.
 * Renders no score in any form: a held score is an absence, not a number.
 */
export function BrssHeldNotice({
  hold,
  testId = "brss-held-notice",
}: {
  hold: BrssHold
  testId?: string
}) {
  return (
    <div className="mt-2 space-y-1 text-xs" data-testid={testId}>
      {hold.codes.length > 0 ? (
        <p className="flex flex-wrap items-center gap-1">
          {hold.codes.map((code) => (
            <code
              key={code}
              className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] text-amber-800"
              data-testid="brss-held-code"
            >
              {code}
            </code>
          ))}
        </p>
      ) : (
        <p className="text-slate-500" data-testid="brss-held-no-code">
          The backend sent no typed code for this hold.
        </p>
      )}
      {hold.reason ? (
        <p className="text-slate-600" data-testid="brss-held-reason">
          {hold.reason}
        </p>
      ) : null}
    </div>
  )
}
