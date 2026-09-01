/**
 * Dependency relation registry — All Services Dependencies (workplan v1.3 §5.4, §6.3, §7).
 *
 * §5.4 forbids forcing every graph edge into a physical provider→consumer
 * direction. Each canonical relationship declares the role its edge SOURCE
 * plays plus a forward and an inverse display label, so the same stored fact
 * reads "Protected by sg-123" from a workload and "Protects 17 resources" from
 * the security group without duplicating or reversing the edge.
 *
 * This registry is the FRONTEND half of that contract and exists only until
 * DE-101/DE-104/DE-105 publish `mechanisms.yaml` + `bindings.yaml` and the read
 * model returns roles, labels and mechanism ids on the row. When that lands,
 * delete this table and read the server's — do not keep both.
 *
 * Not to be merged into `lib/edge-types.ts`: that module answers "should this
 * edge be drawn as active traffic" for the graph views. This one answers "what
 * does this relationship mean from the selected resource's side". Different
 * questions, deliberately separate tables.
 *
 * Honesty rules encoded here:
 *  - An unregistered relationship gets NO invented label (§11.1 admits only
 *    registered canonical relationships). It surfaces as unregistered.
 *  - §6.3 bans generic labels in the primary UI. `ASSOCIATED_WITH` is marked
 *    `generic` and is reported as a boundary rather than dressed up.
 */

export type EndpointRole = "consumer" | "provider" | "peer"

/** Perspective from the SELECTED resource's side. */
export type Perspective = "USES" | "USED_BY" | "PEER"

/** Graph orientation as returned by the dossier ledger. */
export type LedgerDirection = "UPSTREAM" | "DOWNSTREAM"

export interface RelationDefinition {
  /** Governing mechanism id (§7). */
  mechanism: MechanismId
  /** Role played by the edge's SOURCE node in the canonical orientation. */
  sourceRole: EndpointRole
  /** Label when the selected resource is the edge source. */
  forward: string
  /** Label when the selected resource is the edge target. */
  inverse: string
  /** Capability this relationship supplies (§5.6). */
  capability: string
  /** Canonical relationship this one is a legacy spelling of. */
  aliasOf?: string
  /** Generic relation banned from primary labelling by §6.3. */
  generic?: true
}

export type MechanismId =
  | "M01" | "M02" | "M03" | "M04" | "M05" | "M06" | "M07" | "M08"
  | "M09" | "M10" | "M11" | "M12" | "M13" | "M14" | "M15"

/** §7 mechanism catalogue titles. */
export const MECHANISM_LABELS: Record<MechanismId, string> = {
  M01: "Network attachment and interface policy",
  M02: "Network path and filtering",
  M03: "Traffic distribution and health",
  M04: "Runtime identity binding",
  M05: "Authorization",
  M06: "Encryption and key availability",
  M07: "Secret and configuration availability",
  M08: "Data access, persistence, and replication",
  M09: "Event and message delivery",
  M10: "Schedule and orchestration",
  M11: "Naming and service discovery",
  M12: "TLS certificate identity and trust",
  M13: "Hosting, provisioning, and capacity",
  M14: "Sharing and cross-boundary control",
  M15: "External endpoint",
}

