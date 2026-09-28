/**
 * Perimeter traffic: edges that START at the IGW or an endpoint must reach the
 * overlay, and an edge whose route verdict is VPCE must be drawn through the
 * endpoint it really used — never through a guessed one.
 */

import { describe, expect, it } from "vitest"

import {
  isPerimeterId,
  resolveStructuralVpceHop,
  selectEstateFlowEdges,
} from "@/components/topology-v0-2/estate-flow-edges"
import type { EdgeVpce, TrafficEdge } from "@/components/topology-v0-2/types"

const edge = (e: Partial<TrafficEdge> & Pick<TrafficEdge, "source_id" | "target_id">): TrafficEdge => e as TrafficEdge
const S3_GW: EdgeVpce = { id: "vpce-s3", service_name: "com.amazonaws.region-x.s3", endpoint_type: "Gateway" }
const DDB_GW: EdgeVpce = { id: "vpce-ddb", service_name: "com.amazonaws.region-x.dynamodb", endpoint_type: "Gateway" }
const types = new Map<string, string | null>([["bucket-1", "S3Bucket"], ["table-1", "DynamoDBTable"], ["fn-1", "LambdaFunction"]])

describe("perimeter ids", () => {
  it("admits the IGW anchor, real igw ids, sentinels, endpoints and NATs", () => {
    expect(isPerimeterId("__igw__")).toBe(true)
    expect(isPerimeterId("igw-0abc")).toBe(true)
    expect(isPerimeterId("__aws_s3__")).toBe(true)
    expect(isPerimeterId("vpce-s3", new Set(["vpce-s3"]))).toBe(true)
    expect(isPerimeterId("nat-1", undefined, new Set(["nat-1"]))).toBe(true)
    expect(isPerimeterId("i-0workload")).toBe(false)
    expect(isPerimeterId(null)).toBe(false)
  })

  it("keeps inbound IGW -> workload edges the old source test dropped", () => {
    const out = selectEstateFlowEdges({
      mode: "all_access",
      topologyTrafficEdges: [edge({ source_id: "__igw__", target_id: "alb-1" }), edge({ source_id: "vpce-s3", target_id: "fn-1" })],
      visible: new Set(["alb-1", "fn-1", "vpce-s3"]),
      index: new Map(),
      nodeTypeById: types,
    })
    expect(out.map(e => `${e.source_id}->${e.target_id}`)).toEqual(["__igw__->alb-1", "vpce-s3->fn-1"])
  })
})

describe("which endpoint the traffic really used", () => {
  it("routes a VPCE-verdict S3 edge through the one S3 gateway endpoint", () => {
    const e = resolveStructuralVpceHop(edge({ source_id: "w1", target_id: "bucket-1", structural_route: "VPCE" }), [S3_GW, DDB_GW], types)
    expect(e.via_vpce_id).toBe("vpce-s3")
  })

  it("routes DynamoDB and the S3 sentinel by service", () => {
    expect(resolveStructuralVpceHop(edge({ source_id: "w1", target_id: "table-1", structural_route: "VPCE" }), [S3_GW, DDB_GW], types).via_vpce_id).toBe("vpce-ddb")
    expect(resolveStructuralVpceHop(edge({ source_id: "w1", target_id: "__aws_s3__", structural_route: "VPCE" }), [S3_GW], types).via_vpce_id).toBe("vpce-s3")
  })

  it("never guesses: no verdict, a NAT verdict, or two candidate endpoints leave the edge alone", () => {
    expect(resolveStructuralVpceHop(edge({ source_id: "w1", target_id: "bucket-1" }), [S3_GW], types).via_vpce_id).toBeUndefined()
    expect(resolveStructuralVpceHop(edge({ source_id: "w1", target_id: "bucket-1", structural_route: "NAT" }), [S3_GW], types).via_vpce_id).toBeUndefined()
    const second: EdgeVpce = { ...S3_GW, id: "vpce-s3-b" }
    expect(resolveStructuralVpceHop(edge({ source_id: "w1", target_id: "bucket-1", structural_route: "VPCE" }), [S3_GW, second], types).via_vpce_id).toBeUndefined()
  })

  it("keeps the payload's own endpoint when it named one", () => {
    const e = resolveStructuralVpceHop(edge({ source_id: "w1", target_id: "bucket-1", structural_route: "VPCE", via_vpce_id: "vpce-named" }), [S3_GW], types)
    expect(e.via_vpce_id).toBe("vpce-named")
  })
})
