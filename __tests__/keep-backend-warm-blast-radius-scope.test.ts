/// <reference types="vitest/globals" />
/**
 * The keep-warm cron sweeps the same blast-radius endpoint operators hit.
 * The backend refuses to infer scope — the sweep must forward the exact
 * (customer_id, account_id, region) triple, and skip cleanly when the
 * /api/systems envelope does not supply enough information to name a
 * concrete scope. Anything else warms an unrelated cache key or 503s and
 * leaves the operator's real key cold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://backend.example",
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/**
 * Real /api/systems envelope shape observed in production: authoritative
 * customer scope lives at body.scope.customer_id (the request scope the
 * backend resolved), each system row carries its own account_id + region.
 * Any test that puts customer_id INSIDE the system row is asserting
 * against a shape the backend does not emit.
 */
const SYSTEMS_ENVELOPE = {
  scope: {
    customer_id: "testbed-webshop",
  },
  systems: [
    { name: "payments", account_id: "111111111111", region: "eu-west-1" },
    { name: "checkout", account_id: "222222222222", region: "us-east-1" },
    // Missing region — must be skipped for blast-radius, not called success.
    { name: "orphaned", account_id: "333333333333" },
  ],
}

async function runSweep() {
  const mod = await import("@/app/api/cron/keep-backend-warm/route")
  return mod.GET()
}

describe("keep-backend-warm blast-radius scope forwarding", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith("/api/systems")) return jsonResponse(SYSTEMS_ENVELOPE)
      // Any subsequent sweep call — return a lightweight payload.
      return jsonResponse({ from_snapshot: true })
    })
    vi.stubGlobal("fetch", fetchMock)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("emits fully scoped blast-radius URLs derived from body.scope.customer_id + per-system account/region", async () => {
    const response = await runSweep()
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      sweep: Array<{
        system: string
        kind: string
        status: number | string
      }>
    }

    const blastUrls = fetchMock.mock.calls
      .map((call) => String(call[0] ?? ""))
      .filter((url) => url.includes("/blast-radius"))

    // Two systems are scoped end-to-end; one (orphaned) is skipped.
    expect(blastUrls).toEqual(
      expect.arrayContaining([
        "https://backend.example/api/business-system/payments/blast-radius" +
          "?customer_id=testbed-webshop&account_id=111111111111&region=eu-west-1",
        "https://backend.example/api/business-system/checkout/blast-radius" +
          "?customer_id=testbed-webshop&account_id=222222222222&region=us-east-1",
      ]),
    )
    expect(
      blastUrls.some((url) => url.includes("orphaned")),
    ).toBe(false)

    const blastResults = body.sweep.filter((r) => r.kind === "blast_radius")
    // Two successes, one skipped — not a silent absence, not a fake success.
    const skipped = blastResults.find((r) => r.system === "orphaned")
    expect(skipped?.status).toBe("skipped_missing_scope")
    const succeeded = blastResults.filter((r) => r.status === 200)
    expect(succeeded.map((r) => r.system).sort()).toEqual(["checkout", "payments"])
  })

  it("skips every blast-radius warm when body.scope.customer_id is missing (no cross-tenant assumption)", async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith("/api/systems")) {
        return jsonResponse({
          // Notably no top-level scope: an admin/unscoped list. The cron
          // must NOT invent a customer_id from thin air.
          systems: [
            { name: "payments", account_id: "111111111111", region: "eu-west-1" },
          ],
        })
      }
      return jsonResponse({ from_snapshot: true })
    })

    const response = await runSweep()
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      sweep: Array<{ system: string; kind: string; status: number | string }>
    }

    const blastUrls = fetchMock.mock.calls
      .map((call) => String(call[0] ?? ""))
      .filter((url) => url.includes("/blast-radius"))
    expect(blastUrls).toEqual([])

    const blastResults = body.sweep.filter((r) => r.kind === "blast_radius")
    expect(blastResults.every((r) => r.status === "skipped_missing_scope")).toBe(true)
  })
})
