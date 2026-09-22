/// <reference types="vitest/globals" />
/**
 * CF01 · D1 — the identity lens adapter, against real producer output.
 *
 * Payloads:
 *   __tests__/fixtures/estate-identity-access.json — literal output of
 *     saferemediate-backend 41f5dda3 scripts/emit_estate_identity_access_fixtures.py
 *     (verified with its own `--check`).
 *   __tests__/fixtures/cf01-d1/estate-identity-graph-41f5.json — literal output
 *     of scripts/estate_identity_access._read_identity_graph at 41f5dda3, driven
 *     through a fake session that answers the reader's own Cypher constants
 *     (see emit_identity_graph_fixture.py beside it for the input rows).
 *
 * Expected semantics are stated independently of the adapter, from the
 * producer's contract:
 *   - WORKLOAD_USES_ROLE is a canonical inventory binding: configured, still.
 *   - ROLE_ACTION_DECISION is configured_and_observed: the edge is observed only
 *     when observed_use.state is "ready", and may move only when a decision
 *     generation stands behind it.
 *   - PRINCIPAL_HAS_*, USER_MEMBER_OF_GROUP, ROLE_TRUST_POLICY,
 *     RESOURCE_POLICY_GRANT are configured (scripts/estate_identity_graph.py
 *     passes plane="configured" on every one).
 *   - USER_AUTHENTICATES_WITH is observed iff the key/password was last used.
 *   - An endpoint with unresolved_reason is a NAME, not a projected resource:
 *     the edge is certain-but-unresolved and its chip is name-only.
 *   - Absent / null / {} / wrong contract_version identity_access is NOT zero
 *     identities, and the lens must say so rather than draw nothing.
 */

import { describe, expect, it } from "vitest"

import {
  IDENTITY_GRAPH_EDGE_FAMILIES,
  IDENTITY_GRAPH_NODE_KINDS,
  accountContextOf,
  boundAccessPathBranches,
  boundIdentityEdges,
  buildIdentityGraphView,
  buildIdentityIndicator,
  buildIdentityLensForPayload,
  buildIdentityView,
  identityAccessPathHopLabel,
  identityActionResourceScope,
  identityAnchorId,
  identityFocusedAccessPath,
  identityGraphViewForPayload,
  identityLensTrafficEdges,
  identityRelationshipHonesty,
  identitySelectionDetail,
  isIdentityAnchorId,
} from "@/components/topology-v0-2/estate-identity-access-model"
import { trafficMotionKind } from "@/components/topology-v0-2/aws-frame"

import v1 from "./fixtures/estate-identity-access.json"
import graphFixture from "./fixtures/cf01-d1/estate-identity-graph-6e08d6b2.json"
import fCandidate from "./fixtures/cf01-d1/estate-identity-graph-F-candidate.json"
import { estatePayload } from "./fixtures/cf01-d1/network-fixture"

const TOPOLOGY = estatePayload()
const topologyNodes = TOPOLOGY.nodes.map(n => ({ id: n.id, name: n.name, type: n.type }))

function lensOf(identityAccess: unknown) {
  const payload = { ...TOPOLOGY, identity_access: identityAccess } as any
  return buildIdentityLensForPayload(payload, { topologyNodes })
}

const READY_WITH_GRAPH = graphFixture.composed.ready_with_graph
const PARTIAL_WITH_GRAPH = graphFixture.composed.partial_with_truncated_graph

describe("the producer's closed family set is the lens's closed family set", () => {
  it("mirrors scripts/estate_identity_graph.py EDGE_FAMILIES exactly", () => {
    expect([...IDENTITY_GRAPH_EDGE_FAMILIES].sort()).toEqual([...graphFixture.edge_families].sort())
  })

  it("mirrors the fixture's contract version", () => {
    expect(buildIdentityGraphView(graphFixture.graph.ready).contractVersion).toBe(
      graphFixture.contract_version,
    )
  })
})

