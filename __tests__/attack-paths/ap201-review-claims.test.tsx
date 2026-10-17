/**
 * AP201 independent review (Alon, 2026-10-17): B1, B2, B5 and S1/S2 — every Attack Paths read names the account the
 * page names, and two green / empty answers are said only when the server said them.
 *
 * Real: the hooks, the components, `attackPathReadClaims`, `useAttackPathReadClaims`, `<AttackPathSystemIdentity>`,
 * `fetchConvergenceSummary`. Stubbed (labelled): `fetch` (records the URL, answers a typed hold) and the app shell's
 * account-scope provider (`useOptionalAccountScope`), whose selection each case sets.
 */
import type { ReactNode } from "react"
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const scope: { current: { customerId: string | null; accountId: string | null } | null } = { current: null }
vi.mock("@/lib/account-scope-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account-scope-context")>()),
  useOptionalAccountScope: () => scope.current,
}))

import { AttackPathSystemIdentity } from "@/lib/attack-paths/read-scope-context"
import { attackPathReadClaims } from "@/lib/attack-paths/scope-claims"
import { fetchConvergenceSummary } from "@/lib/attack-paths/crown-jewel-v2-navigation"
import { useAttackPathReport } from "@/components/attack-paths-v2/use-attack-path-report"
import { useLateralReach } from "@/components/attack-paths-v2/use-lateral-reach"
import { useClosurePreview } from "@/components/attack-paths-v2/use-closure-preview"
import { useDamageScope } from "@/components/attack-paths-v2/use-damage-scope"
import { useLateralMoves } from "@/components/attack-paths-v2/use-lateral-moves"
import { usePermissionCutPlan } from "@/components/attack-paths-v2/use-permission-cut-plan"
import { AtlasLateralLensPanel } from "@/components/attack-paths-v2/atlas-lateral-lens"
import { ExfilPathListColumn } from "@/components/attack-paths-v2/exfil-path-list-column"
import { fetchConvergencePathDetail } from "@/lib/attack-paths/convergence-path-details"
import { useAtlasLateral } from "@/components/attack-paths-v2/use-atlas-lateral"
import { DamageScopeDrawer } from "@/components/attack-paths-v2/damage-scope-drawer"

const SELECTED = "111111111111"
const KEY_ACCOUNT = "222222222222"
const PATH_ID = "a".repeat(64)
const HOLD = { semantic_status: "not_recorded", source_generation: null, graph_version: null, coverage: null,
  hold_reason: "PATH_REPORT_PUBLICATION_NOT_RECORDED", hold_detail: "path_not_in_publication" }

let urls: string[]
beforeEach(() => {
  urls = []
  scope.current = { customerId: "acme", accountId: SELECTED }
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input))
    return new Response(JSON.stringify(HOLD), { status: 200, headers: { "content-type": "application/json" } })
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const opened = ({ children }: { children: ReactNode }) => (
  <AttackPathSystemIdentity systemKey="sk-1" systemAccountId={KEY_ACCOUNT}>{children}</AttackPathSystemIdentity>
)
const query = (url: string) => Object.fromEntries(new URL(url, "http://fe.local").searchParams)

describe("the one claim rule (attackPathReadClaims)", () => {
  it("selected account only; a key's own account replaces it; nothing without either", () => {
    expect(attackPathReadClaims({ customerId: "acme", accountId: SELECTED })).toEqual(
      { customerId: "acme", accountId: SELECTED, systemKey: null, systemAccountId: null })
    expect(attackPathReadClaims({ customerId: "acme", accountId: SELECTED }, { systemKey: "sk-1", systemAccountId: KEY_ACCOUNT }))
      .toEqual({ customerId: "acme", accountId: SELECTED, systemKey: "sk-1", systemAccountId: KEY_ACCOUNT })
    expect(attackPathReadClaims({ customerId: "acme", accountId: "all" }, { systemAccountId: KEY_ACCOUNT })).toEqual(
      { customerId: null, accountId: null, systemKey: null, systemAccountId: null })
  })
})

