/**
 * The Identity & access lens: its deep link, and what it refuses to invent.
 *
 * Two pure contracts, asserted without a DOM:
 *
 *  - the lens deep link is ADDITIVE. `?lens=` selects a view, and its absence
 *    changes nothing — the Estate page keeps whatever default it already had.
 *    A deep link that quietly moved the landing view would be navigation
 *    disguised as a link.
 *  - the identity taxonomy is READ, never derived. `estate-identity-access/v1`
 *    carries roles; users, groups, policies, permission sets, federated
 *    identities and protected resources are not in it. Every family stays
 *    explicitly unavailable until a payload actually carries it.
 */
import { describe, expect, it } from "vitest"

import {
  ESTATE_LENSES,
  lensFromSearch,
  withLensParam,
} from "@/components/topology-v0-2/topology-scope-url"
import {
  TAXONOMY_EDGE_FAMILIES,
  TAXONOMY_LABEL,
  TAXONOMY_REQUIREMENTS,
  readTaxonomy,
} from "@/components/topology-v0-2/identity-taxonomy-contract"

describe("Estate lens deep link", () => {
  it("selects the lens the URL asks for", () => {
    expect(lensFromSearch("?lens=identity")).toBe("identity")
    expect(lensFromSearch("?systemName=alon-prod&lens=map")).toBe("map")
    expect(lensFromSearch("?lens=inventory")).toBe("inventory")
  })

  it("asks for nothing when the parameter is absent or unrecognised", () => {
    // This is what keeps the page default the page's own: no param, no opinion.
    expect(lensFromSearch("")).toBeNull()
    expect(lensFromSearch("?systemName=alon-prod")).toBeNull()
    expect(lensFromSearch("?lens=")).toBeNull()
    expect(lensFromSearch("?lens=something-else")).toBeNull()
  })

  it("sets the lens without disturbing any other parameter", () => {
    const next = withLensParam("?systemName=alon-prod&account_id=416651950952", "identity")
    const q = new URLSearchParams(next.replace(/^\?/, ""))
    expect(q.get("lens")).toBe("identity")
    expect(q.get("systemName")).toBe("alon-prod")
    expect(q.get("account_id")).toBe("416651950952")
  })

  it("round-trips every declared lens", () => {
    for (const lens of ESTATE_LENSES) {
      expect(lensFromSearch(withLensParam("?systemName=x", lens))).toBe(lens)
    }
  })
})

describe("identity taxonomy: absent families stay absent", () => {
  /** What the producer sends today: roles, and nothing of the wider taxonomy. */
  const V1_BLOCK = {
    contract_version: "estate-identity-access/v1",
    status: "ready",
    roles: [{ role_id: "r1", attachment_modes: ["instance_profile"] }],
  }

  it("reports every family unavailable on a real v1 block", () => {
    const reading = readTaxonomy(V1_BLOCK)
    expect(reading.anyPresent).toBe(false)
    expect(reading.families).toHaveLength(TAXONOMY_EDGE_FAMILIES.length)
    for (const family of reading.families) {
      expect(family.state).toBe("unavailable")
      // It names the payload key that would carry it, so the gap is actionable.
      if (family.state === "unavailable") expect(family.block_key).toBeTruthy()
    }
  })

  it("never derives one family from another", () => {
    // A role's attachment_modes is not a policy attachment. Treating it as one
    // would put an edge on the map the producer never asserted.
    const attached = readTaxonomy(V1_BLOCK).families.find(f => f.family === "ATTACHED_POLICY")
    expect(attached!.state).toBe("unavailable")
  })

  it("never reports an absent family as a zero count", () => {
    for (const family of readTaxonomy(V1_BLOCK).families) {
      expect(family).not.toHaveProperty("count")
    }
  })

  it("accepts the real payload shape, which is typed unknown", () => {
    // `identity_access` is `unknown` on TopologyRiskResponse on purpose; the
    // reader must handle anything without throwing and without inventing.
    for (const junk of [null, undefined, "nope", 42, [1, 2], true]) {
      const reading = readTaxonomy(junk)
      expect(reading.anyPresent).toBe(false)
      expect(reading.families).toHaveLength(TAXONOMY_EDGE_FAMILIES.length)
    }
  })

  it("a B17-shaped payload drops straight in, with real counts", () => {
    const reading = readTaxonomy({
      ...V1_BLOCK,
      group_memberships: [{ from: "u1", to: "g1" }, { from: "u2", to: "g1" }],
      data_accesses: [{ from: "r1", to: "bucket" }],
    })
    expect(reading.anyPresent).toBe(true)
    const member = reading.families.find(f => f.family === "MEMBER_OF")
    expect(member!.state).toBe("present")
    if (member!.state === "present") expect(member!.count).toBe(2)
    // The families B17 did not send stay honestly absent.
    expect(reading.families.filter(f => f.state === "unavailable")).toHaveLength(5)
  })

  it("declares every family, and only observed-plane families may animate", () => {
    for (const family of TAXONOMY_EDGE_FAMILIES) {
      expect(TAXONOMY_REQUIREMENTS.some(r => r.family === family)).toBe(true)
      expect(typeof TAXONOMY_LABEL[family]).toBe("string")
    }
    // Motion is a claim that something was observed. Configured families are
    // statements about policy and must never move.
    const observed = TAXONOMY_REQUIREMENTS.filter(r => r.plane === "observed").map(r => r.family)
    expect(observed.sort()).toEqual(["AUTHENTICATES_AS", "DATA_ACCESS"])
  })
})