describe("every producer-supported edge family reaches the lens with the producer's plane", () => {
  const lens = lensOf(READY_WITH_GRAPH)
  const byFamily = (family: string) => lens.edges.filter(e => e.family === family)

  it("draws at least one edge for each family the fixture emits, and none for any other", () => {
    const emitted = new Set(graphFixture.graph.ready.edges.map((e: any) => e.family))
    emitted.add("WORKLOAD_USES_ROLE")
    emitted.add("ROLE_ACTION_DECISION")
    for (const family of emitted) expect(byFamily(family).length).toBeGreaterThan(0)
    for (const edge of lens.edges) expect(emitted.has(edge.family)).toBe(true)
  })

  it("WORKLOAD_USES_ROLE: canonical binding, configured, never animated, from the topology chip", () => {
    const edges = byFamily("WORKLOAD_USES_ROLE")
    expect(edges.length).toBe(1)
    expect(edges[0].plane).toBe("configured")
    expect(edges[0].animated).toBe(false)
    expect(edges[0].certainty).toBe("resolved")
    // `i-web` is a topology node in this canvas: the lens reuses its id.
    expect(edges[0].sourceId).toBe("i-web")
    expect(lens.nodes.find(n => n.id === "i-web")?.onCanvas).toBe(true)
    expect(isIdentityAnchorId(edges[0].targetId)).toBe(true)
  })

  it("ROLE_ACTION_DECISION: observed only because observed_use is ready, animated because generation 12 backs it", () => {
    const role = READY_WITH_GRAPH.roles[0]
    expect(role.observed_use.state).toBe("ready")
    expect(READY_WITH_GRAPH.decision_authority.generation).toBe(12)
    const edges = byFamily("ROLE_ACTION_DECISION")
    expect(edges.length).toBe(1)
    expect(edges[0].plane).toBe("observed")
    expect(edges[0].animated).toBe(true)
    expect(edges[0].generation).toBe(12)
  })

  it("ROLE_ACTION_DECISION: a withheld decision is configured, unresolved and still", () => {
    const lens = lensOf(PARTIAL_WITH_GRAPH)
    const withheld = PARTIAL_WITH_GRAPH.roles.find((r: any) => r.configured_grants.state === "unavailable")!
    const edge = lens.edges.find(
      e => e.family === "ROLE_ACTION_DECISION" && e.sourceId === identityAnchorId("iam_role", withheld.role_id),
    )!
    expect(edge.plane).toBe("configured")
    expect(edge.certainty).toBe("unresolved_endpoint")
    expect(edge.animated).toBe(false)
    const decision = lens.nodes.find(n => n.id === edge.targetId)!
    expect(decision.resolved).toBe(false)
    expect(decision.label).toMatch(/unavailable/i)
    expect(decision.sublabel).toMatch(/not zero/i)
  })

  it("ROLE_ACTION_DECISION: no decision authority means the decision line does not move", () => {
    const lens = lensOf(v1.partial_no_decision_authority)
    const decisions = lens.edges.filter(e => e.family === "ROLE_ACTION_DECISION")
    expect(decisions.length).toBeGreaterThan(0)
    expect(decisions.every(e => e.animated === false)).toBe(true)
  })

  it("PRINCIPAL_HAS_MANAGED_POLICY: configured; resolved when the ARN is an iam:policy in the generation, name-only otherwise", () => {
    const edges = byFamily("PRINCIPAL_HAS_MANAGED_POLICY")
    expect(edges.length).toBe(4)
    expect(edges.every(e => e.plane === "configured" && !e.animated)).toBe(true)
    const resolved = edges.filter(e => e.certainty === "resolved")
    const unresolved = edges.filter(e => e.certainty === "unresolved_endpoint")
    expect(resolved.length).toBe(2)
    expect(unresolved.length).toBe(2)
    const awsManaged = lens.nodes.find(n => n.arn === "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess")!
    expect(awsManaged.resolved).toBe(false)
    expect(awsManaged.unresolvedReason).toBe("ENDPOINT_NOT_A_PROJECTED_RESOURCE")
    const customer = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:policy/webshop-app")!
    expect(customer.resolved).toBe(true)
    expect(customer.kind).toBe("iam_policy")
  })

  it("PRINCIPAL_HAS_INLINE_POLICY and PRINCIPAL_HAS_PERMISSIONS_BOUNDARY: configured, name-only endpoints", () => {
    for (const family of ["PRINCIPAL_HAS_INLINE_POLICY", "PRINCIPAL_HAS_PERMISSIONS_BOUNDARY"]) {
      const edges = byFamily(family)
      expect(edges.length).toBe(1)
      expect(edges[0].plane).toBe("configured")
      expect(edges[0].certainty).toBe("unresolved_endpoint")
      expect(edges[0].animated).toBe(false)
    }
  })

  it("USER_MEMBER_OF_GROUP: configured, to a group NAME (no iam:group resource type)", () => {
    const edges = byFamily("USER_MEMBER_OF_GROUP")
    expect(edges.length).toBe(1)
    expect(edges[0].certainty).toBe("unresolved_endpoint")
    const group = lens.nodes.find(n => n.id === edges[0].targetId)!
    expect(group.kind).toBe("iam_group")
    expect(group.resolved).toBe(false)
    expect(group.label).toBe("webshop-admins")
  })

  it("ROLE_TRUST_POLICY: configured, points AT the role, names the principal kind, flags wildcard and conditions", () => {
    const edges = byFamily("ROLE_TRUST_POLICY")
    expect(edges.length).toBe(4)
    for (const edge of edges) {
      expect(edge.plane).toBe("configured")
      expect(edge.animated).toBe(false)
      const target = lens.nodes.find(n => n.id === edge.targetId)!
      expect(target.kind).toBe("iam_role")
    }
    const kinds = edges.map(e => lens.nodes.find(n => n.id === e.sourceId)!.kind).sort()
    expect(kinds).toEqual([
      "aws_account_principal",
      "aws_account_principal",
      "federated_principal",
      "service_principal",
    ])
    // This wildcard carries NO condition, so it really is unconditional and
    // must still read that way. (A conditional wildcard is a different fact
    // and is covered in its own suite below.)
    const wildcard = edges.find(e => e.facts.is_wildcard_principal === true)!
    expect(wildcard.facts.has_conditions).toBe(false)
    expect(wildcard.label).toMatch(/any principal, unconditionally/i)
    // Statement language only — never effective authorization or an observed
    // assumption.
    expect(wildcard.label).not.toMatch(/\b(can|allowed|authorized|did assume)\b/i)
    const conditioned = edges.find(e => e.facts.has_conditions === true)!
    expect(conditioned.facts.principal_kind).toBe("AWS")
    expect(conditioned.label).toMatch(/conditions/i)
  })

  it("USER_AUTHENTICATES_WITH: observed iff last used; each credential is its own name-only chip, never a second user", () => {
    const edges = byFamily("USER_AUTHENTICATES_WITH")
    expect(edges.length).toBe(4)
    const observed = edges.filter(e => e.plane === "observed")
    const configured = edges.filter(e => e.plane === "configured")
    expect(observed.length).toBe(2)
    expect(configured.length).toBe(2)
    expect(observed.every(e => e.lastSeen !== null)).toBe(true)
    expect(configured.every(e => e.lastSeen === null && !e.animated)).toBe(true)
    for (const edge of edges) {
      const target = lens.nodes.find(n => n.id === edge.targetId)!
      expect(target.kind).toBe("credential")
      expect(target.resolved).toBe(false)
      expect(edge.certainty).toBe("unresolved_endpoint")
    }
    expect(lens.nodes.filter(n => n.kind === "iam_user").map(n => n.label).sort()).toEqual(["alice", "bob"])
  })

  it("RESOURCE_POLICY_GRANT: configured; the protected S3 bucket resolves to the topology chip, the KMS key does not", () => {
    const edges = byFamily("RESOURCE_POLICY_GRANT")
    expect(edges.length).toBe(2)
    expect(edges.every(e => e.plane === "configured" && !e.animated)).toBe(true)
    const bucket = edges.find(e => e.sourceId === "bucket-assets")!
    expect(bucket).toBeDefined()
    expect(lens.nodes.find(n => n.id === "bucket-assets")?.onCanvas).toBe(true)
    const policy = lens.nodes.find(n => n.id === bucket.targetId)!
    expect(policy.kind).toBe("resource_policy")
    expect(policy.label).toBe("s3:bucket-authorization")
    const key = edges.find(e => e.sourceId !== "bucket-assets")!
    const keyNode = lens.nodes.find(n => n.id === key.sourceId)!
    expect(keyNode.onCanvas).toBe(false)
    expect(keyNode.kind).toBe("protected_resource")
    expect(keyNode.sublabel).toMatch(/not on this canvas scope/)
  })

  it("SOURCE_CALL_NOT_ACQUIRED gaps land on the principal they were reported for", () => {
    const api = lens.nodes.find(n => n.label === "api")!
    expect(api.gaps.map(g => g.code)).toContain("SOURCE_CALL_NOT_ACQUIRED")
    expect(lens.gaps.filter(g => g.code === "SOURCE_CALL_NOT_ACQUIRED").length).toBe(4)
  })

  it("the role bound by the v1 projection and the role in the graph are ONE node", () => {
    const roles = lens.nodes.filter(n => n.kind === "iam_role")
    // graph: web + api. v1: AROAEXAMPLE (web) — the same role_id and ARN as
    // the graph's web role, so it joins rather than standing beside it.
    expect(roles.length).toBe(2)
    const web = roles.find(r => r.arn === "arn:aws:iam::416651950952:role/web")!
    expect(web.facts.some(f => /granted/.test(f))).toBe(true)
    expect(lens.edges.filter(e => e.targetId === web.id && e.family === "WORKLOAD_USES_ROLE").length).toBe(1)
    expect(lens.edges.filter(e => e.sourceId === web.id && e.family === "PRINCIPAL_HAS_MANAGED_POLICY").length).toBe(2)
  })
})

describe("planes become FlowOverlay vocabulary, and the shared motion rule agrees", () => {
  const lens = lensOf(READY_WITH_GRAPH)
  const edges = identityLensTrafficEdges(lens)

  it("every edge is class identity with an identity annotation", () => {
    expect(edges.length).toBe(lens.edges.length)
    for (const e of edges) {
      expect(e.edge_class).toBe("identity")
      expect(e.identity?.family).toBeDefined()
    }
  })

  it("a configured identity edge can never animate under the map's own rule", () => {
    const configured = edges.filter(e => e.identity?.plane === "configured")
    expect(configured.length).toBeGreaterThan(0)
    for (const e of configured) {
      expect(e.evidence_type).toBe("configured")
      expect(e.last_seen).toBeNull()
      expect(trafficMotionKind(e)).toBe("none")
    }
  })

  it("only an observed, generation-backed edge is an authoritative observed segment", () => {
    const moving = edges.filter(e => trafficMotionKind(e) === "authoritative")
    expect(moving.map(e => e.identity!.family).sort()).toEqual([
      "ROLE_ACTION_DECISION",
      "USER_AUTHENTICATES_WITH",
      "USER_AUTHENTICATES_WITH",
    ])
    for (const e of moving) {
      expect(e.identity!.plane).toBe("observed")
      expect(e.projection_generation).not.toBeNull()
    }
  })

  it("an observed edge with no generation behind it is historical at most, never authoritative", () => {
    const noGeneration = lensOf({ ...READY_WITH_GRAPH, decision_authority: null, status: "partial" })
    const decision = identityLensTrafficEdges(noGeneration).find(e => e.identity?.family === "ROLE_ACTION_DECISION")!
    expect(decision.identity!.plane).toBe("observed")
    expect(decision.identity!.animated).toBe(false)
    expect(trafficMotionKind(decision)).not.toBe("authoritative")
  })
})

