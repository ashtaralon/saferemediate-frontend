/**
 * CF01 · the attack-path evidence contract on the RENDERED Attack Paths V2 surface.
 *
 * Every payload here is backend route output captured from the backend's own
 * harness (see __tests__/fixtures/cf01-attack-path-evidence/README.md): two
 * customers, four paths each — observed, unknown (unverified), inferred
 * (configured) and blocked — plus the route's four held / unavailable answers.
 *
 * Render chains (import graph, app/ → component):
 *   app/attack-paths-v2/page.tsx → attack-paths-v2-client.tsx → attack-paths-v2.tsx
 *     → path-list-grouped.tsx → compile-path-list-row.ts → effective-damage-matrix.ts
 *     → identity-attack-paths/crown-jewel-list-panel.tsx
 *     → zoom0-fan-in-panel.tsx → lib/attack-paths/iap-to-convergence.ts
 *     → zoom0-fan-in-panel.tsx → current-access-dossier-panel.tsx (the selected path's story)
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import holdsFixture from "@/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-holds.json"
import twoCustomers from "@/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-two-customers.json"
import {
  buildEffectiveDamageMatrix,
  matrixToSummary,
} from "@/components/attack-paths-v2/effective-damage-matrix"
import { CurrentAccessDossierPanel } from "@/components/attack-paths-v2/current-access-dossier-panel"
import { CrownJewelListPanel } from "@/components/identity-attack-paths/crown-jewel-list-panel"
import type {
  CrownJewelSummary,
  DamageCapability,
  IdentityAttackPath,
} from "@/components/identity-attack-paths/types"
import { buildCurrentAccessDossier } from "@/lib/attack-paths/build-current-access-dossier"
import { iapPathsToConvergence } from "@/lib/attack-paths/iap-to-convergence"
import {
  damageUnknownReason,
  effectiveDamage,
  evidenceTag,
  iapHold,
  pathClassification,
  pathEvidenceSummary,
  permissionCoverageLine,
  planeStates,
} from "@/lib/attack-paths/path-evidence-view"
import { isIapBodyCacheable, resolveRailIapHold } from "@/lib/attack-paths/resolve-jewel-rail"

afterEach(cleanup)

type Body = { paths: IdentityAttackPath[]; crown_jewels: CrownJewelSummary[] }
const CUSTOMERS = {
  acme: { body: twoCustomers.acme as unknown as Body, account: "111111111111", other: "beta" },
  beta: { body: twoCustomers.beta as unknown as Body, account: "222222222222", other: "acme" },
} as const
type Customer = keyof typeof CUSTOMERS

function byClass(customer: Customer) {
  const out: Record<string, IdentityAttackPath> = {}
  for (const p of CUSTOMERS[customer].body.paths) {
    out[p.evidence_contract!.classification] = p
  }
  return out
}

describe.each(["acme", "beta"] as const)("helpers over %s's captured paths", (customer) => {
  const paths = CUSTOMERS[customer].body.paths

  it("reads one server classification per path — the four classes, once each", () => {
    expect(paths).toHaveLength(4)
    expect(paths.map((p) => pathClassification(p)).sort()).toEqual([
      "blocked",
      "inferred",
      "observed",
      "unknown",
    ])
    expect(paths.map((p) => evidenceTag(p)).sort()).toEqual([
      "BLOCKED",
      "INFERRED",
      "OBSERVED",
      "UNKNOWN",
    ])
    // evidence_type is the contract's legacy word, verbatim.
    for (const p of paths) expect(p.evidence_type).toBe(p.evidence_contract!.evidence)
  })

  it("keeps runtime evidence per plane and permission coverage per action, apart", () => {
    const c = byClass(customer)
    expect(planeStates(c.observed.evidence_contract)).toEqual([
      ["identity", "observed"],
      ["network", "observed"],
      ["data", "observed"],
    ])
    expect(planeStates(c.unknown.evidence_contract)).toEqual([
      ["identity", "observed"],
      ["network", "observed"],
      ["data", "unavailable"],
    ])
    // One of two actions evaluated — never "all", never derived from runtime use.
    for (const p of paths) {
      expect(permissionCoverageLine(p.evidence_contract)).toBe(
        "1 of 2 actions have an evaluated permission",
      )
    }
  })

  it("reads unknown damage as unknown, with the null gate named", () => {
    const c = byClass(customer)
    expect(effectiveDamage(c.unknown.damage_capability)).toBe("unknown")
    expect(c.unknown.damage_capability!.gates!.data_plane_reachable).toBeNull()
    expect(damageUnknownReason(c.unknown.damage_capability)).toBe(
      "data-plane reachability not evaluated",
    )
    expect(damageUnknownReason(c.observed.damage_capability)).toBeNull()
    expect(damageUnknownReason(c.blocked.damage_capability)).toBeNull()
  })
})

describe("the legacy fallback never invents 'configured'", () => {
  // Inputs derived from a captured path by REMOVING the contract — the shape an
  // older backend sends. Nothing is added that the server did not say.
  const base = CUSTOMERS.acme.body.paths[0]
  const legacy = (evidence_type: unknown) =>
    ({ ...base, evidence_contract: undefined, evidence_type }) as unknown as IdentityAttackPath

  it("maps the four legacy words and treats missing / unrecognised as unknown", () => {
    expect(pathClassification(legacy("observed"))).toBe("observed")
    expect(pathClassification(legacy("configured"))).toBe("inferred")
    expect(pathClassification(legacy("unverified"))).toBe("unknown")
    expect(pathClassification(legacy("blocked"))).toBe("blocked")
    expect(pathClassification(legacy(undefined))).toBe("unknown")
    expect(pathClassification(legacy("toString"))).toBe("unknown")
    expect(effectiveDamage(undefined)).toBe("unknown")
  })
})

describe.each(["acme", "beta"] as const)("effective-damage matrix over %s's paths", (customer) => {
  const c = byClass(customer)

  it("unknown effective damage is Unknown in every cell — even with materialized damage types", () => {
    const dc = c.unknown.damage_capability as DamageCapability
    expect(dc.materialized_damage_types).toEqual(["read", "write"]) // precondition
    const m = buildEffectiveDamageMatrix(dc, null, false)
    for (const verb of ["read", "write", "delete", "admin"] as const) {
      expect(m[verb]).toMatchObject({ allowed: false, confidence: "Unknown" })
    }
    expect(m.read.detail).toBe("data-plane reachability not evaluated")
    expect(matrixToSummary(m)).toBe("Unknown")
  })

  it("live and blocked keep their server answers", () => {
    const live = buildEffectiveDamageMatrix(c.observed.damage_capability, null, false)
    expect(live.read).toMatchObject({ allowed: true, confidence: "Configured" })
    expect(matrixToSummary(live)).toBe("WRITE · READ")
    const blocked = buildEffectiveDamageMatrix(c.blocked.damage_capability, null, false)
    expect(blocked.read.confidence).toBe("Blocked")
    expect(matrixToSummary(blocked)).toBe("Blocked")
  })

  it("data_plane_unknown, missing and identity_blocked never render as allowed", () => {
    // The captured unknown path with only effective_damage changed to the other
    // contract values the backend declares (types.ts EffectiveDamage).
    const dc = c.unknown.damage_capability as DamageCapability
    const dpu = buildEffectiveDamageMatrix({ ...dc, effective_damage: "data_plane_unknown" }, null, false)
    expect(matrixToSummary(dpu)).toBe("Unknown")
    const missing = buildEffectiveDamageMatrix({ ...dc, effective_damage: undefined }, null, false)
    expect(missing.write).toMatchObject({ allowed: false, confidence: "Unknown" })
    const idb = buildEffectiveDamageMatrix({ ...dc, effective_damage: "identity_blocked" }, null, false)
    expect(idb.read).toMatchObject({ allowed: false, confidence: "Blocked" })
    expect(matrixToSummary(idb)).toBe("Blocked")
  })
})

describe.each(["acme", "beta"] as const)("IAP → convergence fallback for %s", (customer) => {
  it("keeps unknown and blocked instead of collapsing them into 'configured'", () => {
    const { body } = CUSTOMERS[customer]
    const conv = iapPathsToConvergence("payments", body.crown_jewels[0], body.paths)
    const confidenceByClass = Object.fromEntries(
      body.paths.map((p, i) => [p.evidence_contract!.classification, conv.paths[i].confidence]),
    )
    expect(confidenceByClass).toEqual({
      observed: "observed",
      inferred: "configured",
      unknown: "unknown",
      blocked: "blocked",
    })
    expect(conv.observed_paths).toBe(1)
    expect(conv.paths.filter((p) => p.role_assumption_observed)).toHaveLength(1)
  })
})

// ─── The selected-path story: the Current Access dossier ─────────────────────
//
// The route picker stays a clean FROM → TO selector (its design note); the
// path's evidence lives in the dossier the page opens for the pinned path.
// Here the dossier is fed exactly what Zoom0FanInPanel feeds it on the IAP
// fallback: the convergence row from iapPathsToConvergence and the IAP path's
// own evidence summary. The whole-page chain is pinned separately in
// __tests__/cf01-attack-paths-v2-page-hold.test.tsx.

function renderDossier(customer: Customer, cls: string) {
  const { body } = CUSTOMERS[customer]
  const path = byClass(customer)[cls]
  const conv = iapPathsToConvergence("payments", body.crown_jewels[0], body.paths)
  const row = conv.paths.find((p) => p.path_id === (path.attack_path_id ?? path.id))!
  return render(
    <CurrentAccessDossierPanel
      dossier={buildCurrentAccessDossier({ ...row, hops_load_state: "ready" })}
      pathEvidence={pathEvidenceSummary(path)}
      jewelName={body.crown_jewels[0].name}
      jewelType={body.crown_jewels[0].type}
      systemName="payments"
    />,
  )
}

describe.each(["acme", "beta"] as const)("Current Access dossier — %s", (customer) => {
  beforeEach(() => {
    // The dossier's own exact-scope explorer asks the proxy; not under test.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each(["observed", "inferred", "blocked", "unknown"])("names the %s class from the contract", (cls) => {
    renderDossier(customer, cls)
    const chip = screen.getByTestId("dossier-evidence-class")
    expect(chip).toHaveTextContent(cls.toUpperCase())
    expect(chip).toHaveAttribute("data-evidence-class", cls)
  })

  it("prints unknown as unknown — never blocked, live or empty", () => {
    renderDossier(customer, "unknown")
    expect(screen.getByTestId("dossier-evidence-class")).toHaveTextContent("UNKNOWN")
    const damage = screen.getByTestId("dossier-effective-damage")
    expect(damage).toHaveTextContent("Effective damage: unknown — data-plane reachability not evaluated")
    expect(damage.textContent).not.toMatch(/blocked|live/i)
    // The unavailable data plane is printed as unavailable, not as "not observed".
    expect(screen.getByTestId("dossier-runtime-evidence")).toHaveTextContent(
      "Runtime evidence: identity observed · network observed · data unavailable",
    )
    expect(screen.getByText("data plane unavailable")).toBeInTheDocument()
    // Potential damage is the server's words, not "none listed".
    expect(screen.queryByText("No potential damage is listed for this path.")).toBeNull()
  })

  it("controls: blocked and live keep their server answers", () => {
    renderDossier(customer, "blocked")
    expect(screen.getByTestId("dossier-effective-damage")).toHaveTextContent("blocked by network controls")
    cleanup()
    renderDossier(customer, "observed")
    expect(screen.getByTestId("dossier-effective-damage")).toHaveTextContent("live — reachable end to end")
    expect(screen.getByTestId("dossier-runtime-evidence")).toHaveTextContent(
      "identity observed · network observed · data observed",
    )
  })

  it("keeps runtime evidence and permission coverage on separate, labelled lines", () => {
    renderDossier(customer, "inferred")
    const runtime = screen.getByTestId("dossier-runtime-evidence")
    const coverage = screen.getByTestId("dossier-permission-coverage")
    expect(runtime).toHaveTextContent("Runtime evidence: identity unavailable · network unavailable · data unavailable")
    expect(coverage).toHaveTextContent("Permission coverage: 1 of 2 actions have an evaluated permission")
    expect(runtime.textContent).not.toMatch(/permission/i)
    expect(coverage.textContent).not.toMatch(/identity|network/)
  })

  it("contains nothing of the other customer", () => {
    const { container } = renderDossier(customer, "unknown")
    const html = container.innerHTML
    const { other } = CUSTOMERS[customer]
    // Positive control: this customer's own names ARE rendered.
    expect(html).toContain(`${customer}-web-2`)
    expect(html).toContain(`${customer}-data`)
    expect(html).not.toContain(CUSTOMERS[other].account)
    expect(html).not.toContain(`${other}-`)
  })
})

describe("a path with no evidence contract", () => {
  it("says the runtime and permission lines were not reported — it does not invent them", () => {
    const summary = pathEvidenceSummary({ evidence_type: "unverified" })!
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })))
    const { body } = CUSTOMERS.acme
    const conv = iapPathsToConvergence("payments", body.crown_jewels[0], body.paths)
    render(
      <CurrentAccessDossierPanel
        dossier={buildCurrentAccessDossier({ ...conv.paths[0], hops_load_state: "ready" })}
        pathEvidence={summary}
        jewelName="acme-data"
      />,
    )
    expect(screen.getByTestId("dossier-evidence-class")).toHaveTextContent("UNKNOWN")
    expect(screen.getByTestId("dossier-runtime-evidence")).toHaveTextContent("not reported by the server for this path")
    expect(screen.getByTestId("dossier-permission-coverage")).toHaveTextContent("not reported by the server for this path")
    expect(screen.queryByTestId("dossier-effective-damage")).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe("the fixture itself is two disjoint customers", () => {
  it("never carries one customer's account or names in the other's body", () => {
    const acme = JSON.stringify(twoCustomers.acme)
    const beta = JSON.stringify(twoCustomers.beta)
    expect(acme).toContain("111111111111")
    expect(beta).toContain("222222222222")
    expect(acme).not.toContain("222222222222")
    expect(beta).not.toContain("111111111111")
    expect(acme).not.toContain("beta-")
    expect(beta).not.toContain("acme-")
  })
})

// ─── Held / unavailable IAP answers on the crown-jewel rail ──────────────────

const HOLDS = holdsFixture as Record<string, { status: number; body: unknown }>

describe("held / unavailable IAP answers", () => {
  it("names each captured hold; a populated body is not a hold", () => {
    expect(iapHold(HOLDS.install_not_recorded.body)).toEqual({
      kind: "not_recorded",
      reason: "CONSUMER_READINESS_UNOBSERVABLE",
    })
    expect(iapHold(HOLDS.c1_unavailable.body)).toEqual({
      kind: "unavailable",
      reason: "503: Neo4j not connected",
    })
    expect(iapHold(HOLDS.install_serving_read_refused.body)).toEqual({
      kind: "refused",
      reason: "SERVING_READ_REFUSED: FACADE_READ_OUTSIDE_ADMISSION",
    })
    expect(iapHold(HOLDS.install_semantic_read_unavailable.body)).toEqual({
      kind: "unavailable",
      reason: "SEMANTIC_READ_UNAVAILABLE: READER_ERROR",
    })
    expect(iapHold(twoCustomers.acme)).toBeNull()
    expect(iapHold({ provenance: {}, result: HOLDS.install_not_recorded.body })?.kind).toBe(
      "not_recorded",
    )
    // The backend's rule: data alongside an error is still an answer.
    expect(iapHold({ ...twoCustomers.acme, error: "one jewel timed out" })).toBeNull()
    expect(isIapBodyCacheable(HOLDS.install_not_recorded.body)).toBe(false)
    expect(isIapBodyCacheable(twoCustomers.beta)).toBe(true)
  })

  it("puts the hold on the rail only when the SERVE catalog did not answer", () => {
    const body = HOLDS.install_not_recorded.body
    expect(
      resolveRailIapHold({ serveJewelsRaw: null, serveJewelsError: "HTTP 502", jewelsEmpty: true, iapBody: body }),
    ).toMatchObject({ kind: "not_recorded" })
    // An answered SERVE catalog is its own truth.
    expect(
      resolveRailIapHold({ serveJewelsRaw: { targets: [] }, serveJewelsError: null, jewelsEmpty: true, iapBody: body }),
    ).toBeNull()
    expect(
      resolveRailIapHold({ serveJewelsRaw: null, serveJewelsError: "HTTP 502", jewelsEmpty: false, iapBody: body }),
    ).toBeNull()
  })

  it.each([
    ["install_not_recorded", "Attack-path evidence not recorded yet", "CONSUMER_READINESS_UNOBSERVABLE"],
    ["c1_unavailable", "Attack-path evidence unavailable", "503: Neo4j not connected"],
    ["install_serving_read_refused", "Attack-path read refused", "SERVING_READ_REFUSED: FACADE_READ_OUTSIDE_ADMISSION"],
    ["install_semantic_read_unavailable", "Attack-path evidence unavailable", "SEMANTIC_READ_UNAVAILABLE: READER_ERROR"],
  ])("the rendered rail shows the %s hold, never 'No crown jewels'", (key, title, reason) => {
    const hold = resolveRailIapHold({
      serveJewelsRaw: null,
      serveJewelsError: "HTTP 502",
      jewelsEmpty: true,
      iapBody: HOLDS[key].body,
    })
    render(
      <CrownJewelListPanel jewels={[]} selectedJewelId={null} onSelect={vi.fn()} iapHold={hold} />,
    )
    const panel = screen.getByTestId("crown-jewel-hold")
    expect(panel).toHaveTextContent(title)
    expect(panel).toHaveTextContent(reason)
    expect(screen.getByTestId("crown-jewel-hold-header")).toHaveTextContent(title)
    expect(screen.queryByText(/No crown jewels detected/)).toBeNull()
    expect(screen.queryByText(/highest-risk assets/)).toBeNull()
  })

  it("without a hold, the same empty rail still says what it always said (control)", () => {
    render(<CrownJewelListPanel jewels={[]} selectedJewelId={null} onSelect={vi.fn()} />)
    expect(screen.getByText("No crown jewels detected")).toBeInTheDocument()
    expect(screen.queryByTestId("crown-jewel-hold")).toBeNull()
  })

  it("a hold never hides jewels that did arrive", () => {
    render(
      <CrownJewelListPanel
        jewels={CUSTOMERS.acme.body.crown_jewels}
        selectedJewelId={null}
        onSelect={vi.fn()}
        iapHold={iapHold(HOLDS.install_not_recorded.body)}
      />,
    )
    expect(screen.getByText("acme-data")).toBeInTheDocument()
    expect(screen.queryByTestId("crown-jewel-hold")).toBeNull()
  })
})