describe("B1 · the per-path report reads the account the page names", () => {
  it("opened by key: the report read carries the key and the KEY's account, not the selected one", async () => {
    renderHook(() => useAttackPathReport({ id: PATH_ID, attack_path_id: PATH_ID, nodes: [], edges: [] } as never), { wrapper: opened })
    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    expect(query(urls[0])).toEqual({ customer_id: "acme", account_id: KEY_ACCOUNT, system_key: "sk-1" })
  })

  it("opened by name: the selected account; no selection: no query at all (byte-identical)", async () => {
    renderHook(() => useAttackPathReport({ id: PATH_ID, attack_path_id: PATH_ID, nodes: [], edges: [] } as never))
    await waitFor(() => expect(urls.length).toBe(1))
    expect(query(urls[0])).toEqual({ customer_id: "acme", account_id: SELECTED })
    cleanup()
    urls = []
    scope.current = { customerId: "acme", accountId: "all" }
    renderHook(() => useAttackPathReport({ id: PATH_ID, attack_path_id: PATH_ID, nodes: [], edges: [] } as never))
    await waitFor(() => expect(urls.length).toBe(1))
    expect(urls[0]).toBe(`/api/proxy/attack-paths/path/${PATH_ID}/report`)
  })
})

describe("S1 · lateral reach, the held readers and the convergence summary use the same rule", () => {
  it("lateral reach carries the key's account", async () => {
    renderHook(() => useLateralReach({ systemName: "shop", jewelRef: "arn:aws:rds:x", jewelType: "RDSInstance" }), { wrapper: opened })
    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    expect(query(urls[0])).toMatchObject({ account_id: KEY_ACCOUNT, system_key: "sk-1", customer_id: "acme" })
  })

  it("the four held readers carry the claims", async () => {
    renderHook(() => useClosurePreview({ id: PATH_ID, attack_path_id: PATH_ID, nodes: [], crown_jewel_id: "cj" } as never), { wrapper: opened })
    renderHook(() => useDamageScope({ systemName: "shop", pathId: PATH_ID, nodeId: "n1" } as never), { wrapper: opened })
    renderHook(() => useLateralMoves({ systemName: "shop", identityId: "role-1", jewelId: "cj" } as never), { wrapper: opened })
    const cut = renderHook(() => usePermissionCutPlan("shop"), { wrapper: opened })
    await cut.result.current.requestPlan("arn:aws:iam::1:role/r", "arn:aws:s3:::b")
    await waitFor(() => expect(urls.length).toBe(4))
    for (const fragment of ["/closure-preview", "/damage-scope", "/lateral-moves", "/permission-cut-plan"]) {
      const url = urls.find((u) => u.includes(fragment))!
      expect(query(url), fragment).toMatchObject({ customer_id: "acme", account_id: KEY_ACCOUNT, system_key: "sk-1" })
    }
  })

  it("the convergence summary carries the selected account (it used to drop it)", async () => {
    await fetchConvergenceSummary("shop", { id: "cj", name: "db", type: "RDSInstance" } as never,
      attackPathReadClaims({ customerId: "acme", accountId: SELECTED }))
    expect(query(urls[0])).toMatchObject({ customer_id: "acme", account_id: SELECTED })
  })
})

describe("B2 · 'No evaluated service reached this jewel' needs the server's counts", () => {
  const dead = { workload_id: "i-1", workload_name: "web-1", workload_type: "EC2Instance", foothold_likelihood: "UNKNOWN",
    foothold_reasons: [], atlas_evaluation: { state: "DEAD_END" } }
  const panel = (evaluation: unknown) => render(<AtlasLateralLensPanel candidates={[dead as never]} selectedFootholdId={null}
    selectedFoothold={null} response={null} evaluation={evaluation as never} candidatesLoading={false} simulationLoading={false}
    error={null} onSelectFoothold={() => undefined} onRetry={() => undefined} />)

  it("an evaluation without its counts is no verdict", () => {
    panel({ reachable_count: 0, error_count: 0 })
    expect(screen.queryByTestId("atlas-none-reached")).toBeNull()
  })

  it("an evaluation with none eligible is no verdict", () => {
    panel({ reachable_count: 0, evaluated_count: 0, eligible_count: 0, error_count: 0 })
    expect(screen.queryByTestId("atlas-none-reached")).toBeNull()
  })

  it("counts that are not served numbers (strings) are no verdict", () => {
    panel({ reachable_count: 0, evaluated_count: "1", eligible_count: "1", error_count: 0 })
    expect(screen.queryByTestId("atlas-none-reached")).toBeNull()
  })

  it("every eligible candidate evaluated, by served count, is the verdict", () => {
    panel({ reachable_count: 0, evaluated_count: 1, eligible_count: 1, error_count: 0 })
    expect(screen.getByTestId("atlas-none-reached")).toBeInTheDocument()
  })
})