describe("unavailable is not zero", () => {
  it.each([
    ["absent", undefined],
    ["null", null],
    ["empty object", {}],
    ["wrong contract version", { ...v1.ready, contract_version: "estate-identity-access/v2" }],
    ["not an object", "nope"],
  ])("%s identity_access draws nothing AND says it is not an answer", (_label, block) => {
    const lens = lensOf(block)
    expect(lens.nothingToDraw).toBe(true)
    expect(lens.edges).toEqual([])
    expect(lens.state).not.toBe("ready")
    expect(lens.headline.length).toBeGreaterThan(20)
    expect(`${lens.headline} ${lens.detail}`).not.toMatch(/no workload in this scope is bound/i)
    expect(`${lens.headline} ${lens.detail}`).not.toMatch(/\b0 roles\b/)
  })

  it("the producer's unavailable projection is unavailable, with its gap code", () => {
    const lens = lensOf(v1.unavailable)
    expect(lens.state).toBe("unavailable")
    expect(lens.nothingToDraw).toBe(true)
    expect(lens.gaps.map(g => g.code)).toContain("ACTIVE_INVENTORY_POINTER_MISSING")
  })

  /**
   * The backend's own `empty_authoritative` payload is authoritatively empty
   * on the ROLES axis (roles_total 0, status ready, no gaps) while carrying a
   * fully-read identity graph of 5 nodes / 13 edges. That combination is real
   * producer output — verified byte-identical against
   * scripts/emit_estate_identity_access_fixtures.py --check — so the lens must
   * draw the graph it was given and must NOT announce an empty canvas.
   *
   * This test previously asserted `nothingToDraw === true` here and passed for
   * the wrong reason: every payload in the committed fixture carried
   * IDENTITY_GRAPH_READ_FAILED, so the graph was empty because it had never
   * been read. A fixture that silently absorbs a producer error looks exactly
   * like a healthy one.
   */
  it("roles-empty does NOT mean canvas-empty when the producer supplied a graph", () => {
    const lens = lensOf(v1.empty_authoritative)
    expect(lens.state).toBe("ready")
    expect((v1.empty_authoritative as any).roles_total).toBe(0)
    expect(lens.graphState).toBe("ready")
    expect(lens.edges.length).toBeGreaterThan(0)
    expect(lens.nothingToDraw).toBe(false)
    expect(lens.emptyAnswer).toBe(false)

    // The headline "no workload is bound to an IAM role" is PRECISE here, not
    // a contradiction: `roles[]` is the workload-bound role list, and the
    // graph emits no WORKLOAD_USES_ROLE edge at all. Roles, policies, trust
    // and account context still exist in this scope and are still drawn. The
    // honesty requirement is that the scoped claim must not escalate into an
    // empty-canvas answer covering relationships that ARE present.
    expect(lens.edges.some(e => e.family === "WORKLOAD_USES_ROLE")).toBe(false)
    expect(lens.edges.some(e => e.family === "ROLE_TRUST_POLICY")).toBe(true)
    expect(lens.edges.some(e => e.family === "ACCOUNT_LIMITED_BY_SCP")).toBe(true)
  })

  it("empty-authoritative is the ONE empty canvas that is an answer, and it says so", () => {
    const lens = lensOf(graphFixture.composed.empty_authoritative_with_empty_graph)
    expect(lens.state).toBe("ready")
    expect(lens.graphState).toBe("ready")
    expect(lens.nothingToDraw).toBe(true)
    expect(lens.emptyAnswer).toBe(true)
    expect(lens.headline).toMatch(/No workload in this scope is bound/)
    expect(lens.detail).toMatch(/not a missing read/)
    expect(lens.gaps).toEqual([])
  })

  /**
   * The collapse this lane exists to prevent. Both payloads below have the
   * SAME authoritatively-empty v1 roles projection and both draw zero
   * relationships. They differ only in whether the identity graph behind that
   * empty canvas was ever read, and they must not render identically.
   */
  it("an authoritative empty and an unread graph never render identically", () => {
    const answer = lensOf(graphFixture.composed.empty_authoritative_with_empty_graph)
    const unread = lensOf(graphFixture.composed.empty_authoritative_with_unread_graph)

    // Identical on the surface a naive consumer would key off.
    expect(answer.edges).toEqual([])
    expect(unread.edges).toEqual([])
    expect(answer.state).toBe("ready")
    expect(unread.state).toBe("ready")
    expect(answer.nothingToDraw).toBe(true)
    expect(unread.nothingToDraw).toBe(true)

    // And yet they are different answers.
    expect(answer.emptyAnswer).toBe(true)
    expect(unread.emptyAnswer).toBe(false)
    expect(unread.graphState).toBe("unavailable")
    expect(unread.gaps.map(g => g.code)).toContain("IDENTITY_GRAPH_READ_FAILED")
    // The unread one must never keep the reassurance meant for a real empty.
    expect(unread.detail).not.toMatch(/holds no workload-to-role binding here\.$/)
    expect(`${unread.headline} ${unread.detail}`).toMatch(/withheld|unavailable|not (be )?read|failed/i)
  })

  it("the producer's totals, not its empty lists, decide whether an empty graph is an answer", () => {
    const answerGraph = graphFixture.graph.empty_authoritative_standalone
    const unreadGraph = graphFixture.graph.unavailable_read_failed
    // Both carry an empty EDGE list — that is exactly why lists cannot be the test.
    expect(answerGraph.edges).toEqual([])
    expect(unreadGraph.edges).toEqual([])
    expect(answerGraph.status).toBe("ready")
    expect(unreadGraph.status).toBe("unavailable")
    // The discriminator: an integer total is an answer, null is the absence of one.
    expect(answerGraph.edges_total).toBe(0)
    expect(unreadGraph.edges_total).toBeNull()
    expect(unreadGraph.nodes_total).toBeNull()
  })

  it("a scope with no principals and no account context claims nothing", () => {
    const lens = lensOf({
      ...(v1.empty_authoritative as any),
      identity_graph: graphFixture.graph.empty_no_account_policy_context,
    })
    expect(lens.graphState).toBe("partial")
    expect(lens.emptyAnswer).toBe(false)
    expect(lens.gaps.map(g => g.code)).toContain("ACCOUNT_POLICY_CONTEXT_ABSENT")
  })

  it("a v1 block whose identity_graph key is absent (lifecycle-rebuilt) keeps the roles and names the missing graph", () => {
    const lens = lensOf(v1.ready)
    expect(v1.ready.identity_graph).toBeDefined()
    const { identity_graph, ...withoutGraph } = v1.ready as any
    void identity_graph
    const rebuilt = lensOf(withoutGraph)
    expect(rebuilt.graphState).toBe("absent")
    expect(rebuilt.edges.filter(e => e.family === "WORKLOAD_USES_ROLE").length).toBe(
      lens.edges.filter(e => e.family === "WORKLOAD_USES_ROLE").length,
    )
    expect(rebuilt.detail).toMatch(/carries no identity graph/i)
    expect(rebuilt.detail).toMatch(/not absent/i)
  })

  it("the regenerated ready fixture never carries IDENTITY_GRAPH_READ_FAILED", () => {
    for (const [name, block] of Object.entries(v1)) {
      if (!block || typeof block !== "object" || Array.isArray(block)) continue
      const graph = (block as { identity_graph?: { gaps?: Array<{ code?: string }> } }).identity_graph
      if (!graph) continue
      const codes = (graph.gaps ?? []).map(gap => gap.code)
      expect(codes, name).not.toContain("IDENTITY_GRAPH_READ_FAILED")
    }
  })

  it("a ready identity_graph from the emitter is drawn as a real graph, not as a swallowed read failure", () => {
    const lens = lensOf(v1.ready)
    expect(v1.ready.identity_graph.status).toBe("ready")
    expect(lens.graphState).toBe("ready")
    expect(lens.gaps.map(g => g.code)).not.toContain("IDENTITY_GRAPH_READ_FAILED")
    expect(lens.edges.some(e => e.family === "WORKLOAD_USES_ROLE")).toBe(true)
    expect(lens.edges.some(e => e.family === "ACCOUNT_IN_ORGANIZATION")).toBe(true)
  })

  it("the graph fixture's own read-failed block is reported, not drawn as empty", () => {
    const lens = lensOf({
      ...v1.ready,
      identity_graph: graphFixture.graph.unavailable_read_failed,
    })
    expect(lens.graphState).toBe("unavailable")
    expect(lens.gaps.map(g => g.code)).toContain("IDENTITY_GRAPH_READ_FAILED")
    expect(lens.edges.map(e => e.family).sort()).toEqual(["ROLE_ACTION_DECISION", "WORKLOAD_USES_ROLE"])
  })

  it.each([
    ["a plane no producer path emits", (g: any) => ({ ...g, edges: [{ ...g.edges[0], plane: "effective" }], edges_total: 1 })],
    ["an unknown family", (g: any) => ({ ...g, edges: [{ ...g.edges[0], family: "HAS_POLICY" }], edges_total: 1 })],
    ["an unknown node kind", (g: any) => ({ ...g, nodes: [{ ...g.nodes[0], node_kind: "martian" }] })],
    ["edges_total that contradicts edges", (g: any) => ({ ...g, edges_total: g.edges.length + 1 })],
    ["a missing truncated flag", (g: any) => { const { truncated, ...rest } = g; void truncated; return rest }],
  ])("%s withholds the graph as invalid rather than guessing", (_label, mutate) => {
    const view = buildIdentityGraphView(mutate(graphFixture.graph.ready))
    expect(view.state).toBe("invalid")
    expect(view.edges).toEqual([])
    expect(view.detail).toMatch(/withheld/)
  })
})

describe("truncation is visible, never a short answer that looks complete", () => {
  /**
   * `nodes_total` is the producer's own PRE-truncation total; the returned
   * `nodes` array is what survived the cap. Asserting the two are equal would
   * assert truncation away. Read from the fixture rather than hard-coded, so a
   * producer change shows up as a fixture diff and not as a passing test that
   * silently means something else — the previous literal `3` was carried over
   * from a retired fixture and no longer described anything.
   */
  it("carries the producer's PRINCIPALS_TRUNCATED gap and totals", () => {
    const lens = lensOf(PARTIAL_WITH_GRAPH)
    const graph = PARTIAL_WITH_GRAPH.identity_graph
    expect(lens.graphState).toBe("partial")
    expect(lens.truncation.producerTruncated).toBe(true)
    expect(lens.truncation.nodesTotal).toBe(graph.nodes_total)
    // The point of a total: it must EXCEED what was returned, or nothing was cut.
    expect(lens.truncation.nodesTotal!).toBeGreaterThan(graph.nodes.length)
    expect(lens.gaps.map(g => g.code)).toContain("PRINCIPALS_TRUNCATED")
  })

  it("bounds a neighbourhood by hops from the focus and reports what was left out", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const web = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!
    const one = boundIdentityEdges(lens.edges, web.id, 1, 1000)
    const two = boundIdentityEdges(lens.edges, web.id, 2, 1000)
    expect(one.focused).toBe(true)
    expect(one.edges.every(e => e.sourceId === web.id || e.targetId === web.id)).toBe(true)
    expect(two.edges.length).toBeGreaterThanOrEqual(one.edges.length)
    expect(one.omitted + one.edges.length).toBe(lens.edges.length)
  })

  it("with no focus, caps the drawn edges and counts the remainder", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const capped = boundIdentityEdges(lens.edges, null, 3, 5)
    expect(capped.edges.length).toBe(5)
    expect(capped.omitted).toBe(lens.edges.length - 5)
  })
})

