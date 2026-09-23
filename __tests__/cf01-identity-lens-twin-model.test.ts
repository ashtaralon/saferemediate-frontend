/// <reference types="vitest/globals" />
/**
 * CF01 — the Identity & access lens as a twin of the Network view: the model
 * that turns a validated lens into the inputs the shared frame already takes
 * (rail nodes + overlay edges + chip captions).
 *
 * Fixtures: the backend's own emitter output (`estate-identity-access.json`,
 * see its `_provenance`) over the layout-only network fixture. They are test
 * inputs for the CONSUMER contract, not production reads.
 */
import { describe, expect, it } from "vitest"

import {
  buildIdentityLensForPayload,
  identityAnchorId,
} from "@/components/topology-v0-2/estate-identity-access-model"
import {
  IDENTITY_SERVICE_TARGETS,
  bindingMechanismWord,
  buildIdentityTwin,
  classifyTrustPrincipal,
  identityServiceAnchorId,
  reachByService,
} from "@/components/topology-v0-2/estate-identity-twin"

import v1 from "./fixtures/estate-identity-access.json"
import { estatePayload } from "./fixtures/cf01-d1/network-fixture"

// The emitter fixture predates the producer's explicit graph-scope field;
// bind it to its own inventory generation so the graph is READ, not withheld
// (mirrors cf01-d1-identity-canvas.test.tsx). Without this every trust and
// policy assertion below would pass over an empty graph.
function scoped(block: any): any {
  if (!block?.identity_graph || block.identity_graph.scope !== undefined) return block
  if (!["ready", "partial"].includes(block.identity_graph.status)) return block
  return {
    ...block,
    identity_graph: {
      ...block.identity_graph,
      scope: {
        level: "account", customer_id: block.scope.customer_id, account_id: block.scope.account_id,
        inventory_generation: block.inventory_authority.generation, region: null, system_name: null, vpc_id: null,
      },
    },
  }
}

function twinFor(rawBlock: unknown, focusId: string | null = null) {
  const block = scoped(rawBlock)
  const payload = { ...estatePayload(), identity_access: block } as any
  const topologyNodes = payload.nodes.map((n: any) => ({ ...n }))
  const lens = buildIdentityLensForPayload(payload, { topologyNodes })
  const twin = buildIdentityTwin(lens, {
    rawRoles: (block as any)?.roles ?? null,
    topologyNodes,
    focusId,
  })
  return { payload, lens, twin }
}

describe("workload → role rows", () => {
  it("reads the fixture graph (the control every trust/policy assertion below depends on)", () => {
    const { lens } = twinFor(v1.ready)
    expect(lens.graphState).toBe("ready")
    expect(lens.nodes.some(n => n.kind === "iam_user")).toBe(true)
  })

  it("draws one 'runs as' line per bound on-canvas workload with the mechanism as its badge, never animated", () => {
    const { twin } = twinFor(v1.ready)
    const runsAs = twin.edges.filter(e => e.identity?.family === "WORKLOAD_USES_ROLE")
    expect(runsAs).toHaveLength(1)
    expect(runsAs[0].source_id).toBe("i-web")
    expect(runsAs[0].target_id).toBe(identityAnchorId("iam_role", "AROAEXAMPLE"))
    expect(runsAs[0].identity?.label).toBe("instance profile")
    expect(runsAs[0].identity?.plane).toBe("configured")
    expect(runsAs[0].identity?.animated).toBe(false)
    expect(runsAs[0].edge_class).toBe("identity")
  })

  it("emits the bound role as an IAMRole rail node and captions the workload chip with mechanism · role", () => {
    const { twin } = twinFor(v1.ready)
    expect(twin.roleNodes.map(n => ({ id: n.id, type: n.type, name: n.name }))).toEqual([
      { id: identityAnchorId("iam_role", "AROAEXAMPLE"), type: "IAMRole", name: "web" },
    ])
    expect(twin.captions.get("i-web")).toBe("instance profile · web")
    expect(twin.counts.boundRoles).toBe(1)
  })

  it("counts, and does not draw, a bound workload that is not on this canvas", () => {
    const block = {
      ...v1.ready,
      roles: v1.ready.roles.map((r: any) => ({ ...r, workload_ids: ["i-not-here"] })),
    }
    const { twin } = twinFor(block)
    expect(twin.edges.filter(e => e.identity?.family === "WORKLOAD_USES_ROLE")).toHaveLength(0)
    expect(twin.roleNodes).toHaveLength(0)
    expect(twin.counts.boundWorkloadsOffCanvas).toBe(1)
  })
})

