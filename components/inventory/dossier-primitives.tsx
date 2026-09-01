/**
 * Shared Resource Dossier v6 presentation primitives.
 *
 * Extracted from `resource-dossier.tsx` so the panel and its Dependencies tab
 * render identity, state and evidence identically. Behaviour is unchanged from
 * the original inline definitions — this is a move, not a rewrite.
 */

import type { EvidenceBinding, SourceGenerationRef } from "@/lib/resource-dossier-types"

export {
  canonicalDependencyIdentity,
  displayIdentity,
  typedAwsIdentity,
} from "@/lib/dependency-identity"

export function StateBadge({ value, axis = "state" }: { value: string; axis?: "state" | "coverage" }) {
  const style = value === "ACTIVE" || value === "FULL" || value === "OBSERVED"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : value === "PARTIAL" || value === "CONFIGURED" || value === "STRUCTURAL"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : value === "INTEGRITY_HELD" || value === "HELD" || value === "BLOCKED"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-slate-200 bg-slate-50 text-slate-600"
  const labels: Record<string, string> = axis === "coverage" ? {
    FULL: "Complete coverage",
    PARTIAL: "Partial coverage",
    NONE: "No coverage proof",
    UNKNOWN: "Coverage unverified",
  } : {
    ACTIVE: "Verified profile",
    PARTIAL: "Evidence available",
    NOT_READY: "Identity available",
    INTEGRITY_HELD: "Evidence review",
    NOT_APPLICABLE: "Not applicable",
    OBSERVED: "Observed",
    CONFIGURED: "Configured",
    STRUCTURAL: "Structural",
    INFERRED: "Inferred",
    BLOCKED: "Evidence blocked",
    HELD: "Evidence held",
  }
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>{labels[value] ?? value.replaceAll("_", " ")}</span>
}

export function EvidenceRefList({ refs, sourceRefs = [] }: { refs: EvidenceBinding[]; sourceRefs?: SourceGenerationRef[] }) {
  if (!refs.length) return sourceRefs.length ? (
    <div className="space-y-1 text-slate-600">
      {sourceRefs.map(ref => <div key={`${ref.plane}:${ref.generation}`}><span className="font-semibold capitalize">{ref.plane}</span> generation <span className="font-mono">{ref.generation}</span> · object-level evidence link unavailable</div>)}
    </div>
  ) : <span className="text-slate-600">Object-level evidence link unavailable</span>
  return (
    <ul className="space-y-1">
      {refs.map(ref => (
        <li key={`${ref.object_key}:${ref.version_id}`} className="break-all font-mono text-[10px] text-slate-600">
          {ref.object_key} · version {ref.version_id} · sha {ref.digest.slice(0, 12)}…
        </li>
      ))}
    </ul>
  )
}
