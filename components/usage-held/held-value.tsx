"use client"

import type { CSSProperties } from "react"
import type { BrssHold } from "@/lib/brss-held"
import { BrssHeldNotice } from "@/components/brss/brss-held-notice"
import { HELD_COLOR, HELD_LABEL, HELD_TITLE } from "@/lib/usage-held"

/**
 * A withheld usage-derived value (lib/usage-held.ts): "Unknown", muted, with
 * the reason on hover. Never a number, a percentage or a grade.
 */
export function HeldValue({
  testId,
  className,
  style,
}: {
  testId?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={className}
      style={{ ...style, color: HELD_COLOR }}
      title={HELD_TITLE}
      data-held="true"
      data-testid={testId}
    >
      {HELD_LABEL}
    </span>
  )
}

/** The surface-level notice: the shared sentence and the backend's codes, verbatim. */
export function UsageHeldNotice({ hold, testId }: { hold: BrssHold; testId: string }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{ background: `${HELD_COLOR}10`, borderColor: `${HELD_COLOR}40` }}
      data-testid={testId}
    >
      <BrssHeldNotice hold={hold} testId={`${testId}-detail`} />
    </div>
  )
}