describe("role → service reach", () => {
  it("draws one action-scoped line per reached service, observed and moving only with a decision generation", () => {
    const { twin } = twinFor(v1.ready)
    const reach = twin.edges.filter(e => e.identity?.family === "ROLE_ACTION_DECISION")
    expect(reach).toHaveLength(1)
    expect(reach[0].source_id).toBe(identityAnchorId("iam_role", "AROAEXAMPLE"))
    expect(reach[0].target_id).toBe(identityServiceAnchorId("s3"))
    expect(reach[0].identity?.plane).toBe("observed")
    expect(reach[0].identity?.verdict).toBe("observed")
    expect(reach[0].identity?.animated).toBe(true)
    expect(reach[0].authority_state).toBe("authoritative")
    expect(reach[0].identity?.label).toBe("s3 · explicit 1 · used 1")
    expect(reach[0].last_seen).toBe("2026-09-14T06:00:00Z")
    // The anchor is a SERVICE on the regional rail, never a named bucket.
    expect(twin.serviceNodes).toEqual([
      expect.objectContaining({ id: identityServiceAnchorId("s3"), type: "S3", name: "S3 · any bucket" }),
    ])
    expect(twin.captions.get(identityAnchorId("iam_role", "AROAEXAMPLE"))).toContain("explicit 1 · used 1")
  })

  it("never moves an observed line the decision authority did not generation-stamp", () => {
    const block = { ...v1.ready, decision_authority: null } as any
    const { lens, twin } = twinFor(block)
    // Without a decision receipt the v1 view is still readable but not stamped.
    expect(lens.receipts.some(r => r.label === "Role action decision")).toBe(false)
    const reach = twin.edges.filter(e => e.identity?.family === "ROLE_ACTION_DECISION")
    for (const edge of reach) {
      expect(edge.identity?.animated).toBe(false)
      expect(edge.authority_state).not.toBe("authoritative")
    }
  })

  it("draws no reach line for a role whose usage is not computed, and says so on the chip", () => {
    const { twin } = twinFor(v1.partial)
    const apiRole = identityAnchorId("iam_role", "AROAAPI")
    expect(twin.edges.filter(e => e.identity?.family === "ROLE_ACTION_DECISION" && e.source_id === apiRole)).toHaveLength(0)
    expect(twin.captions.get(apiRole)).toContain("usage not computed")
    expect(twin.counts.rolesUsageNotComputed).toBe(1)
    // The ready role beside it still draws.
    expect(twin.edges.some(e => e.identity?.family === "ROLE_ACTION_DECISION" && e.source_id === identityAnchorId("iam_role", "AROAEXAMPLE"))).toBe(true)
  })

  it("lists a reached service the canvas has no home for on the chip instead of inventing a target", () => {
    const block = {
      ...v1.ready,
      roles: v1.ready.roles.map((r: any) => ({
        ...r,
        action_details: [...r.action_details, { ...r.action_details[0], action: "sts:AssumeRole", usage_state: "NOT_OBSERVED" }],
      })),
    }
    const { twin } = twinFor(block)
    const roleId = identityAnchorId("iam_role", "AROAEXAMPLE")
    expect(twin.reachNotDrawn.get(roleId)).toEqual(["sts"])
    expect(twin.captions.get(roleId)).toContain("not drawn: sts")
    expect(twin.serviceNodes.some(n => n.id === identityServiceAnchorId("sts"))).toBe(false)
    expect(twin.counts.reachNotDrawn).toBe(1)
  })
})

describe("a truncated action slice proves only what it shows", () => {
  const truncatedRole = (rows: any[]) => ({
    ...v1.ready,
    roles: v1.ready.roles.map((r: any) => ({ ...r, action_details: rows, action_details_truncated: true })),
  })
  const observedRow = { ...v1.ready.roles[0].action_details[0] }
  it("draws observed use as a floor and withholds every service the slice does not prove", () => {
    const block = truncatedRole([
      observedRow,
      { ...observedRow, action: "kms:Decrypt", usage_state: "NOT_OBSERVED" },
      { ...observedRow, action: "secretsmanager:GetSecretValue", usage_state: "NOT_OBSERVED" },
    ])
    const { twin } = twinFor(block)
    const reach = twin.edges.filter(e => e.identity?.family === "ROLE_ACTION_DECISION")
    expect(reach.map(e => e.target_id)).toEqual([identityServiceAnchorId("s3")])
    expect(reach[0].identity?.label).toBe("s3 · explicit ≥1 · used ≥1")
    expect(reach[0].identity?.animated).toBe(true)
    expect(twin.serviceNodes.map(n => n.id)).toEqual([identityServiceAnchorId("s3")])
    const caption = twin.captions.get(identityAnchorId("iam_role", "AROAEXAMPLE")) ?? ""
    expect(caption).toContain("first 25 actions only")
    expect(caption).toContain("2 services without observed use in them: not drawn")
    // Never a "not observed" claim from a cut slice.
    expect(twin.edges.some(e => e.identity?.verdict === "configured" && e.identity?.family === "ROLE_ACTION_DECISION")).toBe(false)
  })
  it("says the slice is partial even when every row in it is observed", () => {
    const { twin } = twinFor(truncatedRole([observedRow]))
    expect(twin.captions.get(identityAnchorId("iam_role", "AROAEXAMPLE"))).toContain("services beyond them: not served")
  })
})

