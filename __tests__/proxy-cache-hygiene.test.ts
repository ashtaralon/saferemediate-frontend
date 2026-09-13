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

describe("a PENDING envelope is never cached as a completed graph", () => {
  /**
   * `waiting` was added as a distinct envelope precisely because `computing`
   * overstated what was known: ComputingEnvelope carries computing_started_at
   * and compute_deadline_at -- a start and a deadline for work that may never
   * have begun -- while WaitingEnvelope carries only refresh_requested_at,
   * which is all a serving process can observe after an enqueue.
   *
   * Having drawn that distinction in the types, the hygiene rule never learned
   * it: isWaitingEnvelope existed and nothing called it. A valid `waiting`
   * answer was therefore cached as ordinary successful map data and re-served
   * as a completed graph for the whole TTL.
   */
  it("flags the waiting envelope", () => {
    expect(
      isPoisonousProxyPayload({
        status: "waiting",
        system_name: "testbed-webshop",
        refresh_requested_at: "2026-09-13T09:00:00Z",
        refresh_state: "queued",
        staleReason: "refresh_queued",
      }),
    ).toBe(true)
  })

  it("flags an EMPTY topology payload that claims a refresh is pending", () => {
    for (const staleReason of ["refresh_queued", "snapshot_recomputing", "peer_computing"]) {
      expect(
        isPoisonousProxyPayload({
          system: "testbed-webshop",
          system_kpis: null,
          nodes: [],
          staleReason,
        }),
        `staleReason=${staleReason}`,
      ).toBe(true)
    }
  })

  it("flags an empty IAP payload that claims a refresh is pending", () => {
    expect(
      isPoisonousProxyPayload({
        paths: [],
        crown_jewels: [],
        staleReason: "refresh_queued",
      }),
    ).toBe(true)
  })
})

describe("last-good data is still cacheable — the fix must not over-rotate", () => {
  /**
   * This is what C1 actually serves today: a real snapshot with 35 nodes,
   * correctly labelled `refresh_queued` because a refresh was enqueued and the
   * worker has not confirmed. That is last-good data, honestly marked, and
   * caching it is the entire point of having a cache. Only an EMPTY payload
   * claiming to be pending is poison.
   */
  it("keeps a stale-but-populated snapshot", () => {
    expect(
      isPoisonousProxyPayload({
        system: "testbed-webshop",
        scored_at: "2026-09-12T00:27:27Z",
        system_kpis: { workloads: 7 },
        nodes: [{ id: "i-abc" }, { id: "i-def" }],
        fromStaleCache: true,
        staleReason: "refresh_queued",
      }),
    ).toBe(false)
  })

  it("keeps an AUTHORITATIVE empty estate that makes no pending claim", () => {
    // Zero resources reported is a finding, not a pending state.
    expect(
      isPoisonousProxyPayload({
        system: "testbed-webshop",
        scored_at: "2026-09-13T09:00:00Z",
        system_kpis: { workloads: 0 },
        nodes: [],
      }),
    ).toBe(false)
  })
})
