"use client"

/**
 * A7 B5: the backend answered 409 (SYSTEM_NAME_AMBIGUOUS / SYSTEM_KEY_NEEDS_ACCOUNT) -- the name stands for several system
 * identities, or a tag / source key needs its account. The person chooses; the first is never taken. Each choice opens that
 * system's own page by key (``systemDetailHref``). One component for every per-system screen that can receive the 409.
 */
import Link from "next/link"

import { systemDetailHref, type SystemCandidate } from "@/lib/scoped-system-catalog"

export function SystemNameChoice({
  systemName,
  candidates,
  purpose,
}: {
  systemName: string
  candidates: SystemCandidate[]
  /** What the chosen system's page shows ("services", "traffic", ...). */
  purpose: string
}) {
  return (
    <div role="alert" data-testid="system-name-ambiguous" className="rounded-md border border-[var(--border,#374151)] px-4 py-3 text-sm">
      <p className="mb-2">
        &ldquo;{systemName}&rdquo; stands for {candidates.length} systems. Choose one to see its {purpose}:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        {candidates.map((candidate) => (
          <li key={`${candidate.systemKey}|${candidate.accountId ?? ""}`}>
            <Link
              className="underline"
              href={systemDetailHref(candidate.systemName || systemName, candidate.systemKey, candidate.accountId)}
            >
              {candidate.systemName || systemName}
            </Link>{" "}
            <span className="text-[var(--muted-foreground,#9ca3af)]">
              ({candidate.accountId ? `account ${candidate.accountId}` : candidate.systemKey})
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SystemNameChoice