describe("B5 · ExfilPathListColumn without `answered` is unread, never the server's empty answer", () => {
  it("defaults to unread", () => {
    render(<ExfilPathListColumn paths={[]} selectedPathId={null} onSelectPath={() => undefined} jewelName="acme-data" />)
    expect(screen.getByTestId("exfil-rail-unread")).toBeInTheDocument()
    expect(screen.queryByTestId("exfil-rail-empty")).toBeNull()
  })

  it("says the server's empty answer only when told the server answered", () => {
    render(<ExfilPathListColumn paths={[]} selectedPathId={null} onSelectPath={() => undefined} jewelName="acme-data" answered />)
    expect(screen.getByTestId("exfil-rail-empty")).toBeInTheDocument()
  })
})

describe("S11 · the three held readers say a typed 503 hold is a hold, never a result", () => {
  const ROUTE_HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } }
  const held = (capability: string) => `${capability} is not available on this install (SERVING_ROUTE_HELD: HELD_CUSTOMER_READ). This is not a result.`
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify(ROUTE_HELD), { status: 503, headers: { "content-type": "application/json" } })))
  })

  it("closure preview", async () => {
    const { result } = renderHook(() => useClosurePreview({ id: PATH_ID, attack_path_id: PATH_ID, nodes: [], crown_jewel_id: "cj" } as never))
    await waitFor(() => expect(result.current.error).toBe(held("Closure preview")), { timeout: 4000 })
    expect(result.current.closure).toBeNull()
  })

  it("permission-cut plan", async () => {
    const { result } = renderHook(() => usePermissionCutPlan("shop"))
    await result.current.requestPlan("arn:aws:iam::1:role/r", "arn:aws:s3:::b")
    await waitFor(() => expect(result.current.error).toBe(held("Permission-cut plan")))
    expect(result.current.plan).toBeNull()
  })

  it("lateral moves (it used to say '[object Object]')", async () => {
    const { result } = renderHook(() => useLateralMoves({ systemName: "shop", identityId: "role-1", jewelId: "cj" } as never))
    await waitFor(() => expect(result.current.error).toBe(held("Lateral moves")))
    expect(result.current.data).toBeNull()
  })
})

describe("review round 2 · the convergence hook reads through the one claim rule", () => {
  it("a tab component that passes no key still reads the page's key and the key's account", async () => {
    const { useCrownJewelConvergence } = await import("@/lib/attack-paths/use-crown-jewel-convergence")
    renderHook(() => useCrownJewelConvergence("shop", { id: "cj", name: "db", type: "RDSInstance" } as never), { wrapper: opened })
    await waitFor(() => expect(urls.some((u) => u.includes("/by-crown-jewel/summary"))).toBe(true))
    const summary = urls.find((u) => u.includes("/by-crown-jewel/summary"))!
    expect(query(summary)).toMatchObject({ customer_id: "acme", account_id: KEY_ACCOUNT, system_key: "sk-1" })
  })

  it("outside the tab (no provider, no key): the selected account only, as before", async () => {
    const { useCrownJewelConvergence } = await import("@/lib/attack-paths/use-crown-jewel-convergence")
    renderHook(() => useCrownJewelConvergence("shop", { id: "cj", name: "db", type: "RDSInstance" } as never))
    await waitFor(() => expect(urls.some((u) => u.includes("/by-crown-jewel/summary"))).toBe(true))
    const summary = urls.find((u) => u.includes("/by-crown-jewel/summary"))!
    expect(query(summary)).toMatchObject({ customer_id: "acme", account_id: SELECTED })
    expect(query(summary).system_key).toBeUndefined()
  })
})