describe("reachByService verdicts", () => {
  const row = (action: string, usage: string, coverage = "COMPLETE", last: string | null = null) => ({
    action, configured_grant: true, usage_state: usage, coverage_state: coverage, last_success_at: last,
  })
  it("keeps not observed, use unknown and denied apart", () => {
    const [kms, s3, sqs] = reachByService([
      row("s3:GetObject", "NOT_OBSERVED"),
      row("kms:Decrypt", "NOT_OBSERVED", "UNKNOWN"),
      row("sqs:SendMessage", "DENIED_ONLY"),
    ]).sort((a, b) => a.prefix.localeCompare(b.prefix))
    expect(kms).toMatchObject({ prefix: "kms", explicit: 1, notObserved: 1, coverageIncomplete: true })
    expect(s3).toMatchObject({ prefix: "s3", explicit: 1, notObserved: 1, coverageIncomplete: false })
    expect(sqs).toMatchObject({ prefix: "sqs", explicit: 1, denied: 1 })
  })
  it("takes the latest success across a prefix", () => {
    const [s3] = reachByService([
      row("s3:GetObject", "SUCCESS_OBSERVED", "COMPLETE", "2026-09-01T00:00:00Z"),
      row("s3:PutObject", "SUCCESS_OBSERVED", "COMPLETE", "2026-09-14T00:00:00Z"),
    ])
    expect(s3.used).toBe(2)
    expect(s3.lastSuccessAt).toBe("2026-09-14T00:00:00Z")
  })
})

describe("principal → role entrances", () => {
  const scope = { accountId: "416651950952", managementAccountId: "745783559495" }
  it("never labels the organisation's own management account as an outside party", () => {
    expect(classifyTrustPrincipal({ kind: "aws_account_principal", arn: "arn:aws:iam::745783559495:root", label: "x" }, scope))
      .toMatchObject({ class: "org_management", type: "AWSAccountPrincipal", accountId: "745783559495" })
    expect(classifyTrustPrincipal({ kind: "aws_account_principal", arn: "745783559495", label: "x" }, scope).class).toBe("org_management")
  })
  it("reads :root as the account-wide grant, a bare other account as other, and * as anyone", () => {
    expect(classifyTrustPrincipal({ kind: "aws_account_principal", arn: "arn:aws:iam::416651950952:root", label: "x" }, scope))
      .toMatchObject({ class: "this_account_root", label: "this account (:root)" })
    expect(classifyTrustPrincipal({ kind: "aws_account_principal", arn: "123456789012", label: "x" }, scope).class).toBe("other_account")
    expect(classifyTrustPrincipal({ kind: "aws_account_principal", arn: "*", label: "*" }, scope))
      .toMatchObject({ class: "anyone", type: "AnyonePrincipal" })
  })
  it("classifies role, user, federated and canonical-user principals by their own shape", () => {
    expect(classifyTrustPrincipal({ kind: "aws_account_principal", arn: "arn:aws:iam::416651950952:role/deploy", label: "x" }, scope))
      .toMatchObject({ class: "iam_role", type: "IAMRole", label: "role deploy" })
    expect(classifyTrustPrincipal({ kind: "aws_account_principal", arn: "arn:aws:iam::416651950952:user/alice", label: "x" }, scope))
      .toMatchObject({ class: "iam_user", type: "IAMUser" })
    expect(classifyTrustPrincipal({ kind: "federated_principal", arn: "arn:aws:iam::416651950952:saml-provider/Okta", label: "x" }, scope))
      .toMatchObject({ class: "federated", type: "FederatedPrincipal", label: "Okta · SAML / OIDC" })
    expect(classifyTrustPrincipal({ kind: "aws_account_principal", arn: "a".repeat(64), label: "x" }, scope).class).toBe("canonical_user")
    expect(classifyTrustPrincipal({ kind: "aws_account_principal", arn: null, label: "??" }, scope).class).toBe("unclassified")
  })
  it("folds service-principal trust into the role caption and draws entrances only for real callers", () => {
    const { lens, twin } = twinFor(v1.ready)
    const entrances = twin.edges.filter(e => e.identity?.family === "ROLE_TRUST_POLICY")
    const servicePrincipalIds = new Set(lens.nodes.filter(n => n.kind === "service_principal").map(n => n.id))
    for (const edge of entrances) {
      expect(servicePrincipalIds.has(edge.source_id)).toBe(false)
      expect(edge.identity?.animated).toBe(false)
      expect(edge.identity?.label).toMatch(/^(may assume|statement denies) · (conditioned|unconditioned)$/)
    }
    const nonService = lens.edges.filter(e =>
      e.family === "ROLE_TRUST_POLICY" && e.targetId === identityAnchorId("iam_role", "AROAEXAMPLE") &&
      lens.nodes.find(n => n.id === e.sourceId)?.kind !== "service_principal")
    expect(entrances).toHaveLength(nonService.length)
    expect(twin.principalNodes).toHaveLength(new Set(nonService.map(e => e.sourceId)).size)
    const roleCaption = twin.captions.get(identityAnchorId("iam_role", "AROAEXAMPLE")) ?? ""
    const serviceTrust = lens.edges.some(e =>
      e.family === "ROLE_TRUST_POLICY" && e.targetId === identityAnchorId("iam_role", "AROAEXAMPLE") &&
      lens.nodes.find(n => n.id === e.sourceId)?.kind === "service_principal")
    expect(roleCaption.includes("trusts ")).toBe(serviceTrust)
  })
})

