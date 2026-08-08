import { afterEach, describe, expect, it, vi } from "vitest"

import {
  bucketToResource,
  fetchFleetPosture,
  groupPostureBuckets,
  parseFleetPosture,
  postureDetail,
  type S3PostureBucket,
} from "@/components/fixes/s3-posture"

function bucket(overrides: Partial<S3PostureBucket> = {}): S3PostureBucket {
  return {
    bucket_id: "bucket-data",
    bucket_name: "data",
    region: "eu-west-1",
    account_id: "111122223333",
    posture: "PUBLIC_EXPOSURE",
    actionable: true,
    consumers: { observed: 5, in_vpc: 5, out_of_vpc: 0, private: 3, public: 2, unknown: 0 },
    public_route_kinds: ["NAT"],
    vpce_ids_in_use: [],
    vpc_ids: ["vpc-1"],
    last_activity: "2026-08-01T00:00:00Z",
    public_consumers: [],
    unknown_consumers: [],
    out_of_vpc_consumers: [],
    detail_truncated: false,
    transport_operation: null,
    enforcement_operation: null,
    ...overrides,
  }
}

describe("parseFleetPosture", () => {
  const valid = {
    system_name: "prod",
    generated_at: "2026-08-08T00:00:00Z",
    structural_refresh: "completed",
    ledger: "ok",
    summary: { total_buckets: 1, actionable: 1, by_posture: { PUBLIC_EXPOSURE: 1 } },
    buckets: [bucket()],
  }

  it("accepts a well-formed payload", () => {
    const parsed = parseFleetPosture(valid)
    expect(parsed?.summary.total_buckets).toBe(1)
    expect(parsed?.buckets).toHaveLength(1)
  })

  it("rejects garbage without throwing (fail-soft to the inventory grid)", () => {
    expect(parseFleetPosture(null)).toBeNull()
    expect(parseFleetPosture("<html>error</html>")).toBeNull()
    expect(parseFleetPosture({})).toBeNull()
    expect(parseFleetPosture({ summary: { total_buckets: 1 } })).toBeNull()
    expect(parseFleetPosture({ summary: {}, buckets: [] })).toBeNull()
  })

  it("filters malformed bucket rows instead of rendering half-objects", () => {
    const parsed = parseFleetPosture({
      ...valid,
      buckets: [bucket(), { nonsense: true }, null],
    })
    expect(parsed?.buckets).toHaveLength(1)
  })
})

describe("groupPostureBuckets", () => {
  it("routes every posture to its section and keeps server order", () => {
    const groups = groupPostureBuckets([
      bucket({ bucket_id: "a", posture: "PUBLIC_EXPOSURE" }),
      bucket({ bucket_id: "b", posture: "EVIDENCE_GAP" }),
      bucket({ bucket_id: "c", posture: "PRIVATE_UNENFORCED" }),
      bucket({ bucket_id: "d", posture: "PRIVATE_ENFORCED" }),
      bucket({ bucket_id: "e", posture: "NO_VPC_CONSUMERS" }),
      bucket({ bucket_id: "f", posture: "PUBLIC_EXPOSURE" }),
    ])
    expect(groups.publicExposure.map((b) => b.bucket_id)).toEqual(["a", "f"])
    expect(groups.evidenceGap.map((b) => b.bucket_id)).toEqual(["b"])
    expect(groups.readyToEnforce.map((b) => b.bucket_id)).toEqual(["c"])
    expect(groups.noAction.map((b) => b.bucket_id)).toEqual(["d", "e"])
  })
})

describe("postureDetail", () => {
  it("names the public path and its route kinds", () => {
    expect(postureDetail(bucket({ public_route_kinds: ["IGW", "NAT"] })))
      .toBe("2 of 5 in-VPC consumers on the public path via IGW + NAT")
  })

  it("describes evidence gaps and idle buckets honestly", () => {
    expect(postureDetail(bucket({
      posture: "EVIDENCE_GAP",
      consumers: { observed: 4, in_vpc: 4, out_of_vpc: 0, private: 1, public: 0, unknown: 3 },
    }))).toBe("3 consumers without complete transport proof")
    expect(postureDetail(bucket({
      posture: "NO_VPC_CONSUMERS",
      consumers: { observed: 1, in_vpc: 0, out_of_vpc: 1, private: 0, public: 0, unknown: 0 },
    }))).toBe("No in-VPC consumers (1 out-of-VPC caller)")
    expect(postureDetail(bucket({
      posture: "NO_VPC_CONSUMERS",
      consumers: { observed: 0, in_vpc: 0, out_of_vpc: 0, private: 0, public: 0, unknown: 0 },
    }))).toBe("No observed consumers in the window")
  })
})

describe("bucketToResource", () => {
  it("maps posture rows to the wizard's resource shape", () => {
    expect(bucketToResource(bucket())).toEqual({
      id: "bucket-data",
      name: "data",
      type: "S3",
      region: "eu-west-1",
    })
  })
})

describe("fetchFleetPosture", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns the parsed payload on success and passes the refresh flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        system_name: "prod",
        generated_at: null,
        structural_refresh: "skipped",
        ledger: "ok",
        summary: { total_buckets: 0, actionable: 0, by_posture: {} },
        buckets: [],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = await fetchFleetPosture("prod", { refreshStructural: false })
    expect(result?.summary.total_buckets).toBe(0)
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/proxy/operational-map/prod/s3-posture?refresh_structural=false",
    )
  })

  it("fails soft on HTTP errors and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ detail: "backend down" }),
    }))
    expect(await fetchFleetPosture("prod")).toBeNull()

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(await fetchFleetPosture("prod")).toBeNull()
  })

  it("fails soft on a payload that is not fleet posture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    }))
    expect(await fetchFleetPosture("prod")).toBeNull()
  })
})