export const RELATION_REGISTRY: Record<string, RelationDefinition> = {
  // ── M01/M02 network attachment and path ──────────────────────────────────
  SECURED_BY: {
    mechanism: "M01", sourceRole: "consumer",
    forward: "protected by", inverse: "protects",
    capability: "network policy",
  },
  // Legacy spellings of SECURED_BY. Readers accept all three, writers emit
  // SECURED_BY only (backend CLAUDE.md, "Key Relationship Types").
  HAS_SECURITY_GROUP: {
    mechanism: "M01", sourceRole: "consumer",
    forward: "protected by", inverse: "protects",
    capability: "network policy", aliasOf: "SECURED_BY",
  },
  USES_SECURITY_GROUP: {
    mechanism: "M01", sourceRole: "consumer",
    forward: "protected by", inverse: "protects",
    capability: "network policy", aliasOf: "SECURED_BY",
  },
  PROTECTS: {
    mechanism: "M01", sourceRole: "provider",
    forward: "protects", inverse: "protected by",
    capability: "network policy",
  },
  ATTACHED_TO: {
    mechanism: "M01", sourceRole: "consumer",
    forward: "attached to", inverse: "has attached",
    capability: "network policy",
  },
  IN_SUBNET: {
    mechanism: "M01", sourceRole: "consumer",
    forward: "placed in", inverse: "contains",
    capability: "network path",
  },
  IN_VPC: {
    mechanism: "M01", sourceRole: "consumer",
    forward: "placed in", inverse: "contains",
    capability: "network path",
  },
  MEMBER_OF: {
    mechanism: "M01", sourceRole: "consumer",
    forward: "member of", inverse: "has member",
    capability: "network policy",
  },
  HAS_ROUTE_TABLE: {
    mechanism: "M02", sourceRole: "consumer",
    forward: "uses route table", inverse: "routes for",
    capability: "network path",
  },
  ROUTES_VIA: {
    mechanism: "M02", sourceRole: "consumer",
    forward: "routes via", inverse: "routes for",
    capability: "network path",
  },
  TARGETS: {
    mechanism: "M02", sourceRole: "consumer",
    forward: "targets", inverse: "targeted by",
    capability: "network path",
  },
  HAS_SUBNET: {
    mechanism: "M02", sourceRole: "provider",
    forward: "contains", inverse: "placed in",
    capability: "network path",
  },

  // ── M03 traffic distribution ─────────────────────────────────────────────
  HAS_TARGET_GROUP: {
    mechanism: "M03", sourceRole: "consumer",
    forward: "has target group", inverse: "target group for",
    capability: "traffic delivery and healthy target",
  },
  BEHIND_LOAD_BALANCER: {
    mechanism: "M03", sourceRole: "consumer",
    forward: "behind load balancer", inverse: "load balances",
    capability: "traffic delivery and healthy target",
  },

  // ── M04 runtime identity binding ─────────────────────────────────────────
  USES_ROLE: {
    mechanism: "M04", sourceRole: "consumer",
    forward: "runs as", inverse: "identity for",
    capability: "identity binding",
  },
  HAS_ROLE: {
    mechanism: "M04", sourceRole: "consumer",
    forward: "runs as", inverse: "identity for",
    capability: "identity binding",
  },
  HAS_INSTANCE_PROFILE: {
    mechanism: "M04", sourceRole: "consumer",
    forward: "has instance profile", inverse: "instance profile for",
    capability: "identity binding",
  },
  USES_ROLE_VIA_INSTANCE_PROFILE: {
    mechanism: "M04", sourceRole: "consumer",
    forward: "runs as (via instance profile)", inverse: "identity for (via instance profile)",
    capability: "identity binding",
  },
  ASSIGNED_VIA_INSTANCE_PROFILE: {
    mechanism: "M04", sourceRole: "consumer",
    forward: "runs as (via instance profile)", inverse: "identity for (via instance profile)",
    capability: "identity binding",
  },

  // ── M05 authorization ────────────────────────────────────────────────────
  ASSUMES_ROLE: {
    mechanism: "M05", sourceRole: "consumer",
    forward: "assumes", inverse: "assumed by",
    capability: "effective authorization",
  },
  CAN_ASSUME: {
    mechanism: "M05", sourceRole: "consumer",
    forward: "can assume", inverse: "can be assumed by",
    capability: "effective authorization",
  },
  TRUSTS: {
    mechanism: "M05", sourceRole: "provider",
    forward: "trusts", inverse: "trusted by",
    capability: "effective authorization",
  },
  HAS_POLICY: {
    mechanism: "M05", sourceRole: "consumer",
    forward: "policy attached", inverse: "attached to",
    capability: "effective authorization",
  },
  ATTACHED_POLICY: {
    mechanism: "M05", sourceRole: "consumer",
    forward: "policy attached", inverse: "attached to",
    capability: "effective authorization", aliasOf: "HAS_POLICY",
  },
  USES_POLICY: {
    mechanism: "M05", sourceRole: "consumer",
    forward: "policy attached", inverse: "attached to",
    capability: "effective authorization", aliasOf: "HAS_POLICY",
  },
  GRANTS_ACCESS_TO: {
    mechanism: "M05", sourceRole: "consumer",
    forward: "effectively allowed on", inverse: "effectively grants",
    capability: "effective authorization",
  },

  // ── M06 encryption ───────────────────────────────────────────────────────
  ENCRYPTED_BY: {
    mechanism: "M06", sourceRole: "consumer",
    forward: "encrypted by", inverse: "encrypts",
    capability: "decryption and encryption availability",
  },
  ENCRYPTED_WITH: {
    mechanism: "M06", sourceRole: "consumer",
    forward: "encrypted by", inverse: "encrypts",
    capability: "decryption and encryption availability", aliasOf: "ENCRYPTED_BY",
  },
  USES_KMS_KEY_FOR_ENCRYPTION: {
    mechanism: "M06", sourceRole: "consumer",
    forward: "encrypted by", inverse: "encrypts",
    capability: "decryption and encryption availability", aliasOf: "ENCRYPTED_BY",
  },

  // ── M08 data access ──────────────────────────────────────────────────────
  ACTUAL_S3_ACCESS: {
    mechanism: "M08", sourceRole: "consumer",
    forward: "observed accessing", inverse: "observed accessed by",
    capability: "data access and persistence",
  },
  ACCESSES_RESOURCE: {
    mechanism: "M08", sourceRole: "consumer",
    forward: "observed accessing", inverse: "observed accessed by",
    capability: "data access and persistence",
  },
  QUERIED: {
    mechanism: "M08", sourceRole: "consumer",
    forward: "observed querying", inverse: "observed queried by",
    capability: "data access and persistence",
  },
  WRITES_LOGS_TO: {
    mechanism: "M08", sourceRole: "consumer",
    forward: "writes logs to", inverse: "receives logs from",
    capability: "data access and persistence",
  },

  // ── M09 event and message delivery ───────────────────────────────────────
  PUBLISHED_TO: {
    mechanism: "M09", sourceRole: "consumer",
    forward: "publishes to", inverse: "receives from",
    capability: "event delivery",
  },
  CONSUMED_FROM: {
    mechanism: "M09", sourceRole: "consumer",
    forward: "consumes from", inverse: "consumed by",
    capability: "event delivery",
  },
  DELIVERS_TO: {
    mechanism: "M09", sourceRole: "provider",
    forward: "delivers to", inverse: "receives from",
    capability: "event delivery",
  },
  TRIGGERS: {
    mechanism: "M09", sourceRole: "provider",
    forward: "triggers", inverse: "triggered by",
    capability: "event delivery",
  },
  HAS_TRIGGER: {
    mechanism: "M09", sourceRole: "consumer",
    forward: "triggered by", inverse: "triggers",
    capability: "event delivery",
  },
  INTEGRATES_WITH: {
    mechanism: "M09", sourceRole: "consumer",
    forward: "integrates with", inverse: "integration target for",
    capability: "event delivery",
  },
  INVOKED: {
    mechanism: "M09", sourceRole: "consumer",
    forward: "observed invoking", inverse: "observed invoked by",
    capability: "event delivery",
  },
  CALLS: {
    mechanism: "M09", sourceRole: "consumer",
    forward: "observed calling", inverse: "observed called by",
    capability: "event delivery",
  },
  RUNTIME_CALLS: {
    mechanism: "M09", sourceRole: "consumer",
    forward: "observed calling", inverse: "observed called by",
    capability: "event delivery", aliasOf: "CALLS",
  },
  ACTUAL_API_CALL: {
    mechanism: "M05", sourceRole: "consumer",
    forward: "observed calling", inverse: "observed called by",
    capability: "effective authorization",
  },
  ASSUMED_ROLE_OBSERVED: {
    mechanism: "M05", sourceRole: "consumer",
    forward: "observed assuming", inverse: "observed assumed by",
    capability: "effective authorization",
  },

  // ── M13 hosting ──────────────────────────────────────────────────────────
  HAS_STAGE: {
    mechanism: "M13", sourceRole: "provider",
    forward: "has stage", inverse: "stage of",
    capability: "runtime capacity",
  },
  CONTAINS: {
    mechanism: "M13", sourceRole: "provider",
    forward: "contains", inverse: "placed in",
    capability: "runtime capacity",
  },

  // ── M15 external endpoint ────────────────────────────────────────────────
  // Symmetric: a flow tuple names an initiator, not a provider of capability.
  ACTUAL_TRAFFIC: {
    mechanism: "M15", sourceRole: "peer",
    forward: "observed communicating with", inverse: "observed communicating with",
    capability: "network path",
  },

  // ── §6.3 generic — never given a typed label in the primary UI ───────────
  ASSOCIATED_WITH: {
    mechanism: "M13", sourceRole: "peer",
    forward: "associated with", inverse: "associated with",
    capability: "unspecified", generic: true,
  },
}