describe("mechanism words", () => {
  it("names the AWS mechanism, never the lens word", () => {
    expect(bindingMechanismWord("instance_profile", "EC2")).toBe("instance profile")
    expect(bindingMechanismWord("direct", "Lambda")).toBe("execution role")
    expect(bindingMechanismWord("direct", "EC2")).toBe("attached directly")
    expect(bindingMechanismWord("", null)).toBe("runs as")
  })
})

describe("hidden sets are counted, never dropped", () => {
  it("counts service-linked roles, other roles, users, endpoint policy rows and unplaced targets", () => {
    const block = {
      ...v1.ready,
      identity_graph: {
        ...v1.ready.identity_graph,
        nodes: [
          ...v1.ready.identity_graph.nodes,
          { node_kind: "iam_role", name: "AWSServiceRoleForSupport", arn: "arn:aws:iam::416651950952:role/aws-service-role/support.amazonaws.com/AWSServiceRoleForSupport", resource_uid: "aws:iam:global:416651950952:role/aws-service-role/support.amazonaws.com/AWSServiceRoleForSupport", resolved: true, lifecycle_state: "ACTIVE", principal_id: "AROASLR", region: "global", resource_type: "iam:role" },
          { node_kind: "iam_role", name: "analyst", arn: "arn:aws:iam::416651950952:role/analyst", resource_uid: "aws:iam:global:416651950952:role/analyst", resolved: true, lifecycle_state: "ACTIVE", principal_id: "AROAANALYST", region: "global", resource_type: "iam:role" },
        ],
      },
    }
    const { twin } = twinFor(block)
    expect(twin.counts.serviceLinkedRoles).toBe(1)
    expect(twin.counts.otherAccountRoles).toBeGreaterThanOrEqual(1)
    expect(twin.counts.users).toBe(v1.ready.identity_graph.nodes.filter((n: any) => n.node_kind === "iam_user").length)
  })

  it("annotates a reached service with its resource-policy rows and never draws a grant line", () => {
    const { lens, twin } = twinFor(v1.ready)
    expect(twin.edges.some(e => e.identity?.family === "RESOURCE_POLICY_GRANT")).toBe(false)
    const s3Rows = lens.nodes.filter(n => n.kind === "resource_policy" && n.label === "s3:bucket-authorization").length
    const caption = twin.captions.get(identityServiceAnchorId("s3"))
    if (s3Rows > 0) expect(caption).toBe(`${s3Rows} policy row${s3Rows === 1 ? "" : "s"} projected · present/absent: not served`)
    else expect(caption).toBeUndefined()
  })
})

describe("service targets", () => {
  it("only ever anchors to a service the network canvas already has a slot for", () => {
    for (const [prefix, target] of Object.entries(IDENTITY_SERVICE_TARGETS)) {
      expect(identityServiceAnchorId(prefix)).toBe(`__identity:service:${prefix}__`)
      expect(typeof target.type).toBe("string")
      expect(target.name).toMatch(/· any /)
    }
  })
})