describe("the inspector detail for a selection is the producer's evidence, not a dossier", () => {
  it("lists every relationship touching the node with direction, plane and certainty", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const alice = lens.nodes.find(n => n.label === "alice")!
    const detail = identitySelectionDetail(lens, alice.id)!
    expect(detail.kindLabel).toBe("IAM user")
    const families = detail.relationships.map(r => r.edge.family).sort()
    expect(families).toEqual([
      "PRINCIPAL_HAS_MANAGED_POLICY",
      "USER_AUTHENTICATES_WITH",
      "USER_AUTHENTICATES_WITH",
      "USER_AUTHENTICATES_WITH",
      "USER_AUTHENTICATES_WITH",
      "USER_MEMBER_OF_GROUP",
    ])
    expect(detail.relationships.every(r => r.direction === "outgoing")).toBe(true)
    expect(detail.receipts.length).toBe(2)
  })

  it("a topology chip that is also an identity endpoint gets its identity relationships", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const detail = identitySelectionDetail(lens, "i-web")!
    expect(detail.node.onCanvas).toBe(true)
    expect(detail.relationships.map(r => r.edge.family)).toEqual(["WORKLOAD_USES_ROLE"])
    expect(detail.relationships[0].peer.kind).toBe("iam_role")
  })

  it("returns null for a node the lens does not know, so the panel makes no claim", () => {
    expect(identitySelectionDetail(lensOf(READY_WITH_GRAPH), "alb")).toBeNull()
  })

  it("keeps Deny and conditional trust wording when actions are present", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const conditioned = lens.edges.find(
      e => e.family === "ROLE_TRUST_POLICY" && e.facts.has_conditions === true && e.facts.actions,
    )!
    expect(String(conditioned.facts.actions)).toMatch(/AssumeRole/)
    expect(identityAccessPathHopLabel(conditioned)).toBe(conditioned.label)
    expect(identityAccessPathHopLabel(conditioned)).toMatch(/conditions/i)
    expect(identityAccessPathHopLabel(conditioned)).not.toMatch(/AssumeRole trust configured/)
    expect(identityRelationshipHonesty(conditioned)).not.toMatch(/permission to assume/)
  })

  it("composes a connected workload-role path and names a missing target", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const role = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!
    const path = identityFocusedAccessPath(lens, role.id)
    expect(path.hops.some(hop => hop.edge?.family === "WORKLOAD_USES_ROLE")).toBe(true)
    expect(path.hops.some(hop => hop.edge?.family === "ROLE_TRUST_POLICY")).toBe(true)
    expect(path.missingTarget).toBe(true)
    expect(path.gaps.map(g => g.code)).toContain("NO_SERVED_TARGET_JOIN")
    expect(path.hops.some(hop => hop.edge?.family === "ROLE_ACTION_DECISION")).toBe(false)
  })

  it("never uses a peer ARN as action resource scope", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const trust = lens.edges.find(e => e.family === "ROLE_TRUST_POLICY")!
    const uses = lens.edges.find(e => e.family === "WORKLOAD_USES_ROLE")!
    expect(identityActionResourceScope(trust)).toBeNull()
    expect(identityActionResourceScope(uses)).toBeNull()
    expect(trust.facts.protects_arn ?? null).toBeNull()
  })

  it("keeps a selected fifth branch when the display cap is four", () => {
    const items = [0, 1, 2, 3, 4].map(index => ({ id: `caller-${index}` }))
    const bound = boundAccessPathBranches(items, 4, item => item.id === "caller-4")
    expect(bound.shown.map(item => item.id)).toEqual(["caller-4", "caller-0", "caller-1", "caller-2"])
    expect(bound.omitted).toBe(1)
  })

  it("exposes a protected resource neighbourhood when no role join is served", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const path = identityFocusedAccessPath(lens, "bucket-assets")
    expect(path.roleId).toBeNull()
    expect(path.neighbourhoodOutgoing.some(hop => hop.edge?.family === "RESOURCE_POLICY_GRANT")).toBe(true)
    expect(path.hops.some(hop => hop.edge?.family === "ROLE_ACTION_DECISION")).toBe(false)
  })

  it("follows a served role-resource join from the protected resource in either direction", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const role = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!
    const bucket = lens.nodes.find(n => n.id === "bucket-assets")!
    const key = lens.nodes.find(n => n.kind === "protected_resource" && n.id !== "bucket-assets")!
    const grant = lens.edges.find(e => e.family === "RESOURCE_POLICY_GRANT" && e.sourceId === "bucket-assets")!
    const incoming = {
      ...grant,
      id: `${grant.id}:incoming-role-resource`,
      sourceId: role.id,
      targetId: bucket.id,
    }
    const second = {
      ...grant,
      id: `${grant.id}:second-target`,
      sourceId: key.id,
      targetId: role.id,
    }
    const withJoins = { ...lens, edges: [...lens.edges, incoming, second] }
    const fromResource = identityFocusedAccessPath(withJoins, bucket.id)
    expect(fromResource.roleId).toBe(role.id)
    expect(fromResource.targets.map(hop => hop.to.id).sort()).toEqual([bucket.id, key.id].sort())
    expect(fromResource.workloads.some(hop => hop.edge?.family === "WORKLOAD_USES_ROLE")).toBe(true)
    const fromRole = identityFocusedAccessPath(withJoins, role.id)
    expect(fromRole.targets).toHaveLength(2)
    expect(fromRole.missingTarget).toBe(false)
  })
})

