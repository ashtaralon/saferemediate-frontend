/**
 * CF01 · D1 — shared Network-view fixture and layout stub.
 *
 * Two payload sources, deliberately kept apart:
 *
 *   backendV11()  The literal backend fixture
 *                 tests/fixtures/topology_risk/estate-map-v11-contract.json at
 *                 saferemediate-backend 41f5dda3 (copied verbatim to
 *                 ./topology-risk-v11-41f5.json). Thin (two RDS nodes, one IGW,
 *                 two observed egress edges) but exactly the producer's shape.
 *
 *   estatePayload()  A hand-built TopologyRiskResponse in the same shape the
 *                 repository's own Network-view tests already use
 *                 (__tests__/topology-estate-command-map.test.tsx), with the
 *                 subnet/AZ/tier scaffold and IAM rollup the shared canvas
 *                 needs to place chips. It is NOT producer output and is never
 *                 used to prove a producer contract — only to exercise the
 *                 canvas and to pin the Network view's DOM.
 *
 * `installLayoutStub()` gives every element a deterministic non-zero rect so
 * FlowOverlay (which anchors edges with getBoundingClientRect) draws paths in
 * happy-dom. Rects derive from document order alone, so the same DOM always
 * yields the same geometry.
 */

import type {
  NodeScore,
  TopologyNode,
  TopologyRiskResponse,
} from "@/components/topology-v0-2/types"

import v11 from "./topology-risk-v11-41f5.json"

export function backendV11(): TopologyRiskResponse {
  // A fresh object per call so a test cannot leak a mutation into the next.
  return JSON.parse(JSON.stringify(v11)) as TopologyRiskResponse
}

function score(value: number, tier: NodeScore["tier"], exposed = false): NodeScore {
  return {
    value,
    tier,
    rank: 1,
    confidence: { value: 100, tier: "FULL", reasons: [] },
    contributors: [
      {
        signal: "network_exposure",
        weight: 0.3,
        value: exposed ? 1 : 0,
        evidence: {},
        freshness: { source: "flow_logs", as_of: "2026-09-15T00:00:00Z", is_fresh: true },
      },
    ],
  }
}

export function node(
  input: Partial<TopologyNode> & Pick<TopologyNode, "id" | "name" | "type">,
): TopologyNode {
  return {
    subnet_id: null,
    score: score(20, "QUIET"),
    stale: null,
    is_jewel: false,
    account_id: "416651950952",
    region: "eu-west-1",
    vpc_id: "vpc-1",
    ...input,
  }
}

