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

/**
 * Caller-auth surfacing.
 *
 * The cron pings /api/systems to wake the worker and to learn which systems to
 * sweep. A REJECTED caller answers fast: `res.json()` parses the 401 envelope
 * without throwing, `body?.systems` is undefined, the sweep runs over zero
 * targets and logs nothing alarming, and the route returns ok:true with
 * backend_status:401. Read from the outside that is a green cron — so the real
 * symptom shows up on the operator's side as a recurring ~100s cold start, and
 * the auth failure is never named. These controls pin the honest behaviour:
 * a non-2xx ping is a failure, 401/403 are named as AUTH, and nothing about it
 * is allowed to read as a successful sweep that simply found no systems.
 */
describe("keep-backend-warm caller-auth / non-2xx ping surfacing", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let captured: Array<{ level: string; line: string }> = []

  type CronBody = {
    ok?: boolean
    error?: string
    failure_kind?: string
    backend_status?: number
    cold?: boolean
    sweep?: Array<{ system: string; kind: string; status: number | string }>
  }

  /** Every line this route wrote, across all three console levels. */
  function allLogLines(): string[] {
    return captured.map((entry) => entry.line)
  }

  function loggedAtLevel(level: string): boolean {
    return captured.some((entry) => entry.level === level)
  }

  /** Prewarm fetches only — the ping itself is not a sweep call. */
  function prewarmUrls(): string[] {
    return fetchMock.mock.calls
      .map((call) => String(call[0] ?? ""))
      .filter((url) => !url.endsWith("/api/systems"))
  }

  /** Answer the ping with `status`, then any sweep call with a warm payload. */
  function stubPing(status: number, pingBody: unknown) {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith("/api/systems")) return jsonResponse(pingBody, status)
      return jsonResponse({ from_snapshot: true })
    })
  }

  beforeEach(() => {
    // The route resolves its base URL through getBackendBaseUrl() (mocked
    // above), which itself resolves BACKEND_URL_OVERRIDE internally. Neutralise
    // any ambient override so the origin assertions are deterministic.
    vi.stubEnv("BACKEND_URL_OVERRIDE", "")
    fetchMock = vi.fn()
    stubPing(200, SYSTEMS_ENVELOPE)
    vi.stubGlobal("fetch", fetchMock)
    captured = []
    const record = (level: string) => (...args: unknown[]) => {
      captured.push({ level, line: args.map((a) => String(a)).join(" ") })
    }
    vi.spyOn(console, "error").mockImplementation(record("error"))
    vi.spyOn(console, "warn").mockImplementation(record("warn"))
    vi.spyOn(console, "log").mockImplementation(record("log"))
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("CONTROL 1 (auth 401): a fast 401 ping reports ok:false with backend_status 401, named as auth", async () => {
    // A real rejection envelope: valid JSON, parses cleanly, carries no
    // `systems` key. This is exactly what used to read as an empty sweep.
    stubPing(401, { detail: "Not authenticated" })

    const body = (await (await runSweep()).json()) as CronBody

    expect(body.ok).toBe(false)
    expect(body.backend_status).toBe(401)
    // Named as auth, not as a generic ping error and not as slowness.
    expect(body.failure_kind).toBe("auth")
    expect(body.error).toMatch(/401/)
    expect(body.error).toMatch(/auth/i)
    // The operator-facing log must say auth too, at error level.
    expect(loggedAtLevel("error")).toBe(true)
    expect(allLogLines().some((line) => /auth/i.test(line) && /401/.test(line))).toBe(true)
    // It must not simultaneously claim the backend was warm.
    expect(allLogLines().some((line) => /backend warm/.test(line))).toBe(false)
  })

  it("CONTROL 2 (auth 403): a 403 ping reports ok:false with backend_status 403, named as auth", async () => {
    stubPing(403, { detail: "Forbidden" })

    const body = (await (await runSweep()).json()) as CronBody

    expect(body.ok).toBe(false)
    expect(body.backend_status).toBe(403)
    expect(body.failure_kind).toBe("auth")
    expect(body.error).toMatch(/403/)
    expect(body.error).toMatch(/auth/i)
    expect(loggedAtLevel("error")).toBe(true)
    expect(allLogLines().some((line) => /auth/i.test(line) && /403/.test(line))).toBe(true)
    expect(allLogLines().some((line) => /backend warm/.test(line))).toBe(false)
  })

  it("CONTROL 3 (no fake empty sweep): a non-2xx ping is not parsed into a successful empty sweep", async () => {
    // Parseable JSON with no `systems` key — the shape that silently produced
    // zero targets. A 500 also stands in for the general non-2xx case.
    stubPing(500, { detail: "Internal Server Error" })

    const response = await runSweep()
    const body = (await response.json()) as CronBody

    // Not a success by any reading.
    expect(body.ok).not.toBe(true)
    expect(body.ok).toBe(false)
    // No sweep array at all — an empty one would still read as "swept, found
    // nothing", which is the false-green this control exists to forbid.
    expect(body.sweep).toBeUndefined()
    // And nothing was actually swept: the ping is the only fetch issued.
    expect(prewarmUrls()).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // A server error is a failure, but it is not an auth failure.
    expect(body.failure_kind).toBe("http_error")
    expect(body.backend_status).toBe(500)
    expect(allLogLines().some((line) => /prewarm sweep ok/.test(line))).toBe(false)
  })

  it("CONTROL 4 (2xx that is not 200): a 202 ping with no usable body does not report ok:true", async () => {
    // 2xx, so the non-2xx guard does not fire — but there is no `systems` list
    // to sweep, so this is the same silent no-op wearing a success code. The
    // route must not call it green just because the status was in the 2xx band.
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith("/api/systems")) return new Response("", { status: 202 })
      return jsonResponse({ from_snapshot: true })
    })

    const body = (await (await runSweep()).json()) as CronBody

    expect(body.ok).toBe(false)
    expect(body.backend_status).toBe(202)
    // Nothing to sweep, and it must not be announced as a successful sweep.
    expect(body.sweep).toEqual([])
    expect(prewarmUrls()).toEqual([])
    expect(allLogLines().some((line) => /prewarm sweep ok/.test(line))).toBe(false)
  })

  it("PRESERVATION (happy path): a genuine 200 with systems still succeeds and still sweeps", async () => {
    stubPing(200, SYSTEMS_ENVELOPE)

    const response = await runSweep()
    const body = (await response.json()) as CronBody

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.backend_status).toBe(200)
    expect(body.failure_kind).toBeUndefined()

    // All three prewarm kinds still ran over the real system list.
    const sweep = body.sweep ?? []
    expect(sweep.length).toBeGreaterThan(0)
    const kinds = new Set(sweep.map((r) => r.kind))
    expect(kinds).toEqual(new Set(["iap", "topology_risk", "blast_radius"]))
    expect(
      sweep.filter((r) => r.kind === "iap").map((r) => r.system).sort(),
    ).toEqual(["checkout", "orphaned", "payments"])
    expect(sweep.filter((r) => r.kind === "iap").every((r) => r.status === 200)).toBe(true)
    // Real prewarm traffic was issued, not just the ping.
    expect(prewarmUrls().length).toBeGreaterThan(0)
  })

  it("PRESERVATION (URL + scope retention): resolved backend origin and blast-radius scope are unchanged", async () => {
    stubPing(200, SYSTEMS_ENVELOPE)

    await runSweep()

    const urls = fetchMock.mock.calls.map((call) => String(call[0] ?? ""))
    // Every call still goes to the origin getBackendBaseUrl() resolved — the
    // cron's origin must not diverge from the one callers key on.
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((url) => url.startsWith("https://backend.example/"))).toBe(true)
    expect(urls[0]).toBe("https://backend.example/api/systems")

    // Scope forwarding is byte-for-byte what it was: the triple on scoped
    // systems, and a clean skip for the system missing a region.
    const blastUrls = urls.filter((url) => url.includes("/blast-radius"))
    expect(blastUrls.sort()).toEqual([
      "https://backend.example/api/business-system/checkout/blast-radius" +
        "?customer_id=testbed-webshop&account_id=222222222222&region=us-east-1",
      "https://backend.example/api/business-system/payments/blast-radius" +
        "?customer_id=testbed-webshop&account_id=111111111111&region=eu-west-1",
    ])
    expect(blastUrls.some((url) => url.includes("orphaned"))).toBe(false)

    // Topology + IAP keys unchanged too.
    expect(urls).toContain("https://backend.example/api/topology-risk/payments")
    expect(
      urls.some((url) =>
        url.startsWith("https://backend.example/api/identity-attack-paths/payments?"),
      ),
    ).toBe(true)
  })

  it("HYGIENE (no credential leakage): no log line carries token or header material, on success or on 401", async () => {
    for (const status of [200, 401]) {
      vi.resetModules()
      captured = []
      stubPing(status, status === 200 ? SYSTEMS_ENVELOPE : { detail: "Not authenticated" })

      await runSweep()

      for (const line of allLogLines()) {
        expect(line).not.toMatch(/bearer/i)
        expect(line).not.toMatch(/authorization:/i)
        expect(line).not.toMatch(/\btoken\b/i)
        expect(line).not.toMatch(/\bapi[-_ ]?key\b/i)
        expect(line).not.toMatch(/\bsecret\b/i)
      }
    }
  })
})
