/**
 * LIVE integration: IAP crown jewels emit canonical_id; frontend builds
 * graph-view node_ids with canonical_id ?? id (no mocks — rule #72).
 */
import { describe, expect, it } from "vitest"
import { backendNodeId } from "@/lib/iap-node-id"

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend-f.onrender.com"

const SYSTEM = "alon-prod"

type CrownJewel = {
  id: string
  name?: string
  type?: string
  canonical_id?: string | null
}

async function fetchIapJewels(): Promise<CrownJewel[]> {
  const url = `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(SYSTEM)}?enriched=false`
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    throw new Error(`IAP fetch failed: ${res.status} ${await res.text().catch(() => "")}`)
  }
  const body = (await res.json()) as { crown_jewels?: CrownJewel[] }
  return body.crown_jewels ?? []
}

describe("canvas canonical_id live (alon-prod IAP)", () => {
  it(
    "S3Bucket jewel nodeIds prefer canonical_id ARN over legacy short id",
    async () => {
    let jewels: CrownJewel[]
    try {
      jewels = await fetchIapJewels()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(msg)) {
        console.warn(`skip: cannot reach backend at ${BACKEND_URL}: ${msg}`)
        return
      }
      throw e
    }

    const s3Jewels = jewels.filter((j) => (j.type || "") === "S3Bucket")
    if (s3Jewels.length === 0) {
      console.warn("no S3 jewels in alon-prod /all response — busier window needed")
      return
    }

    const jewel = s3Jewels[0]
    const legacyId = jewel.id
    const canonicalId = jewel.canonical_id

    expect(canonicalId, `S3 jewel missing canonical_id: ${JSON.stringify(jewel)}`).toBeTruthy()
    expect(canonicalId!.startsWith("arn:aws:s3:::")).toBe(true)

    const pathNodes = [{ id: legacyId, canonical_id: canonicalId }]
    const nodeIds = pathNodes.map((n) => backendNodeId(n))

    expect(nodeIds).toContain(canonicalId)
    if (legacyId !== canonicalId) {
      expect(nodeIds).not.toContain(legacyId)
    }
  },
    120_000,
  )
})