/** The workload ids the identity fixtures bind to: `i-web`, `i-api`. */
export function estatePayload(): TopologyRiskResponse {
  return {
    system: "testbed-webshop",
    scored_at: "2026-09-15T07:00:00Z",
    scoring_window_days: 90,
    vpc_id: "vpc-1",
    selected_vpc_id: "vpc-1",
    account_id: "416651950952",
    selected_account_id: "416651950952",
    region: "eu-west-1",
    selected_region_id: "eu-west-1",
    system_kpis: {
      workloads_total: 5,
      workloads_by_type: { LoadBalancer: 1, EC2: 2, RDS: 1, S3: 1 },
      flagged_count: 1,
      stale_workloads_count: 0,
      posture_coverage: { scored: 5, total: 5, by_type: {} },
      posture_freshness: {
        most_recent_run: "2026-09-15T07:00:00Z",
        age_days: 0,
        threshold_days: 2,
        is_fresh: true,
        auto_resolves_when: "the next posture run completes",
      },
    },
    nodes: [
      node({ id: "alb", name: "webshop-alb", type: "LoadBalancer", subnet_id: "subnet-web-a", score: score(70, "HIGH", true) }),
      node({ id: "i-web", name: "webshop-web", type: "EC2", subnet_id: "subnet-app-a" }),
      node({ id: "i-api", name: "webshop-api", type: "EC2", subnet_id: "subnet-app-b" }),
      node({ id: "db-writer", name: "webshop-writer", type: "RDS", subnet_id: "subnet-data-a", is_jewel: true, score: score(55, "ELEVATED") }),
      node({ id: "bucket-assets", name: "cyntro-testbed-webshop-assets", type: "S3" }),
    ],
    vpc_topology: {
      region: "eu-west-1",
      account_id: "416651950952",
      vpc_id: "vpc-1",
      azs: ["eu-west-1a", "eu-west-1b"],
      subnets: [
        { id: "subnet-web-a", name: "web-a", az: "eu-west-1a", cidr: "10.0.1.0/24", tier: "web", tier_source: "property", vpc_id: "vpc-1" },
        { id: "subnet-app-a", name: "app-a", az: "eu-west-1a", cidr: "10.0.2.0/24", tier: "app", tier_source: "property", vpc_id: "vpc-1" },
        { id: "subnet-app-b", name: "app-b", az: "eu-west-1b", cidr: "10.0.3.0/24", tier: "app", tier_source: "property", vpc_id: "vpc-1" },
        { id: "subnet-data-a", name: "data-a", az: "eu-west-1a", cidr: "10.0.4.0/24", tier: "data", tier_source: "property", vpc_id: "vpc-1" },
      ],
      edges: { igws: [{ id: "igw-1", name: "webshop-igw" }], nat_gws: [], vpces: [] },
      unknown_subnet_count: 0,
      iam_roles: [
        {
          name: "cyntro-testbed-webshop-web",
          role_arn: "arn:aws:iam::416651950952:role/cyntro-testbed-webshop-web",
          allowed_actions: 12,
          used_actions: 3,
          unused_actions: 9,
          gap_percentage: 75,
          correlation_state: "correlated",
          last_remediated_at: null,
          workload_ids: ["i-web"],
          attachment_modes: ["instance_profile"],
        },
      ],
    },
    traffic_edges: [
      { source_id: "alb", target_id: "i-web", port: 443, protocol: "tcp", last_seen: "2026-09-15T06:00:00Z", evidence_type: "observed", authority_state: "authoritative", path_basis: "observed_segment", edge_class: "internal" },
      { source_id: "i-web", target_id: "db-writer", port: 5432, protocol: "tcp", last_seen: "2026-09-15T06:00:00Z", evidence_type: "observed", authority_state: "authoritative", path_basis: "observed_segment", edge_class: "database" },
      { source_id: "i-api", target_id: "bucket-assets", port: 443, protocol: "ACTUAL_S3_ACCESS", last_seen: "2026-09-15T06:00:00Z", evidence_type: "observed", authority_state: "authoritative", path_basis: "observed_segment", edge_class: "edge_service" },
    ],
    traffic_authority: {
      state: "authoritative",
      active_generation: 164,
      limitation: null,
    } as TopologyRiskResponse["traffic_authority"],
  } as TopologyRiskResponse
}

/**
 * Deterministic layout for happy-dom.
 *
 * Every element gets a rect derived from its position in document order at the
 * moment it is first measured; the container of the map is 1400x900 at the
 * origin. Returns the restore function.
 */
export function installLayoutStub(): () => void {
  const proto = HTMLElement.prototype as unknown as { getBoundingClientRect: () => DOMRect }
  const original = proto.getBoundingClientRect
  const svgProto = SVGElement.prototype as unknown as { getBoundingClientRect: () => DOMRect }
  const originalSvg = svgProto.getBoundingClientRect
  const rect = function (this: Element): DOMRect {
    const all = Array.from(document.querySelectorAll("*"))
    const index = Math.max(0, all.indexOf(this))
    // Anything that CONTAINS a VPC frame is a canvas-level box (the flow
    // container, its wrappers, the body): full canvas. Everything inside is
    // an anchor-sized box spread across that canvas.
    if (this.querySelector('[data-testid="topology-vpc-frame"]')) {
      return new DOMRect(0, 0, 1400, 900)
    }
    // Spread anchors across the canvas so no two share a point.
    const col = index % 7
    const row = Math.floor(index / 7) % 9
    return new DOMRect(40 + col * 190, 40 + row * 92, 120, 40)
  }
  proto.getBoundingClientRect = rect as unknown as () => DOMRect
  svgProto.getBoundingClientRect = rect as unknown as () => DOMRect
  return () => {
    proto.getBoundingClientRect = original
    svgProto.getBoundingClientRect = originalSvg
  }
}

/**
 * Strip the one thing that legitimately varies between identical renders:
 * nothing today. Kept as the single normalisation point so a future volatile
 * attribute is scrubbed here rather than by loosening the snapshot.
 */
export function normalizeHtml(html: string): string {
  return html
}