describe("CF01-F producer coverage reaches the lens without inventing joins", () => {
  it("places every producer node kind the ready graph names, including the four account-context kinds", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const kinds = new Set(lens.nodes.map(n => n.kind))
    for (const kind of [
      "aws_account",
      "organization",
      "organizational_unit",
      "control_policy",
    ] as const) {
      expect(kinds.has(kind), kind).toBe(true)
    }
    const account = lens.nodes.find(n => n.kind === "aws_account")!
    expect(account.label).toBe("416651950952")
    const scp = lens.nodes.filter(n => n.kind === "control_policy" && n.sublabel === "SCP")
    const rcp = lens.nodes.filter(n => n.kind === "control_policy" && n.sublabel === "RCP")
    expect(scp.length).toBeGreaterThan(0)
    expect(rcp.length).toBeGreaterThan(0)
    expect(scp[0].id).not.toBe(rcp[0].id)
  })

  it("keeps aws_account distinct from an account named only in a trust policy", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    expect(lens.nodes.some(n => n.kind === "aws_account")).toBe(true)
    expect(lens.nodes.some(n => n.kind === "aws_account_principal")).toBe(true)
  })

  it("draws every family the producer closed set names, from the rich fixture", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    const drawn = new Set(lens.edges.map(e => e.family))
    for (const family of IDENTITY_GRAPH_EDGE_FAMILIES) {
      expect(drawn.has(family), family).toBe(true)
    }
  })

  it("account-context families are configured, never animated, and SCP stays apart from RCP", () => {
    const lens = lensOf(READY_WITH_GRAPH)
    for (const family of [
      "ACCOUNT_IN_ORGANIZATION",
      "ACCOUNT_IN_ORG_UNIT",
      "ACCOUNT_LIMITED_BY_SCP",
      "ACCOUNT_LIMITED_BY_RCP",
    ] as const) {
      const edges = lens.edges.filter(e => e.family === family)
      expect(edges.length, family).toBeGreaterThan(0)
      expect(edges.every(e => e.plane === "configured" && e.verdict === "configured" && !e.animated)).toBe(true)
    }
  })

  it("unknown, standalone and in-organization are three different account-context facts", () => {
    const inOrg = accountContextOf(buildIdentityGraphView(graphFixture.graph.ready))
    expect(inOrg.state).toBe("in_organization")
    expect(inOrg.label).toMatch(/organization/i)
    expect(inOrg.scpCount).toBeGreaterThan(0)
    expect(inOrg.rcpCount).toBeGreaterThan(0)

    const standalone = accountContextOf(buildIdentityGraphView(graphFixture.graph.standalone_account))
    expect(standalone.state).toBe("standalone")
    expect(standalone.label).toMatch(/not part of an AWS Organization/i)
    expect(standalone.gapCode).toBeNull()

    const unknown = accountContextOf(buildIdentityGraphView(graphFixture.graph.absent_account_policy_context))
    expect(unknown.state).toBe("unknown")
    expect(unknown.label).toMatch(/not available/i)
    expect(unknown.gapCode).toBe("ACCOUNT_POLICY_CONTEXT_ABSENT")
    expect(`${unknown.label} ${unknown.detail}`).not.toMatch(/not part of an AWS Organization/i)

    const refused = accountContextOf(buildIdentityGraphView(graphFixture.graph.foreign_account_policy_context))
    expect(refused.state).toBe("refused")
    expect(refused.gapCode).toBe("ACCOUNT_POLICY_CONTEXT_FOREIGN")
  })

  it("the backend ready fixture's own graph is in an organization, and standalone is a different payload", () => {
    const ready = lensOf(v1.ready)
    expect(ready.accountContext.state).toBe("in_organization")
    const standalone = lensOf(v1.standalone_account)
    expect(standalone.accountContext.state).toBe("standalone")
    const unknown = lensOf(v1.partial_no_account_policy_context)
    expect(unknown.accountContext.state).toBe("unknown")
    expect(unknown.accountContext.gapCode).toBe("ACCOUNT_POLICY_CONTEXT_ABSENT")
  })

  it("a focused neighbourhood is itself capped, and the selected node's own edges stay first", () => {
    const dense = Array.from({ length: 80 }, (_, index) => ({
      id: `e-${index}`,
      family: "PRINCIPAL_HAS_MANAGED_POLICY" as const,
      plane: "configured" as const,
      certainty: "resolved" as const,
      verdict: "configured" as const,
      sourceId: index < 8 ? "focus" : `n-${Math.floor(index / 2)}`,
      targetId: index < 8 ? `n-${index}` : `n-${index + 1}`,
      label: `edge ${index}`,
      animated: false,
      generation: null,
      lastSeen: null,
      facts: {},
    }))
    const one = boundIdentityEdges(dense, "focus", 1, 5)
    expect(one.focused).toBe(true)
    expect(one.edges.length).toBe(5)
    expect(one.reachable).toBe(8)
    expect(one.omittedInNeighbourhood).toBe(3)
    expect(one.omitted).toBe(75)
    expect(one.edges.every(e => e.sourceId === "focus" || e.targetId === "focus")).toBe(true)
    const two = boundIdentityEdges(dense, "focus", 2, 5)
    expect(two.edges.length).toBe(5)
    expect(two.reachable).toBeGreaterThan(one.reachable)
    expect(two.omittedInNeighbourhood).toBeGreaterThan(0)
    const again = boundIdentityEdges(dense, "focus", 2, 5)
    expect(again.edges.map(e => e.id)).toEqual(two.edges.map(e => e.id))
  })
})

/**
 * The defect this lane was dispatched to close: the 120-edge cap applied only
 * when there was NO focus, so selecting a node handed back an unbounded
 * neighbourhood. Bounding it is not enough on its own — a bounded neighbourhood
 * that silently drops the selected node's own relationships, or that reorders
 * between renders, is a different lie. These pin the three properties that make
 * the bound safe to ship.
 */
describe("a focused neighbourhood is bounded, stable and fully disclosed", () => {
  /** A dense graph: the focus has 12 direct edges; the second ring has 300. */
  const edge = (id: string, sourceId: string, targetId: string) => ({
    id,
    family: "PRINCIPAL_HAS_MANAGED_POLICY" as const,
    plane: "configured" as const,
    certainty: "resolved" as const,
    verdict: "configured" as const,
    sourceId,
    targetId,
    label: id,
    animated: false,
    generation: null,
    lastSeen: null,
    facts: {},
  })
  const DENSE = [
    // The second ring comes FIRST in producer order, so any implementation
    // that merely slices the producer's list would evict the focus's own
    // edges. Ranking by hop is what keeps the selected path on the canvas.
    ...Array.from({ length: 300 }, (_, i) => edge(`ring2-${i}`, `n-${i % 12}`, `far-${i}`)),
    ...Array.from({ length: 12 }, (_, i) => edge(`focus-${i}`, "focus", `n-${i}`)),
    ...Array.from({ length: 40 }, (_, i) => edge(`unrelated-${i}`, `u-${i}`, `u-${i + 1}`)),
  ]

  it("bounds a FOCUSED neighbourhood, not just the unfocused view", () => {
    const wide = boundIdentityEdges(DENSE, "focus", 2, 120)
    expect(wide.focused).toBe(true)
    // The whole 2-hop neighbourhood is far larger than the cap.
    expect(wide.reachable).toBeGreaterThan(120)
    expect(wide.edges.length).toBe(120)
    expect(wide.omittedInNeighbourhood).toBe(wide.reachable - 120)
  })

  it("keeps the selected node's OWN relationships whatever the cap", () => {
    for (const cap of [1, 5, 12, 40, 120]) {
      const bound = boundIdentityEdges(DENSE, "focus", 2, cap)
      const ownDrawn = bound.edges.filter(e => e.sourceId === "focus").length
      // Every focus edge that fits is drawn before anything in the second ring.
      expect(ownDrawn).toBe(Math.min(cap, 12))
    }
  })

  it("is stable across renders and monotonic in the cap", () => {
    const a = boundIdentityEdges(DENSE, "focus", 2, 30)
    const b = boundIdentityEdges(DENSE, "focus", 2, 30)
    expect(b.edges.map(e => e.id)).toEqual(a.edges.map(e => e.id))

    // Raising the cap may only ADD lines. Drawn edges come back in PRODUCER
    // order (stable to render against), so the guarantee is a superset, not a
    // shared prefix: nothing already on the canvas may vanish because the
    // budget grew.
    const wider = boundIdentityEdges(DENSE, "focus", 2, 60)
    const widerIds = new Set(wider.edges.map(e => e.id))
    for (const drawn of a.edges) expect(widerIds.has(drawn.id)).toBe(true)
    expect(wider.edges.length).toBeGreaterThan(a.edges.length)

    // And producer order is what actually comes back, so repeated renders
    // paint the same lines in the same sequence.
    const indexOf = (id: string) => DENSE.findIndex(e => e.id === id)
    const order = wider.edges.map(e => indexOf(e.id))
    expect(order).toEqual([...order].sort((x, y) => x - y))
  })

  it("widening the hop count never evicts what one hop already showed", () => {
    const one = boundIdentityEdges(DENSE, "focus", 1, 120)
    const two = boundIdentityEdges(DENSE, "focus", 2, 120)
    const twoIds = new Set(two.edges.map(e => e.id))
    for (const drawn of one.edges) expect(twoIds.has(drawn.id)).toBe(true)
  })

  it("accounts for every edge, so bounded-away never reads as absent", () => {
    for (const [hops, cap] of [[1, 3], [2, 30], [2, 500]] as const) {
      const bound = boundIdentityEdges(DENSE, "focus", hops, cap)
      // Nothing is unaccounted for: drawn + omitted is the whole graph.
      expect(bound.edges.length + bound.omitted).toBe(DENSE.length)
      // And the omitted count separates "capped away" from "unrelated", so a
      // count of what is missing can never be read as a count of what exists.
      expect(bound.omittedInNeighbourhood).toBeLessThanOrEqual(bound.omitted)
      expect(bound.omittedInNeighbourhood).toBe(bound.reachable - bound.edges.length)
    }
  })

  it("a cap of zero draws nothing and says so, rather than falling back to everything", () => {
    const none = boundIdentityEdges(DENSE, "focus", 2, 0)
    expect(none.edges).toEqual([])
    expect(none.omitted).toBe(DENSE.length)
    expect(none.reachable).toBeGreaterThan(0)
  })

  it("an unfocused view is still capped, as it always was", () => {
    const bound = boundIdentityEdges(DENSE, null, 2, 120)
    expect(bound.focused).toBe(false)
    expect(bound.edges.length).toBe(120)
    expect(bound.omitted).toBe(DENSE.length - 120)
  })
})

/**
 * Root review of 147b1100, finding 2. Reproduced here against the real F
 * producer at 6e08d6b2 (see graph.conditional_wildcard_trust in the fixture,
 * emitted from a role whose trust statement pairs Principal "*" with an
 * aws:PrincipalOrgID condition).
 */
