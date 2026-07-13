import { isPoisonousProxyPayload } from "@/lib/server/proxy-cache-hygiene"

describe("isPoisonousProxyPayload", () => {
  it("flags Wave D computing envelopes", () => {
    expect(
      isPoisonousProxyPayload({
        status: "computing",
        system_name: "alon-prod",
        computing_started_at: "2026-07-13T00:00:00Z",
        compute_deadline_at: "2026-07-13T00:03:00Z",
        staleReason: "peer_computing",
        crown_jewels: [],
        paths: [],
      }),
    ).toBe(true)
  })

  it("flags empty topology computing payloads", () => {
    expect(
      isPoisonousProxyPayload({
        system_kpis: null,
        nodes: [],
        staleReason: "peer_computing",
      }),
    ).toBe(true)
  })

  it("allows real topology payloads", () => {
    expect(
      isPoisonousProxyPayload({
        system_kpis: { total_nodes: 48 },
        nodes: [{ id: "n1" }],
      }),
    ).toBe(false)
  })

  it("allows real IAP payloads", () => {
    expect(
      isPoisonousProxyPayload({
        crown_jewels: [{ id: "j1" }],
        paths: [{ id: "p1" }],
        total_jewels: 1,
        total_paths: 1,
      }),
    ).toBe(false)
  })
})
