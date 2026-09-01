/**
 * Counterparty identity rendering for dependency rows.
 *
 * Pure, DOM-free, and therefore directly executable: these are the functions
 * that decide what a customer sees as the name of the thing on the other end
 * of a relationship, so they carry the highest risk of quietly inventing a
 * label. Moved out of `components/inventory/dossier-primitives.tsx` verbatim.
 */

import type { Dependency } from "@/lib/resource-dossier-types"

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
