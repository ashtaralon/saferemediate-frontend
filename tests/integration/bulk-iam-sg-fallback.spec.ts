/**
 * LIVE integration: bulk IAM gap + SG inspector proxies / backend.
 * Fallback path uses fetch intercept (network layer only — rule #72).
 */
import { describe, expect, it } from "vitest"

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend-f.onrender.com"

const PROXY_BASE = process.env.FRONTEND_URL || ""

const IAM_ROLE_NAMES = [
  "alon-demo-ec2-role",
  "cyntro-demo-ec2-s3-role",
  "AlonIAMTest",
  "AWSServiceRoleForConfig",
]

const SG_IDS = [
  "sg-0212ab87005f59737",
  "sg-019f8e0d91a4e45cc",
  "sg-08f4ba91d94bc6d99",
]

async function postBulkIam(base: string) {
  const url = base.includes("/api/proxy")
    ? `${base}/api/proxy/iam-roles/gap-analysis/batch`
    : `${base}/api/iam-roles/gap-analysis/batch`
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role_names: IAM_ROLE_NAMES, days: 365 }),
    signal: AbortSignal.timeout(120_000),
  })
}

async function postBulkSg(base: string) {
  const url = base.includes("/api/proxy")
    ? `${base}/api/proxy/security-groups/inspector/batch`
    : `${base}/api/security-groups/inspector/batch`
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sg_ids: SG_IDS, window: "30d" }),
    signal: AbortSignal.timeout(120_000),
  })
}

function iamResultCount(body: { results?: Record<string, unknown> }): number {
  return Object.keys(body.results ?? {}).length
}

describe("bulk IAM / SG live (backend or proxy)", () => {
  it(
    "bulk IAM gap round-trip returns results for most fixture roles",
    async () => {
      const base = PROXY_BASE || BACKEND_URL
      let res: Response
      try {
        res = await postBulkIam(base)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(msg)) {
          console.warn(`skip: cannot reach ${base}: ${msg}`)
          return
        }
        throw e
      }
      if (res.status === 404 && !PROXY_BASE) {
        console.warn("skip: bulk endpoint not deployed on backend yet")
        return
      }
      const text = await res.text()
      expect(res.ok, text).toBe(true)
      const body = JSON.parse(text) as { results?: Record<string, unknown> }
      expect(iamResultCount(body)).toBeGreaterThanOrEqual(IAM_ROLE_NAMES.length - 1)
    },
    120_000,
  )

  it(
    "bulk SG inspector round-trip returns results for most fixture SGs",
    async () => {
      const base = PROXY_BASE || BACKEND_URL
      let res: Response
      try {
        res = await postBulkSg(base)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(msg)) {
          console.warn(`skip: cannot reach ${base}: ${msg}`)
          return
        }
        throw e
      }
      if (res.status === 404 && !PROXY_BASE) {
        console.warn("skip: bulk SG endpoint not deployed on backend yet")
        return
      }
      const text = await res.text()
      expect(res.ok, text).toBe(true)
      const body = JSON.parse(text) as { results?: Record<string, unknown> }
      expect(Object.keys(body.results ?? {}).length).toBeGreaterThanOrEqual(
        SG_IDS.length - 1,
      )
    },
    120_000,
  )
})

/** Mirrors traffic-flow-map bulk IAM enrichment + per-role fallback. */
async function enrichIamWithBulkFallback(roleNames: string[]): Promise<
  Array<{ roleName: string; usedCount: number } | null>
> {
  const mapRole = (roleName: string, data: Record<string, unknown>) => {
    const summary = (data.summary as Record<string, number>) || {}
    return {
      roleName,
      usedCount: summary.used_count ?? (data.used_count as number) ?? 0,
    }
  }

  try {
    const bulkRes = await fetch("/api/proxy/iam-roles/gap-analysis/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_names: roleNames, days: 365 }),
    })
    if (!bulkRes.ok) throw new Error(`bulk ${bulkRes.status}`)
    const bulk = (await bulkRes.json()) as { results?: Record<string, Record<string, unknown>> }
    return roleNames.map((rn) => {
      const data = bulk.results?.[rn]
      return data ? mapRole(rn, data) : null
    })
  } catch {
    return Promise.all(
      roleNames.map(async (roleName) => {
        const res = await fetch(
          `/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=365`,
        )
        if (!res.ok) return null
        const data = (await res.json()) as Record<string, unknown>
        return mapRole(roleName, data)
      }),
    )
  }
}

describe("bulk IAM fallback (fetch intercept)", () => {
  it("uses per-role fetches when bulk returns 404", async () => {
    const roleNames = ["alon-demo-ec2-role"]
    const origFetch = globalThis.fetch
    let bulkHits = 0
    let perRoleHits = 0

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url.includes("gap-analysis/batch")) {
        bulkHits += 1
        return new Response(JSON.stringify({ results: {}, errors: {} }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (url.includes("/gap-analysis?")) {
        perRoleHits += 1
        return new Response(
          JSON.stringify({
            role_name: roleNames[0],
            summary: { used_count: 3, total_permissions: 10, unused_count: 7, lp_score: 30 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      return origFetch(input, init)
    }

    try {
      const results = await enrichIamWithBulkFallback(roleNames)
      expect(bulkHits).toBe(1)
      expect(perRoleHits).toBe(1)
      expect(results[0]?.usedCount).toBe(3)
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
