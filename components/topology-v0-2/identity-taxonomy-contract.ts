/**
 * The identity taxonomy the map will draw once the producer emits it.
 *
 * `estate-identity-access/v1` carries roles only: `roles[]`, two authorities,
 * scope, capabilities and gaps. Its graph is `workload | role | decision` with
 * two edge families, `WORKLOAD_USES_ROLE` and `ROLE_ACTION_DECISION`.
 *
 * IAM users, federated identities, policies, permission sets, groups and
 * protected resources are NOT in that contract, and neither are membership,
 * attached-policy, assumes/trusts, authenticates-as, RBAC-flow or data-access
 * edges. They are producer data. Deriving them client-side would be inventing
 * a graph, so this module does the opposite: it names each family, states the
 * exact fields the producer must supply, and reports every one of them
 * UNAVAILABLE until a payload actually carries it.
 *
 * That keeps three things true at once: the map says out loud what it cannot
 * show, nothing is fabricated to fill the gap, and when Semantic B17 lands the
 * block the reader below starts returning `present` with no renderer change.
 */

/** Node kinds beyond the v1 workload/role/decision trio. */
export const TAXONOMY_NODE_KINDS = [
  "iam_user",
  "federated_identity",
  "group",
  "policy",
  "permission_set",
  "protected_resource",
] as const
export type TaxonomyNodeKind = (typeof TAXONOMY_NODE_KINDS)[number]

/** Edge families beyond the v1 pair. Each is a distinct claim about authority. */
export const TAXONOMY_EDGE_FAMILIES = [
  "MEMBER_OF",
  "ATTACHED_POLICY",
  "CAN_ASSUME",
  "TRUSTS",
  "AUTHENTICATES_AS",
  "PERMISSION_FLOW",
  "DATA_ACCESS",
] as const
export type TaxonomyEdgeFamily = (typeof TAXONOMY_EDGE_FAMILIES)[number]

/**
 * What the producer must emit for a family to become drawable.
 *
 * `block_key` is the key on the identity-access block; `plane` is which plane
 * the edge belongs to, and it is fixed per family rather than per record,
 * because whether a fact is configured or observed is a property of what the
 * family MEANS. A membership is configuration. A data access is evidence.
 * Only an observed-plane family may ever animate.
 */
export interface TaxonomyRequirement {
  family: TaxonomyEdgeFamily
  block_key: string
  from_kinds: ReadonlyArray<TaxonomyNodeKind | "role" | "workload">
  to_kinds: ReadonlyArray<TaxonomyNodeKind | "role" | "workload">
  plane: "configured" | "observed"
  label: string
}

export const TAXONOMY_REQUIREMENTS: readonly TaxonomyRequirement[] = [
  { family: "MEMBER_OF", block_key: "group_memberships",
    from_kinds: ["iam_user", "federated_identity"], to_kinds: ["group"],
    plane: "configured", label: "member of" },
  { family: "ATTACHED_POLICY", block_key: "policy_attachments",
    from_kinds: ["role", "group", "iam_user", "permission_set"], to_kinds: ["policy"],
    plane: "configured", label: "grants" },
  { family: "CAN_ASSUME", block_key: "assume_grants",
    from_kinds: ["iam_user", "federated_identity", "role", "workload"], to_kinds: ["role"],
    plane: "configured", label: "can assume" },
  { family: "TRUSTS", block_key: "trust_grants",
    from_kinds: ["role"], to_kinds: ["iam_user", "federated_identity", "role"],
    plane: "configured", label: "trusts" },
  { family: "AUTHENTICATES_AS", block_key: "authentications",
    from_kinds: ["federated_identity"], to_kinds: ["iam_user", "role"],
    plane: "observed", label: "authenticated as" },
  { family: "PERMISSION_FLOW", block_key: "permission_flows",
    from_kinds: ["permission_set", "policy"], to_kinds: ["role", "group"],
    plane: "configured", label: "permits" },
  { family: "DATA_ACCESS", block_key: "data_accesses",
    from_kinds: ["role", "workload"], to_kinds: ["protected_resource"],
    plane: "observed", label: "accessed" },
]

export type TaxonomyAvailability =
  | { family: TaxonomyEdgeFamily; state: "present"; count: number }
  /** The producer has not sent this family. Not zero — absent. */
  | { family: TaxonomyEdgeFamily; state: "unavailable"; reason: string; block_key: string }

export interface TaxonomyReading {
  /** True only when at least one family arrived. */
  anyPresent: boolean
  families: TaxonomyAvailability[]
}

/**
 * Read the taxonomy families a block actually carries.
 *
 * Deliberately structural: it looks for the declared `block_key` and counts
 * what is there. It never derives one family from another — a role's
 * `attachment_modes` is not a policy attachment, and treating it as one would
 * put an edge on the map that the producer never asserted.
 */
export function readTaxonomy(block: unknown): TaxonomyReading {
  // `identity_access` is typed `unknown` on the payload on purpose (types.ts):
  // the tab validates the contract version before reading a field. This
  // reader therefore takes `unknown` too and checks structurally, instead of
  // casting past the guard that type exists to enforce.
  const source: Record<string, unknown> =
    block !== null && typeof block === "object" ? (block as Record<string, unknown>) : {}
  const families = TAXONOMY_REQUIREMENTS.map((req): TaxonomyAvailability => {
    const raw = source[req.block_key]
    if (Array.isArray(raw)) {
      return { family: req.family, state: "present", count: raw.length }
    }
    return {
      family: req.family,
      state: "unavailable",
      block_key: req.block_key,
      reason: `${req.block_key} not present on this payload`,
    }
  })
  return { anyPresent: families.some(f => f.state === "present"), families }
}

/** Human label for a family, for the placeholder rail and the legend. */
export const TAXONOMY_LABEL: Record<TaxonomyEdgeFamily, string> = {
  MEMBER_OF: "Group membership",
  ATTACHED_POLICY: "Attached policy / grant",
  CAN_ASSUME: "Can assume",
  TRUSTS: "Trusts",
  AUTHENTICATES_AS: "Authenticates as",
  PERMISSION_FLOW: "Permission / RBAC flow",
  DATA_ACCESS: "Data access",
}