describe("S10 (T-2) · a held reader's ACCOUNT_SCOPE_REQUIRED names the account its read carried", () => {
  const SCOPE_REQUIRED = { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are registered; name one with account_id" } }
  const named = (capability: string, account: string) =>
    `${capability}: Account ${account} was named for this read, but the server received no account (ACCOUNT_SCOPE_REQUIRED) — the account did not reach this read`
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify(SCOPE_REQUIRED), { status: 422, headers: { "content-type": "application/json" } })
    }))
  })

  it("closure preview, damage scope, lateral moves, the permission-cut plan and the report (opened by key: the key's account)", async () => {
    const closure = renderHook(() => useClosurePreview({ id: PATH_ID, attack_path_id: PATH_ID, nodes: [], crown_jewel_id: "cj" } as never), { wrapper: opened })
    const damage = renderHook(() => useDamageScope({ systemName: "shop", pathId: PATH_ID, nodeId: "n1" } as never), { wrapper: opened })
    const moves = renderHook(() => useLateralMoves({ systemName: "shop", identityId: "role-1", jewelId: "cj" } as never), { wrapper: opened })
    const report = renderHook(() => useAttackPathReport({ id: PATH_ID, attack_path_id: PATH_ID, nodes: [], edges: [] } as never), { wrapper: opened })
    const cut = renderHook(() => usePermissionCutPlan("shop"), { wrapper: opened })
    await cut.result.current.requestPlan("arn:aws:iam::1:role/r", "arn:aws:s3:::b")
    await waitFor(() => expect(closure.result.current.error).toBe(named("Closure preview", KEY_ACCOUNT)), { timeout: 4000 })
    await waitFor(() => expect(damage.result.current.error).toBe(named("Damage scope", KEY_ACCOUNT)))
    await waitFor(() => expect(moves.result.current.error).toBe(named("Lateral moves", KEY_ACCOUNT)))
    await waitFor(() => expect(report.result.current.error).toBe(named("Attack-path report", KEY_ACCOUNT)))
    await waitFor(() => expect(cut.result.current.error).toBe(named("Permission-cut plan", KEY_ACCOUNT)))
  })

  it("the foothold read, the damage-scope drawer and the convergence hook's detail read", async () => {
    const atlas = renderHook(() => useAtlasLateral({
      systemName: "shop", jewelRef: "bucket-a", enabled: true, systemKey: "sk-1", systemAccountId: KEY_ACCOUNT }))
    await waitFor(() => expect(atlas.result.current.error).toBe(named("Lateral footholds", KEY_ACCOUNT)))
    render(<DamageScopeDrawer target={{ systemName: "shop", pathId: PATH_ID, nodeId: "n1" }} open onOpenChange={() => undefined} />,
      { wrapper: opened })
    expect(await screen.findByText(named("Damage scope", KEY_ACCOUNT))).toBeInTheDocument()
    // the summary answers with one path; its detail read is refused
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const [status, body] = url.includes("/by-crown-jewel/summary")
        ? [200, { paths: [{ path_id: "p1", workload_arn: "arn:aws:lambda:x:1:function:f" }] }]
        : [422, SCOPE_REQUIRED]
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
    }))
    const { useCrownJewelConvergence } = await import("@/lib/attack-paths/use-crown-jewel-convergence")
    const conv = renderHook(() => useCrownJewelConvergence("shop", { id: "cj", name: "db", type: "RDSInstance" } as never))
    await waitFor(() => expect(conv.result.current.detailFailures).toEqual([{ pathId: "p1", error: named("Path detail", SELECTED) }]))
  })

  it("the published foothold read behind a held evaluation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const evaluate = String(input).includes("evaluate=true")
      const [status, body] = evaluate ? [503, { detail: { code: "SERVING_ROUTE_HELD", reason: "ATLAS_EVALUATION_HELD" } }] : [422, SCOPE_REQUIRED]
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
    }))
    const atlas = renderHook(() => useAtlasLateral({
      systemName: "shop", jewelRef: "bucket-a", enabled: true, systemKey: "sk-1", systemAccountId: KEY_ACCOUNT }))
    await waitFor(() => expect(atlas.result.current.error).toBe(named("Published foothold reach", KEY_ACCOUNT)))
  })

  it("the path detail read: the account it was given; none given, the default line", async () => {
    const fetchImpl = globalThis.fetch
    const withSelection = await fetchConvergencePathDetail({ url: "/d", fetchImpl, accountSelection: { selectedAccount: SELECTED } })
    expect(withSelection).toMatchObject({ ok: false, status: 422, error: named("Path detail", SELECTED) })
    const bare = await fetchConvergencePathDetail({ url: "/d", fetchImpl })
    expect(bare).toMatchObject({ ok: false, error: expect.stringMatching(/^Path detail: Several workload accounts are registered/) })
  })
})
