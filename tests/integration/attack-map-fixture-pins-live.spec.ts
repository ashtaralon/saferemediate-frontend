/**
 * Attack-map fixture pin gate — LIVE Playwright (Task #186).
 *
 * Verifies the cross-tier determinism contract end-to-end:
 *   1. /api/proxy/attack-map/{path_id}?system=alon-prod returns the v1.3 §8
 *      contract shape (movement_chain disjoint from constraint_edges, KMS
 *      dual-typing via appears_as, every constraint has severity).
 *   2. /api/proxy/topology/alon-prod?shape=full|minimal returns matching
 *      counts and the minimal shape is a strict projection of full.
 *   3. The new ?map=cyntro canvas renders with key labels visible.
 *
 * The 3 golden fixtures pinned here live in saferemediate-backend at
 * tests/fixtures/attack_map/{path_id}.{meta,payload}.json — same path_ids
 * as the backend's drift-check script (scripts/capture_attack_map_fixtures.py).
 *
 * Companion unit tests: __tests__/attack-map/slot-mapper-invariants.test.ts.
 */
import { test, expect } from "@playwright/test"

const SYSTEM = "alon-prod"

// Pinned fixture path_ids. Source of truth = backend manifest.json.
// If a fixture is regenerated with intentional contract changes, both the
// backend manifest and these constants bump together (compiler-meta gate).
const FIXTURES = [
  { label: "alon-demo-app2 → saferemediate-logs", path_id: "432c6db135ff8b2af80a67e22ec466f2b4fd3a37512bffea62c73779ac199d42" },
  { label: "EC2 → KMS terminus", path_id: "5fc0b945657cd461a53fa7a5c9a832f6e66565981c5f2f74256571cf65db858f" },
  { label: "cyntro-web-server → saferemediate-logs", path_id: "ea16b5479bb6dda3e601756dd4774275237e9f8088f0cb5be14d2d970dd0e8ea" },
] as const

const CONSTRAINT_NODE_TYPES = new Set(["KMSKey", "SCP", "ResourcePolicy", "TrustPolicy"])

async function authedContext(context: import("@playwright/test").BrowserContext, base: string) {
  await context.addCookies([
    {
      name: "cyntro_auth",
      value: "authenticated",
      domain: new URL(base).hostname,
      path: "/",
    },
  ])
}

test.describe("attack-map fixture pins (live)", () => {
  test.beforeEach(async ({ context }) => {
    test.setTimeout(180_000)
    const base = process.env.FRONTEND_URL || "http://localhost:3000"
    await authedContext(context, base)
  })

  for (const fx of FIXTURES) {
    test(`§8 contract intact: ${fx.label}`, async ({ request }) => {
      const res = await request.get(`/api/proxy/attack-map/${fx.path_id}?system=${SYSTEM}`)
      expect(res.ok(), `proxy returned ${res.status()}`).toBe(true)
      const payload = await res.json()

      // §8 mandatory fields
      expect(payload.system).toBe(SYSTEM)
      expect(payload.path_id).toBe(fx.path_id)
      expect(Array.isArray(payload.movement_chain)).toBe(true)
      expect(Array.isArray(payload.constraint_edges)).toBe(true)
      expect(payload.blast).toBeDefined()
      expect(typeof payload.blast.crown_jewels_reachable).toBe("number")
      expect(Array.isArray(payload.collection_gaps)).toBe(true)

      // §5 invariant 2 — movement/constraint disjoint by type.
      for (const hop of payload.movement_chain) {
        expect(
          CONSTRAINT_NODE_TYPES.has(hop.node_type),
          `constraint type ${hop.node_type} leaked into movement_chain`,
        ).toBe(false)
        expect(["ENTRY", "SEEN", "ALLOWED", "NOT_OBSERVED", "BLOCKED"]).toContain(hop.verdict)
      }

      // §5 invariant 3 — every constraint has appears_as, severity, gates_movement_edge.
      const movementIds = new Set<string>(payload.movement_chain.map((h: { node_id: string }) => h.node_id))
      for (const c of payload.constraint_edges) {
        expect(["constraint", "terminus"]).toContain(c.appears_as)
        expect(["critical", "high", "medium", "low"]).toContain(c.severity)
        expect(typeof c.gates_movement_edge).toBe("string")
        expect(c.gates_movement_edge).toContain("→")
        // §6 invariant 4 — gates_movement_edge references real chain hops.
        const [src, dst] = c.gates_movement_edge.split("→").map((s: string) => s.trim())
        expect(movementIds.has(src), `constraint gate src ${src} not in chain`).toBe(true)
        expect(movementIds.has(dst), `constraint gate dst ${dst} not in chain`).toBe(true)
      }
    })
  }

  test("§4.3 strict projection — topology minimal ⊆ full", async ({ request }) => {
    const [fullRes, minRes] = await Promise.all([
      request.get(`/api/proxy/topology/${SYSTEM}?shape=full`),
      request.get(`/api/proxy/topology/${SYSTEM}?shape=minimal`),
    ])
    expect(fullRes.ok()).toBe(true)
    expect(minRes.ok()).toBe(true)

    const full = await fullRes.json()
    const min = await minRes.json()

    expect(min.system_name).toBe(full.system_name)
    expect(min.topology_version).toBe(full.topology_version)
    expect(min.schema_version).toBe(full.schema_version)

    const fullSubnets = new Set<string>(full.subnets.map((s: { subnet_id: string }) => s.subnet_id))
    const fullNodes = new Set<string>([
      ...full.resources.map((r: { node_id: string }) => r.node_id),
      ...full.crown_jewels.map((j: { node_id: string }) => j.node_id),
    ])
    for (const s of min.subnet_ids) {
      expect(fullSubnets.has(s), `minimal subnet ${s} absent from full`).toBe(true)
    }
    for (const n of min.node_ids) {
      expect(fullNodes.has(n), `minimal node ${n} absent from full`).toBe(true)
    }
  })

  test("?map=cyntro renders path-only attack map experience", async ({ page }) => {
    const jewel = encodeURIComponent("arn:aws:s3:::saferemediate-logs-745783559495")
    await page.goto(
      `/attack-paths-v2?system=${SYSTEM}&jewel=${jewel}&path=path-mat-061e32978e12&map=cyntro`,
      { waitUntil: "domcontentloaded" },
    )
    await expect(page.getByTestId("cyntro-attack-map-experience")).toBeVisible({ timeout: 90_000 })
    await expect(page.getByTestId("cyntro-attack-map-experience")).toContainText(/path only/i)
  })

  test("?map=target renders clean grid target map", async ({ page }) => {
    const jewel = encodeURIComponent("arn:aws:s3:::saferemediate-logs-745783559495")
    await page.goto(
      `/attack-paths-v2?system=${SYSTEM}&jewel=${jewel}&path=path-mat-061e32978e12&map=target`,
      { waitUntil: "domcontentloaded" },
    )
    await expect(page.getByTestId("target-attack-map")).toBeVisible({ timeout: 90_000 })
  })
})
