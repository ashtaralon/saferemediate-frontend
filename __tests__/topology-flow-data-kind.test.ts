/**
 * Data-kind classification for the Network view's lines (colour + pattern +
 * packet shape). Reads only the edge's own class/protocol/port and the payload
 * TYPES of its endpoints — never a guess about an untyped endpoint.
 */

import { describe, expect, it } from "vitest"

import { FLOW_DATA_KIND_ORDER, FLOW_DATA_KIND_STYLE, flowDataKind } from "@/components/topology-v0-2/flow-visuals"

describe("flowDataKind", () => {
  it("classifies by the target's payload type first", () => {
    expect(flowDataKind({ cls: "edge_service", targetType: "S3Bucket" })).toBe("object")
    expect(flowDataKind({ cls: "vpce", targetType: "S3Bucket" })).toBe("object")
    expect(flowDataKind({ cls: "edge_service", targetType: "KMSKey" })).toBe("secrets")
    expect(flowDataKind({ cls: "edge_service", targetType: "SecretsManagerSecret" })).toBe("secrets")
    expect(flowDataKind({ cls: "edge_service", targetType: "DynamoDBTable" })).toBe("database")
    expect(flowDataKind({ cls: "internal", targetType: "RDSCluster" })).toBe("database")
    expect(flowDataKind({ cls: "internal", targetType: "NeptuneCluster" })).toBe("database")
  })

  it("draws triggers as events whichever end the rule is on", () => {
    expect(flowDataKind({ cls: "edge_service", sourceType: "EventBridgeRule", targetType: "LambdaFunction" })).toBe("event")
    expect(flowDataKind({ cls: "internal", targetType: "SQSQueue" })).toBe("event")
  })

  it("uses sentinels and the edge class when the endpoint has no type", () => {
    expect(flowDataKind({ cls: "edge_service", targetId: "__aws_s3__" })).toBe("object")
    expect(flowDataKind({ cls: "edge_service", targetId: "__aws_api__" })).toBe("aws_api")
    expect(flowDataKind({ cls: "egress", targetId: "__igw__" })).toBe("egress")
    expect(flowDataKind({ cls: "internal", targetId: "extdst:3.5.64.0" })).toBe("egress")
    expect(flowDataKind({ cls: "database" })).toBe("database")
    expect(flowDataKind({ cls: "internal", port: 5432 })).toBe("database")
    expect(flowDataKind({ cls: "internal", port: 443 })).toBe("request")
    expect(flowDataKind({ cls: "internal" })).toBe("request")
  })

  it("gives every kind a distinct colour and a distinct shape", () => {
    const colors = FLOW_DATA_KIND_ORDER.map(k => FLOW_DATA_KIND_STYLE[k].color)
    const glyphs = FLOW_DATA_KIND_ORDER.map(k => FLOW_DATA_KIND_STYLE[k].glyph)
    const lines = FLOW_DATA_KIND_ORDER.map(k => `${FLOW_DATA_KIND_STYLE[k].dash ?? "solid"}|${FLOW_DATA_KIND_STYLE[k].core ? "core" : ""}`)
    expect(new Set(colors).size).toBe(colors.length)
    expect(new Set(glyphs).size).toBe(glyphs.length)
    expect(new Set(lines).size).toBe(lines.length)
    // Exposure red stays reserved for attack paths.
    expect(colors).not.toContain("#DC2626")
  })
})
