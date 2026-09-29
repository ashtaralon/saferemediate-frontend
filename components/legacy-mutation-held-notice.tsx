"use client"

import { legacyMutationHold, type LegacyMutationFamily } from "@/lib/legacy-mutation-hold"

/**
 * The visible reason a legacy mutation control is disabled. Renders nothing when the family is released, so a host
 * never shows a hold that is not in force.
 */
export function LegacyMutationHeldNotice({
  family,
  className,
}: {
  family: LegacyMutationFamily
  className?: string
}) {
  const hold = legacyMutationHold(family)
  if (!hold) return null
  return (
    <span
      role="note"
      data-testid={`legacy-mutation-held-${hold.family}`}
      data-hold-code={hold.code}
      className={className ?? "text-xs text-amber-800"}
    >
      {hold.message}
    </span>
  )
}