describe("a conditional wildcard trust is conditional, never universal", () => {
  const lens = lensOf({
    ...(READY_WITH_GRAPH as any),
    identity_graph: graphFixture.graph.conditional_wildcard_trust,
  })
  const trust = () => lens.edges.filter(e => e.family === "ROLE_TRUST_POLICY")

  it("the fixture really is the shape under review", () => {
    const raw = graphFixture.graph.conditional_wildcard_trust.edges.find(
      (e: any) => e.family === "ROLE_TRUST_POLICY",
    )!
    expect(raw.is_wildcard_principal).toBe(true)
    expect(raw.has_conditions).toBe(true)
    expect(raw.effect).toBe("Allow")
  })

  it("never says ANYONE may assume when the statement carries conditions", () => {
    const edges = trust()
    expect(edges.length).toBeGreaterThan(0)
    for (const edge of edges) {
      expect(edge.label).not.toMatch(/anyone/i)
      // The condition is what constrains the principal, so it must be visible.
      expect(edge.label).toMatch(/conditions/i)
    }
  })

  it("reads as a configured statement, not as authorization or authentication", () => {
    for (const edge of trust()) {
      expect(edge.plane).toBe("configured")
      expect(edge.verdict).toBe("configured")
      expect(edge.animated).toBe(false)
      // Not effective authorization, and not an observed assumption.
      expect(edge.label).not.toMatch(/\b(can|is allowed|allowed to|authorized|assumed|did assume)\b/i)
      expect(edge.label).toMatch(/statement/i)
    }
  })

  it("an UNCONDITIONAL wildcard still reads as unconditional — the fix is not blanket softening", () => {
    const ready = lensOf(READY_WITH_GRAPH)
    const open = ready.edges.find(
      e => e.family === "ROLE_TRUST_POLICY" && e.facts.is_wildcard_principal === true,
    )!
    expect(open.facts.has_conditions).toBe(false)
    expect(open.label).toMatch(/unconditionally/i)
    expect(open.label).not.toMatch(/if its conditions|matching its conditions/i)
  })
})

/**
 * Root review of 147b1100, finding 1. Reproduced against the real producer:
 * two users, policies available, a positively standalone account and ZERO
 * credential rows comes back status "ready" with no gaps and no credential
 * edges. The producer never noticed the rows were missing, so its silence
 * cannot be read as coverage.
 */
describe("query success is not collection completeness", () => {
  const block = graphFixture.graph.users_without_credential_rows

  it("the producer really does report ready with no gap for missing credential rows", () => {
    expect(block.status).toBe("ready")
    expect(block.gaps).toEqual([])
    expect(block.nodes.filter((n: any) => n.node_kind === "iam_user").length).toBe(2)
    expect(block.edges.filter((e: any) => e.family === "USER_AUTHENTICATES_WITH").length).toBe(0)
  })

  it("the lens does not turn that silence into an authoritative empty", () => {
    const lens = lensOf({ ...(READY_WITH_GRAPH as any), identity_graph: block })
    // Users ARE drawn; what is absent is their credential evidence.
    expect(lens.nodes.some(n => n.kind === "iam_user")).toBe(true)
    expect(lens.edges.some(e => e.family === "USER_AUTHENTICATES_WITH")).toBe(false)
    // And no surface may claim the canvas is an authoritative empty.
    expect(lens.emptyAnswer).toBe(false)
  })

  it("names the families whose absence is unknown rather than zero", () => {
    const lens = lensOf(graphFixture.composed.empty_authoritative_with_empty_graph)
    expect(lens.emptyClaim).toBe("qualified_empty")
    // The one family with a real coverage receipt is excluded from the caveat.
    expect(lens.familiesWithoutCoverageReceipt).not.toContain("WORKLOAD_USES_ROLE")
    expect(lens.familiesWithoutCoverageReceipt).toContain("USER_AUTHENTICATES_WITH")
    expect(lens.familiesWithoutCoverageReceipt).toContain("RESOURCE_POLICY_GRANT")
    // The missing producer contract is quoted, not paraphrased into comfort.
    expect(lens.coverageMissingLink).toMatch(/absence of gaps/i)
    expect(lens.coverageMissingLink).toMatch(/unknown, not zero/i)
  })

  it("there is no unqualified authoritative-empty claim anywhere", () => {
    for (const [name, composed] of Object.entries(graphFixture.composed)) {
      const lens = lensOf(composed)
      // "qualified_empty" is the strongest emptiness claim the installed
      // producer supports. Nothing may report a bare authoritative empty.
      expect(["not_empty", "qualified_empty", "unread"], name).toContain(lens.emptyClaim)
      if (lens.emptyClaim === "qualified_empty") {
        expect(lens.familiesWithoutCoverageReceipt.length, name).toBeGreaterThan(0)
      }
    }
  })
})

/**
 * The v1 roles projection and the nested identity graph are INDEPENDENT
 * sources. The producer isolates _read_identity_graph failures so the roles
 * stay readable, so a lens over a refused graph is not an empty lens.
 */
/**
 * CF01-F consumer contract.
 *
 * F made graph totals EXACT-BY-EXHAUSTION or explicitly `null`, because a
 * bounded read cannot state a population it did not finish and computing one
 * is the defect. This model used to require an integer for every
 * non-unavailable status, which hid a capped partial graph completely.
 *
 * `fCandidate` is literal output of cf01/be-F run through the same recipe as
 * the committed fixture. F is UNINTEGRATED, so this is a candidate, not a
 * landed contract — the file is named accordingly.
 */
