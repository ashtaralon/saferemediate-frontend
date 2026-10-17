"use client"

/**
 * (S1b, N3 / N4a) Which Deployment each listed member belongs to, one card per Deployment: its OWN members (SINGLE), then the
 * members it shares -- with another Deployment (MULTIPLE) or with the System as a whole (MIXED) -- each said as such, never
 * folded into "its" members. System-level members and a capped list's omitted members are said apart, never attributed.
 * Rendering only: what is explained, and whether anything is, is decided by lib/system-boundary-assessment.ts (a preview) or
 * lib/system-boundary-finish-result.ts (THIS Finish's applied result).
 */
import { deploymentLine, remainderLines } from "@/lib/system-boundary-assessment"
import { resolutionWords, type Explanation } from "@/lib/system-boundary-deployment-context"

export function DeploymentExplanationCards({ explanation, testId }: { explanation: Explanation; testId: string }) {
  return (
    <div className="space-y-1" data-testid={testId}>
      {explanation.deployments.map((entry) => (
        <div key={entry.deployment.key} className="rounded border border-violet-200 p-2 text-xs"
          data-testid={`${testId}-${entry.deployment.deploymentKey}`}>
          <p className="font-medium">{deploymentLine(entry)}</p>
          <ul className="text-slate-600">
            {entry.single.map((uid) => <li key={uid}><span className="font-mono">{uid}</span> -- {resolutionWords("SINGLE")}</li>)}
            {entry.shared.map(({ uid, resolution }) => (
              <li key={uid}><span className="font-mono">{uid}</span> -- {resolutionWords(resolution)}</li>
            ))}
          </ul>
        </div>
      ))}
      {remainderLines(explanation).map((line) => <p key={line} className="text-xs text-slate-600">{line}</p>)}
      {explanation.systemLevel.length ? (
        <ul className="text-xs text-slate-600" data-testid={`${testId}-system-level`}>
          {explanation.systemLevel.map((uid) => (
            <li key={uid}><span className="font-mono">{uid}</span> -- {resolutionWords("SYSTEM_LEVEL")}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
