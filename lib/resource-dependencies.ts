export type DependencyDirection = "inbound" | "outbound"

export interface DependencyPeer {
  id?: string | null
  name?: string | null
  arn?: string | null
  type?: string | null
}

export interface DependencyFreshness {
  state?: string | null
  field?: string | null
  value?: string | null
  source?: string | null
}

export interface DependencyRelationship {
  type?: string | null
  port?: number | string | null
  protocol?: string | null
  hit_count?: number | null
  first_seen?: string | null
  last_seen?: string | null
  action?: string | null
  properties?: Record<string, unknown> | null
  plane?: string | null
  evidence_kind?: string | null
  edge_class?: string | null
  source_system?: string | null
  freshness?: DependencyFreshness | null
  is_stale?: boolean | null
}

export interface DependencyConnection {
  source?: DependencyPeer
  target?: DependencyPeer
  relationship?: DependencyRelationship
}

export interface DependencyCoverage {
  returned: number
  relationship_total: number
  neighbor_total: number
  page_size: number
  truncated: boolean
}

export interface DependencyScope {
  account_id?: string | null
  account_match_mode?: string | null
  authority?: string | null
}

export interface ResourceDependenciesResponse {
  success: boolean
  resource_id: string
  connections: {
    inbound: DependencyConnection[]
    outbound: DependencyConnection[]
  }
  inbound_count: number
  outbound_count: number
  scope: DependencyScope
  coverage: {
    inbound: DependencyCoverage
    outbound: DependencyCoverage
  }
  timestamp?: string | null
}

export interface DependencyRow {
  key: string
  direction: DependencyDirection
  role: "Incoming" | "Outgoing"
  peer: DependencyPeer
  relationship: DependencyRelationship
}

const PREVIEW_EXCLUDED_RELATIONSHIP_TYPES = new Set([
  "ACTUAL_TRAFFIC",
  "HAD_ATTACHMENT",
  "HAD_CONFIGURATION_AT",
])

/**
 * The current backend endpoint returns scoped graph adjacency, not the
 * canonical displayable DependencyFact contract. Keep the preview default-off
 * until the backend owns that distinction; a frontend deployment must opt in
 * explicitly for C1 inspection.
 */
export function graphRelationshipsPreviewEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_ALL_SERVICES_DEPENDENCIES_PREVIEW,
): boolean {
  return value === "true"
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

export function dependencyRows(
  response: ResourceDependenciesResponse,
  direction: DependencyDirection,
): DependencyRow[] {
  const items = response.connections?.[direction] || []
  return items.flatMap((connection, index) => {
    const peer = direction === "inbound" ? connection.source || {} : connection.target || {}
    const relationship = connection.relationship || {}
    if (isPreviewExcludedRelationship(relationship)) return []
    const identity = text(peer.arn) || text(peer.id) || text(peer.name) || `unknown-${index}`
    const relation = text(relationship.type) || "UNKNOWN"
    return [{
      key: `${direction}:${identity}:${relation}:${index}`,
      direction,
      role: direction === "inbound" ? "Incoming" : "Outgoing",
      peer,
      relationship,
    }]
  })
}

export function isPreviewExcludedRelationship(relationship: DependencyRelationship): boolean {
  const relationshipType = text(relationship.type).toUpperCase()
  return (
    text(relationship.plane).toUpperCase() === "OPERATIONAL" ||
    text(relationship.edge_class).toLowerCase() === "decision_execution" ||
    PREVIEW_EXCLUDED_RELATIONSHIP_TYPES.has(relationshipType)
  )
}

export function excludedPreviewRelationshipCount(response: ResourceDependenciesResponse): number {
  return ([
    ...(response.connections?.inbound || []),
    ...(response.connections?.outbound || []),
  ]).filter((connection) => isPreviewExcludedRelationship(connection.relationship || {})).length
}

export function dependencyPlaneLabel(plane: unknown): string {
  switch (text(plane).toUpperCase()) {
    case "ALLOWED":
      return "Configured"
    case "OBSERVED":
      return "Observed"
    case "DERIVED":
      return "Derived"
    case "OPERATIONAL":
      return "Operational"
    default:
      return "Unknown"
  }
}

export function dependencyDisplayName(peer: DependencyPeer): string {
  return text(peer.name) || text(peer.id) || text(peer.arn) || "Unresolved resource"
}

export function dependencyRelationshipLabel(value: unknown): string {
  const raw = text(value)
  if (!raw) return "Unknown relationship"
  return raw
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function dependencyFreshnessValue(relationship: DependencyRelationship): string | null {
  return (
    text(relationship.freshness?.value) ||
    text(relationship.last_seen) ||
    text(relationship.first_seen) ||
    null
  )
}

export function rawRelationshipTotal(response: ResourceDependenciesResponse): number {
  return (
    Number(response.coverage?.inbound?.relationship_total || 0) +
    Number(response.coverage?.outbound?.relationship_total || 0)
  )
}

export function relationshipsAreTruncated(response: ResourceDependenciesResponse): boolean {
  return Boolean(response.coverage?.inbound?.truncated || response.coverage?.outbound?.truncated)
}

export function dependencyErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    for (const candidate of [record.detail, record.error]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
      if (candidate && typeof candidate === "object") {
        const nested = candidate as Record<string, unknown>
        if (typeof nested.message === "string" && nested.message.trim()) return nested.message.trim()
        if (typeof nested.code === "string" && nested.code.trim()) return nested.code.trim()
      }
    }
  }
  return `Dependencies returned ${status}`
}
