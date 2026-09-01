/**
 * Shared Resource Dossier v6 presentation primitives.
 *
 * Extracted from `resource-dossier.tsx` so the panel and its Dependencies tab
 * render identity, state and evidence identically. Behaviour is unchanged from
 * the original inline definitions — this is a move, not a rewrite.
 */

import type { Dependency, EvidenceBinding, SourceGenerationRef } from "@/lib/resource-dossier-types"

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

export function canonicalDependencyIdentity(dependency: Dependency) {
  return dependency.principal_arn
    ?? dependency.principal_canonical_resource_uid
    ?? dependency.target_arn
    ?? dependency.target_canonical_resource_uid
    ?? null
}

export function typedAwsIdentity(identity: string, resourceType?: string | null) {
  if (identity === "*") return "Any AWS principal"
  if (!identity.startsWith("arn:")) {
    const tail = identity.split(/[/:]/).filter(Boolean).at(-1) ?? identity
    return resourceType ? `${resourceType} · ${tail}` : tail
  }

  const parts = identity.split(":")
  const service = parts[2] ?? "AWS"
  const resource = parts.slice(5).join(":")
  const path = resource.split("/").filter(Boolean)
  const tail = path.at(-1) ?? resource

  if (service === "ec2" && path[0] === "instance") return `EC2 instance · ${tail}`
  if (service === "sts" && path[0] === "assumed-role") {
    const role = path[1] ?? "unknown role"
    const session = path.slice(2).join("/")
    return `STS session · ${role}${session ? ` / ${session}` : ""}`
  }
  if (service === "iam" && path[0] === "role") return `IAM role · ${path.slice(1).join("/")}`
  if (service === "iam" && path[0] === "user") return `IAM user · ${path.slice(1).join("/")}`
  if (service === "iam" && resource === "root") return "AWS account root"
  if (service === "lambda" && resource.startsWith("function:")) {
    return `Lambda function · ${resource.slice("function:".length)}`
  }
  if (service === "s3") return `S3 bucket · ${resource}`
  if (service === "kms") return `KMS key · ${tail}`

  const serviceLabel = service === "events" ? "EventBridge" : service.toUpperCase()
  return `${resourceType || serviceLabel} · ${tail}`
}

function isNetworkAddress(value: string) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(":")
}

export function displayIdentity(dependency: Dependency) {
  const canonical = canonicalDependencyIdentity(dependency)
  const resolved = dependency.principal_display_name ?? dependency.target_display_name
  if (resolved && resolved !== canonical && !resolved.startsWith("arn:")) {
    return !canonical && isNetworkAddress(resolved) ? `Network endpoint · ${resolved}` : resolved
  }
  if (canonical) return typedAwsIdentity(canonical, dependency.principal_type ?? dependency.target_type)
  return "Relationship endpoint"
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