describe("CF01-F totals: a maintained total OR an explicit unknown", () => {
  const graphOf = (block: unknown) => buildIdentityGraphView(block)
  const READY = graphFixture.graph.ready as any

  /**
   * REAL F BYTES, no longer a contract-shaped stand-in.
   *
   * The emitter now pages the way `read_paged` does and produces truncation by
   * walking past MAX_PRINCIPALS with real rows, so this block is genuine
   * producer output: 201 nodes and 606 edges carried, with BOTH totals null
   * because the population was never finished. This is exactly the state the
   * old validator rejected outright.
   */
  it("accepts a real truncated block: edges carried, totals null", () => {
    const truncated = (fCandidate.graph as any).partial_principals_truncated
    expect(truncated.truncated).toBe(true)
    expect(truncated.edges.length).toBeGreaterThan(0)
    expect(truncated.edges_total).toBeNull()
    expect(truncated.nodes_total).toBeNull()

    const view = graphOf(truncated)
    expect(view.state).toBe("partial")
    expect(view.edges.length).toBe(truncated.edges.length)
    expect(view.nodesTotal).toBeNull()
    expect(view.edgesTotal).toBeNull()
  })

  it("a capped partial graph is DRAWN, not withheld", () => {
    const lens = lensOf({
      ...(READY_WITH_GRAPH as any),
      identity_graph: (fCandidate.graph as any).partial_principals_truncated,
    })
    expect(lens.graphState).toBe("partial")
    expect(lens.edges.length).toBeGreaterThan(0)
    expect(lens.truncation.producerTruncated).toBe(true)
    // Truncation is disclosed without a fabricated total standing in for it.
    expect(lens.truncation.nodesTotal).toBeNull()
    expect(lens.gaps.map(g => g.code)).toContain("PRINCIPALS_TRUNCATED")
  })

  it("an exhausted read still states its exact totals", () => {
    const ready = (fCandidate.graph as any).ready
    expect(ready.truncated).toBe(false)
    expect(ready.edges_total).toBe(ready.edges.length)
    expect(graphOf(ready).state).not.toBe("invalid")
  })

  /**
   * CF01-F a361c126: the SAME rows under three different regional receipts.
   * `partial_source_calls_unacquired`, `coverage_certified_elsewhere`,
   * `coverage_region_unproven` and `coverage_unknown` are all emitted from one
   * `_principals(...)` estate, so any difference is attributable to the
   * receipt alone.
   */
  it("the coverage receipt, not the rows, decides what may be claimed", () => {
    const G = fCandidate.graph as any
    const blocks = [
      G.partial_source_calls_unacquired,
      G.coverage_certified_elsewhere,
      G.coverage_region_unproven,
      G.coverage_unknown,
    ]
    // Identical populations.
    for (const b of blocks) expect(b.edges.length).toBe(blocks[0].edges.length)
    // Different answers, and every one of them drawable.
    for (const b of blocks) expect(graphOf(b).state).not.toBe("invalid")

    const stateOf = (b: any, family: string) =>
      b.coverage.families.find((f: any) => f.resource_type === family).state
    // A regional family separates all three; a global one is region-invariant.
    expect(stateOf(G.partial_source_calls_unacquired, "kms:key-authorization")).toBe("COMMITTED")
    expect(stateOf(G.coverage_certified_elsewhere, "kms:key-authorization")).toBe("NOT_COMMITTED")
    expect(stateOf(G.coverage_region_unproven, "kms:key-authorization")).toBe("REGION_UNPROVEN")
    expect(stateOf(G.coverage_unknown, "kms:key-authorization")).toBe("UNKNOWN")
    for (const b of [G.partial_source_calls_unacquired, G.coverage_certified_elsewhere, G.coverage_region_unproven]) {
      expect(stateOf(b, "iam:role")).toBe("COMMITTED")
    }
  })

  it("a single-region generation asked about its own region is READY, not partial", () => {
    // F's row 1. The fixture's `ready` block now genuinely is one: every
    // source call proven acquired AND certified for the region requested.
    const ready = (fCandidate.graph as any).ready
    expect(ready.status).toBe("ready")
    expect(ready.gaps).toEqual([])
    expect(ready.coverage.all_required_committed).toBe(true)
    expect(ready.coverage.all_region_scoped).toBe(true)
    expect(ready.coverage.requested_region).toBe("eu-west-1")
    expect(ready.coverage.region_unproven_families).toEqual([])
  })

  it("REGION_UNPROVEN is its own answer, not folded into the other three", () => {
    const unproven = (fCandidate.graph as any).coverage_region_unproven
    const cov = unproven.coverage
    // The family IS in the generation; its region is not established.
    expect(cov.region_unproven_families.length).toBeGreaterThan(0)
    expect(cov.all_region_scoped).toBe(false)
    // Not COMMITTED (the original defect) and not NOT_COMMITTED (which would
    // invent a missing family).
    expect(cov.uncommitted_families).toEqual([])
    expect(cov.all_required_committed).toBe(false)
    expect(unproven.gaps.map((g: any) => g.code)).toContain("REQUIRED_FAMILY_REGION_UNPROVEN")
  })

  it("every coverage gap names the scope region it is talking about", () => {
    for (const key of ["coverage_certified_elsewhere", "coverage_region_unproven"]) {
      const block = (fCandidate.graph as any)[key]
      const coverageGaps = block.gaps.filter((g: any) =>
        g.code.startsWith("REQUIRED_FAMILY_"),
      )
      expect(coverageGaps.length, key).toBeGreaterThan(0)
      for (const gap of coverageGaps) expect(gap, `${key} ${gap.code}`).toHaveProperty("scope_region")
    }
  })

  it("global families are region-invariant, so the role and region axes stay apart", () => {
    const cov = (fCandidate.graph as any).coverage_region_unproven.coverage
    const s3 = cov.families.find((f: any) => f.resource_type === "s3:bucket-authorization")
    expect(s3.role).toBe("resource_grant")
    expect(s3.scope_region).toBe("global")
    expect(s3.state).toBe("COMMITTED")
  })

  it("still rejects a total that is WRONG — unknown and invalid are different", () => {
    for (const bad of [-1, 1.5, "7", {}, []]) {
      expect(graphOf({ ...READY, nodes_total: bad }).state, `nodes_total ${String(bad)}`).toBe("invalid")
      expect(graphOf({ ...READY, edges_total: bad }).state, `edges_total ${String(bad)}`).toBe("invalid")
    }
  })

  /**
   * Verified against cf01/be-F scripts/estate_identity_access.py:540 —
   * `edges_total=(None if truncated else len(edges))`. A stated edge total
   * means the population was exhausted, so it still equals the carried count;
   * truncation states null instead of a smaller number. The invariant is kept
   * where it holds rather than abandoned.
   */
  it("keeps the edges_total === carried invariant wherever a number is stated", () => {
    expect(graphOf({ ...READY, edges_total: READY.edges.length + 1 }).state).toBe("invalid")
    expect(graphOf({ ...READY, edges_total: READY.edges.length }).state).not.toBe("invalid")
  })

  it("does NOT impose that invariant on nodes_total, which is a pre-cap census", () => {
    // _node_census counts what the block WOULD hold uncapped, so exceeding
    // nodes.length is correct, not a contradiction.
    const view = graphOf({ ...READY, nodes_total: READY.nodes.length + 99 })
    expect(view.state).not.toBe("invalid")
    expect(view.nodesTotal).toBe(READY.nodes.length + 99)
  })

  it("an unavailable block must still carry null totals, as before", () => {
    expect(graphOf({ ...READY, status: "unavailable", nodes: [], edges: [] }).state).toBe("invalid")
  })
})

describe("CF01-F coverage: an additive key, read from real F output", () => {
  const F = fCandidate.graph as any

  it("F really does emit coverage on ready, partial and unavailable blocks", () => {
    for (const key of ["empty_authoritative_standalone", "unavailable_read_failed"]) {
      expect(F[key].coverage, key).toBeDefined()
      expect(F[key].coverage.authority).toBe("inventory_projection_committed_source_scopes")
      expect(F[key].coverage.families.length).toBeGreaterThan(0)
    }
  })

  it("every family state is one of the three F defines", () => {
    for (const family of F.empty_authoritative_standalone.coverage.families) {
      expect(["COMMITTED", "NOT_COMMITTED", "UNKNOWN"]).toContain(family.state)
    }
  })

  it("the additive key does not break this consumer — old and new both parse", () => {
    // New: carries coverage.
    expect(buildIdentityGraphView(F.empty_authoritative_standalone).state).not.toBe("invalid")
    // Old: no coverage key at all. Additive means the absence is still valid.
    const { coverage, ...withoutCoverage } = F.empty_authoritative_standalone
    void coverage
    expect(buildIdentityGraphView(withoutCoverage).state).not.toBe("invalid")
  })

  it("F's unavailable block reports wholly-unknown coverage, not committed", () => {
    const cov = F.unavailable_read_failed.coverage
    expect(cov.all_required_committed).toBe(false)
    expect(cov.unknown_families.length).toBeGreaterThan(0)
    // An unavailable block has established nothing; it must not read as a
    // coverage claim.
    expect(cov.families.every((f: any) => f.state === "UNKNOWN")).toBe(true)
  })
})

describe("the roles projection is drawable on its own", () => {
  it.each([
    ["absent graph", () => graphFixture.composed.valid_role_bindings_absent_graph, "absent"],
    ["unread graph", () => graphFixture.composed.valid_role_bindings_unread_graph, "unavailable"],
  ])("%s: the role bindings still reach the lens", (_label, block, expectedGraphState) => {
    const lens = lensOf(block())
    expect(lens.graphState).toBe(expectedGraphState)
    expect(lens.edges.length).toBeGreaterThan(0)
    expect(lens.edges.some(e => e.family === "WORKLOAD_USES_ROLE")).toBe(true)
    // Not an empty canvas, and not an answer about emptiness either.
    expect(lens.nothingToDraw).toBe(false)
    expect(lens.emptyClaim).toBe("not_empty")
    expect(lens.emptyAnswer).toBe(false)
  })

  it("the refused graph is still reported, not hidden behind the drawable roles", () => {
    const lens = lensOf(graphFixture.composed.valid_role_bindings_unread_graph)
    expect(lens.gaps.map(g => g.code)).toContain("IDENTITY_GRAPH_READ_FAILED")
    expect(`${lens.headline} ${lens.detail}`).toMatch(/withheld|unavailable|not (be )?read|failed/i)
  })
})

describe("selecting a node separates its OWN access from surrounding context", () => {
  const lens = lensOf(READY_WITH_GRAPH)
  const role = lens.nodes.find(n => n.arn === "arn:aws:iam::416651950952:role/web")!

  it("marks the selected node's outgoing and incoming edges, and nothing else", () => {
    const edges = identityLensTrafficEdges(lens, role.id)
    for (const edge of edges) {
      const expected =
        edge.source_id === role.id ? "outgoing" : edge.target_id === role.id ? "incoming" : "context"
      expect(edge.identity!.focusRelation).toBe(expected)
    }
    // The fixture must actually exercise both directions, or this proves nothing.
    const relations = edges.map(e => e.identity!.focusRelation)
    expect(relations).toContain("outgoing")
    expect(relations).toContain("incoming")
    expect(relations).toContain("context")
  })

  it("emphasis is presentation only — it never restates the producer's evidence", () => {
    const plain = identityLensTrafficEdges(lens)
    const focused = identityLensTrafficEdges(lens, role.id)
    expect(focused.length).toBe(plain.length)
    for (let i = 0; i < plain.length; i += 1) {
      const { focusRelation: _a, ...plainRest } = plain[i].identity!
      const { focusRelation: _b, ...focusedRest } = focused[i].identity!
      // Same family, plane, certainty, verdict, label, animation, generation.
      expect(focusedRest).toEqual(plainRest)
      expect(focused[i].evidence_type).toBe(plain[i].evidence_type)
      expect(focused[i].authority_state).toBe(plain[i].authority_state)
      expect(focused[i].path_basis).toBe(plain[i].path_basis)
      expect(focused[i].last_seen).toBe(plain[i].last_seen)
    }
  })

  it("with no selection nothing is emphasised", () => {
    for (const edge of identityLensTrafficEdges(lens, null)) {
      expect(edge.identity!.focusRelation).toBe("context")
    }
  })

  it("a configured edge stays configured whichever end is selected", () => {
    const trust = lens.edges.find(e => e.family === "ROLE_TRUST_POLICY")!
    for (const end of [trust.sourceId, trust.targetId]) {
      const edge = identityLensTrafficEdges(lens, end).find(
        e => e.source_id === trust.sourceId && e.target_id === trust.targetId,
      )!
      expect(edge.evidence_type).toBe("configured")
      expect(edge.identity!.plane).toBe("configured")
      // Selecting a role must never turn its trust policy into observed
      // evidence that someone assumed it.
      expect(edge.identity!.animated).toBe(false)
    }
  })

  it("the compact indicator hides hashes and names the producer limits without inventing RBAC", () => {
    const payload = { ...TOPOLOGY, identity_access: READY_WITH_GRAPH } as any
    const view = buildIdentityView(payload)
    const graph = identityGraphViewForPayload(payload, view)
    const indicator = buildIdentityIndicator(view, graph)
    expect(indicator.accountContext.state).toBe("in_organization")
    expect(indicator.familiesAvailable).toBeGreaterThan(0)
    expect(indicator.limits.map(l => l.key)).toEqual([
      "observed_role_assumption",
      "principal_data_access",
      "effective_permission",
      "kubernetes_rbac",
    ])
    expect(indicator.limits.find(l => l.key === "kubernetes_rbac")!.status).toBe("not_collected")
    expect(JSON.stringify(indicator)).not.toMatch(/v1:[0-9a-f]{16}/)
  })

  it("mirrors the fixture's closed node-kind set", () => {
    expect([...IDENTITY_GRAPH_NODE_KINDS].sort()).toEqual([...graphFixture.node_kinds].sort())
  })
})

