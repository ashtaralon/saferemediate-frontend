import { describe, it, expect } from "vitest"
import { classify, type RouteOut } from "@/components/dependency-map/network-lp-cards"

// classify() drives BOTH the rendered cards and the "N candidates" headline
// count (findings = routes with a non-null kind). It must be candidate-grade:
// a KEEP route is never a candidate — the regression was `|| r.shared_route_table`
// promoting every KEEP/local/VPCE route on a shared RT to a SHARED_RT card,
// inflating "21 candidates" when only 3 were actionable.
function mk(p: Partial<RouteOut>): RouteOut {
  return {
    route_id: "r", destination_cidr: null, target_kind: null, path_type: "LOCAL",
    risk_category: "info", used: false, matched_flow_count: 0, last_used: null,
    recommendation: "KEEP", suggested_cidr: null, blast_radius_reduction: "",
    confidence: "LOW", safety_reasons: [], rationale: "", observed_aws_services: [],
    observed_external_flows: 0, via_route_table: null, shared_route_table: false,
    route_state: "active", route_origin: null, ...p,
  }
}

describe("network-lp classify() — candidate-grade only", () => {
  it("KEEP is never a candidate, even on a shared route table", () => {
    expect(classify(mk({ recommendation: "KEEP", shared_route_table: true, path_type: "LOCAL" }))).toBeNull()
    // VPCE keep (path_type AWS_SERVICE) on a shared RT — still not a candidate.
    expect(classify(mk({ recommendation: "KEEP", shared_route_table: true, path_type: "AWS_SERVICE" }))).toBeNull()
    expect(classify(mk({ recommendation: "KEEP", shared_route_table: false }))).toBeNull()
  })

  it("an unused route on a shared RT is a SHARED_RT candidate", () => {
    expect(classify(mk({ recommendation: "SPLIT_ROUTE_TABLE_FIRST", shared_route_table: true }))).toBe("SHARED_RT")
    expect(classify(mk({ recommendation: "REMOVE_ROUTE_CANDIDATE", shared_route_table: true, path_type: "PUBLIC_INTERNET" }))).toBe("SHARED_RT")
  })

  it("a blackhole route is a candidate regardless of shared/keep", () => {
    expect(classify(mk({ route_state: "blackhole", recommendation: "REMOVE_ROUTE_CANDIDATE" }))).toBe("BLACKHOLE")
  })

  it("an actionable non-shared route maps to its path-type card", () => {
    expect(classify(mk({ recommendation: "REMOVE_ROUTE_CANDIDATE", shared_route_table: false, path_type: "PUBLIC_INTERNET" }))).toBe("INTERNET")
    expect(classify(mk({ recommendation: "NARROW_ROUTE_CIDR", shared_route_table: false, path_type: "CROSS_VPC" }))).toBe("CROSS_NETWORK")
    expect(classify(mk({ recommendation: "REPLACE_NAT_WITH_VPCE", shared_route_table: false, path_type: "OUTBOUND_INTERNET" }))).toBe("AWS_SERVICE")
  })
})