export interface ResolvedRelation {
  /** Registered in the §5.4 contract. Unregistered rows are never labelled. */
  registered: boolean
  /** True for §6.3-banned generic relations that must not be dressed up. */
  generic: boolean
  /** Perspective-aware label, or the raw type when unregistered. */
  label: string
  perspective: Perspective
  mechanism: MechanismId | null
  mechanismLabel: string | null
  capability: string | null
  /** Canonical relationship name — legacy spellings collapse onto it. */
  canonicalRelationship: string
  rawRelationship: string
}

const PERSPECTIVE_BY_ROLE: Record<EndpointRole, Perspective> = {
  // The selected resource consumes the counterparty's capability.
  consumer: "USES",
  // The selected resource supplies the capability the counterparty needs.
  provider: "USED_BY",
  peer: "PEER",
}

/**
 * Resolve one ledger row into a perspective-aware fact.
 *
 * `direction` is the dossier ledger's graph orientation: DOWNSTREAM when the
 * selected resource is the edge's start node, UPSTREAM when it is the end node.
 * The selected resource therefore plays `sourceRole` on DOWNSTREAM and the
 * opposite role on UPSTREAM.
 */
export function resolveRelation(
  relationship: string | null | undefined,
  direction: LedgerDirection | string | null | undefined,
): ResolvedRelation {
  const raw = String(relationship ?? "").trim()
  const definition = RELATION_REGISTRY[raw]
  const isDownstream = String(direction ?? "").toUpperCase() !== "UPSTREAM"

  if (!definition) {
    return {
      registered: false,
      generic: false,
      // No invented wording: §11.1 admits only registered relationships, so an
      // unregistered one shows its stored type and is reported as a boundary.
      label: raw || "unnamed relationship",
      perspective: isDownstream ? "USES" : "USED_BY",
      mechanism: null,
      mechanismLabel: null,
      capability: null,
      canonicalRelationship: raw,
      rawRelationship: raw,
    }
  }

  const selectedRole: EndpointRole = definition.sourceRole === "peer"
    ? "peer"
    : isDownstream
      ? definition.sourceRole
      : definition.sourceRole === "consumer" ? "provider" : "consumer"

  return {
    registered: true,
    generic: definition.generic === true,
    label: isDownstream ? definition.forward : definition.inverse,
    perspective: PERSPECTIVE_BY_ROLE[selectedRole],
    mechanism: definition.mechanism,
    mechanismLabel: MECHANISM_LABELS[definition.mechanism],
    capability: definition.capability,
    canonicalRelationship: definition.aliasOf ?? raw,
    rawRelationship: raw,
  }
}