/**
 * The published capability matrix may only cite a statement the producer
 * actually issues.
 *
 * CF01-F found six families naming `_READ_PRINCIPAL_GRANTS`, a statement no
 * code path has ever issued, and the tab renders `bounded read` from exactly
 * these rows — so the UI was telling a customer a relationship came from a
 * bounded read that does not exist. This is the consumer-side mirror of the
 * AST test F wrote: `statements_issued_for_ready` is resolved from the queries
 * a REAL read executed, so a row citing a phantom statement cannot pass.
 *
 * Deliberately not a blacklist of `_READ_PRINCIPAL_GRANTS`. Naming the one
 * known-bad value is the shape that has already failed three times in this
 * lane — it cannot catch the next statement to be retired.
 */
describe("the published matrix names only statements the producer issues", () => {
  const ISSUED: string[] = (fCandidate as any)._inputs.statements_issued_for_ready
  const GRAPH_PREFIX = "scripts.estate_identity_graph."

  it("the recorded issued set is real and non-trivial", () => {
    expect(ISSUED.length).toBeGreaterThan(2)
    for (const name of ISSUED) expect(name).not.toMatch(/^UNRESOLVED:/)
  })

  it("every graph-producer statement the matrix cites was actually issued", () => {
    const offenders: string[] = []
    for (const [name, block] of Object.entries(v1 as Record<string, any>)) {
      const rows = block?.relationship_capabilities
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const cited = row.bounded_read
        if (typeof cited !== "string" || !cited.startsWith(GRAPH_PREFIX)) continue
        if (!ISSUED.includes(cited)) offenders.push(`${name}/${row.family} -> ${cited}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("keeps the credential family distinct from the attribute families", () => {
    // F was careful here and a blanket substitution would flatten it: five
    // families build from _READ_PRINCIPALS attributes, and only
    // USER_AUTHENTICATES_WITH comes from the credentials read.
    const rows = (v1 as any).ready.relationship_capabilities as any[]
    const readOf = (family: string) => rows.find(r => r.family === family)?.bounded_read
    expect(readOf("USER_AUTHENTICATES_WITH")).toBe(`${GRAPH_PREFIX}_READ_USER_CREDENTIALS`)
    expect(readOf("ROLE_TRUST_POLICY")).toBe(`${GRAPH_PREFIX}_READ_PRINCIPALS`)
    expect(readOf("PRINCIPAL_HAS_MANAGED_POLICY")).toBe(`${GRAPH_PREFIX}_READ_PRINCIPALS`)
  })

  it("the retired statement is cited nowhere at all", () => {
    expect(JSON.stringify(v1)).not.toContain("_READ_PRINCIPAL_GRANTS")
  })
})

/**
 * Provenance must identify the bytes' ACTUAL producer, in a form another
 * machine can check.
 *
 * Three ways this record failed before, each fixed and each pinned here:
 * it named a commit the bytes did not come from (resolving the value at emit
 * time fixed HOW it was obtained without establishing that what it obtained
 * was right); it carried a filesystem path, which says where a working copy
 * happened to sit rather than what produced the output; and it never recorded
 * whether the source tree was clean, so a commit id could describe bytes it
 * had no relationship to. A provenance record that can be wrong without being
 * detectably wrong is worse than none.
 */
describe("the candidate fixture states where its bytes came from", () => {
  const backend = (fCandidate as any)._backend

  it("names a real commit, not a placeholder", () => {
    expect(backend.repo).toBe("saferemediate-backend")
    expect(backend.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(backend.subject.length).toBeGreaterThan(5)
  })

  it("records that the source tree was CLEAN when these bytes were emitted", () => {
    // Not merely present: a dirty tree means the commit id does not describe
    // the output, so committed bytes must carry dirty === false.
    expect(backend).toHaveProperty("dirty")
    expect(backend.dirty).toBe(false)
    expect(backend.uncommitted_paths).toEqual([])
  })

  it("carries nothing machine-local", () => {
    const serialised = JSON.stringify(backend)
    expect(serialised).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\\\/)
    expect(serialised).not.toContain("Platfrom")
  })

  it("does not assert a backend commit anywhere a human maintains by hand", () => {
    // The prose may discuss history; it may not make a provenance CLAIM about
    // these bytes, because hand-maintained prose is exactly what drifted.
    const prose: string = (fCandidate as any)._provenance
    // Normalised: the docstring wraps, and a line break must not decide
    // whether this guard fires.
    expect(prose.replace(/\s+/g, " ")).toContain(
      "Provenance lives in the emitted ``_backend`` key alone",
    )
    expect(prose.replace(/\s+/g, " ")).toContain(
      "The backend commit these bytes came from is NOT named here",
    )
  })
})

/**
 * CF01-F · a refusal the producer CANNOT NAME, produced rather than written.
 *
 * `INVENTORY_AUTHORITY_INVALID` was reported at 996366e9 and deliberately not
 * fabricated into a fixture to look covered. It is now reached through the
 * producer's OWN harness: the recipe malforms one receipt field
 * (`workload_binding_count`, the census of certified role bindings) to a
 * negative number, `_strict_nonnegative_int` refuses it with a message that is
 * not a refusal code, and the builder publishes this catch-all rather than
 * promoting an exception message into the payload's vocabulary.
 *
 * These assertions are about what makes it a GENUINE fixture rather than a
 * hand-written stand-in: the shape is the builder's, the detail names only an
 * exception type because the producer had no cause to name, and the totals are
 * null rather than zero.
 */
describe("CF01-F · the unnamed producer refusal", () => {
  const refusal = (fCandidate as any).producer_refusal?.inventory_authority_invalid

  it("exists as builder output, not as a composed block", () => {
    expect(refusal, "recipe emitted no producer_refusal block").toBeDefined()
    // `composed.*` is assembled by the recipe; this is not.
    expect((fCandidate as any).composed?.inventory_authority_invalid).toBeUndefined()
  })

  it("is an unavailable projection carrying exactly the unnamed refusal", () => {
    expect(refusal.status).toBe("unavailable")
    const codes = (refusal.gaps ?? []).map((g: any) => g.code)
    expect(codes).toContain("INVENTORY_AUTHORITY_INVALID")
  })

  it("names an exception TYPE and no cause — which is why it may not read as a finding", () => {
    const gap = (refusal.gaps ?? []).find(
      (g: any) => g.code === "INVENTORY_AUTHORITY_INVALID",
    )
    expect(gap).toBeDefined()
    // The producer's detail ends at the exception type. If a future backend
    // learns a real cause here, this fixture stops being the unnamed case and
    // the rendering rule below needs revisiting rather than silently applying.
    expect(gap.detail).toMatch(/could not be verified: \w+\.$/)
    expect(gap.detail).not.toMatch(/binding_count|negative integer/)
  })

  it("reports the absence of an answer, not an estate with no roles", () => {
    // `null` is the absence of a total; `0` would be a census claiming an
    // estate with no role bindings.
    expect(refusal.roles_total).toBeNull()
    expect(refusal.roles ?? []).toHaveLength(0)
  })

  it("was produced by the builder — it carries the authority receipt it refused on", () => {
    // A hand-written gap would not come with the generation's own receipt.
    expect(refusal.inventory_authority?.generation).toEqual(expect.any(Number))
    expect(refusal.inventory_authority?.projection_receipt_hash).toMatch(/^v1:[0-9a-f]{64}$/)
  })
})
