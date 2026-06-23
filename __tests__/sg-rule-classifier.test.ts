/// <reference types="vitest/globals" />
import {
  classifyRule,
  classifySourceMode,
  isSensitiveExposure,
} from "../lib/sg-rule-classifier"

function rule(
  overrides: Partial<{
    is_public: boolean
    port_range: string
    source: string
    connections: number
    unique_source_count: number
    sample_sources: string[]
    confidence: number
  }> = {},
) {
  return {
    direction: "inbound",
    protocol: "TCP",
    port_range: overrides.port_range ?? "22",
    source: overrides.source ?? "0.0.0.0/0",
    destination: "sg-test",
    is_public: overrides.is_public ?? true,
    traffic: {
      connection_count: overrides.connections ?? 0,
      unique_source_count: overrides.unique_source_count,
      sample_sources: overrides.sample_sources,
    },
    recommendation: { confidence: overrides.confidence ?? 85 },
  }
}

describe("sg-rule-classifier", () => {
  it("public SSH with scanner traffic → investigate_first", () => {
    const r = rule({
      port_range: "22",
      connections: 10526,
      unique_source_count: 1205,
      sample_sources: ["119.154.158.243", "185.113.9.199"],
    })
    expect(isSensitiveExposure(r)).toBe(true)
    expect(classifySourceMode(r.traffic.sample_sources!, 1205)).toBe(
      "external_scanner",
    )
    expect(classifyRule(r, 30)).toBe("investigate_first")
  })

  it("public sensitive port with internal-only traffic → protected", () => {
    const r = rule({
      port_range: "5432",
      connections: 50,
      unique_source_count: 1,
      sample_sources: ["10.0.1.41"],
    })
    expect(classifyRule(r, 30)).toBe("protected")
  })

  it("public sensitive port with no traffic → investigate_first", () => {
    const r = rule({ port_range: "3306", connections: 0 })
    expect(classifyRule(r, 30)).toBe("investigate_first")
  })

  it("internal CIDR sensitive port with traffic → protected (not public exposure)", () => {
    const r = rule({
      is_public: false,
      port_range: "22",
      source: "10.0.0.0/8",
      connections: 100,
      unique_source_count: 3,
      sample_sources: ["10.0.1.41"],
    })
    expect(isSensitiveExposure(r)).toBe(false)
    expect(classifyRule(r, 30)).toBe("verify_first")
  })

  it("public HTTPS with scanner traffic → investigate_first", () => {
    const r = rule({
      port_range: "443",
      connections: 1619,
      unique_source_count: 721,
      sample_sources: ["185.55.243.251", "144.202.82.88"],
    })
    expect(classifyRule(r, 30)).toBe("investigate_first")
  })
})
