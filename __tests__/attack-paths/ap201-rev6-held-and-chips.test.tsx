/**
 * AP201 Rev 6 §3.12 / §4.4 · the views the install cannot fully serve say so, in the server's words.
 *
 * The held body is the backend's own shape (cyntro_data/semantic/estate_read.py `held_route_refusal`: 503
 * `{"detail": {"code": "SERVING_ROUTE_HELD", "reason": ..., "read_model": ...}}`); the footholds evaluate=true hold is
 * `READ_MODEL_MISSING` on `jewel_footholds.atlas_evaluation` (api/attack_paths.py get_jewel_footholds). CONSTRUCTED
 * candidates only; nothing here is a product fixture.
 */
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useAtlasLateral } from "@/components/attack-paths-v2/use-atlas-lateral"
import { AtlasLateralLensPanel } from "@/components/attack-paths-v2/atlas-lateral-lens"
import { ExfilPathListColumn } from "@/components/attack-paths-v2/exfil-path-list-column"
import { buildModeBarTabs } from "@/components/attack-paths-v2/mode-bar-tabs"
import { heldRouteMessage } from "@/lib/attack-paths/held-route-message"

const HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "READ_MODEL_MISSING", read_model: "jewel_footholds.atlas_evaluation" } }
const ROUTE_HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } }
const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const CANDIDATE = { workload_id: "i-1", workload_name: "web-1", workload_type: "EC2Instance", foothold_likelihood: "UNKNOWN", foothold_reasons: [] }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Lateral: a held live evaluation shows the published reach and says evaluation is held", () => {
  it("falls back to evaluate=false on SERVING_ROUTE_HELD and exposes the server's reason; no error, no '[object Object]'", async () => {
    const urls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.includes("evaluate=true")) return respond(503, HELD)
      if (url.includes("evaluate=false")) return respond(200, { candidates: [CANDIDATE] })
      return respond(404, {})
    }))
    const { result } = renderHook(() => useAtlasLateral({ systemName: "payments", jewelRef: "arn:aws:s3:::acme-data", enabled: true }))
    await waitFor(() => expect(result.current.candidatesLoading).toBe(false))
    expect(result.current.evaluationHeld).toBe("SERVING_ROUTE_HELD: READ_MODEL_MISSING")
    expect(result.current.candidates.map((c) => c.workload_id)).toEqual(["i-1"])
    expect(result.current.error).toBeNull()
    expect(urls.filter((u) => u.includes("jewel-footholds")).map((u) => new URL(u, "http://x").searchParams.get("evaluate"))).toEqual(["true", "false"])
    // no foothold is "recommended" without the evaluation, and no live search starts on the operator's behalf
    expect(result.current.selectedFootholdId).toBeNull()
    expect(urls.some((u) => u.includes("/atlas/search/"))).toBe(false)
  })

  it("control: a served evaluation is not labelled held", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, { candidates: [CANDIDATE], evaluation: { evaluated: 1 } })))
    const { result } = renderHook(() => useAtlasLateral({ systemName: "payments", jewelRef: "arn:aws:s3:::acme-data", enabled: true }))
    await waitFor(() => expect(result.current.candidatesLoading).toBe(false))
    expect(result.current.evaluationHeld).toBeNull()
  })

  it("an untyped failure is a readable error, never an object rendered as text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(500, { detail: { nested: true } })))
    const { result } = renderHook(() => useAtlasLateral({ systemName: "payments", jewelRef: "arn:aws:s3:::acme-data", enabled: true }))
    await waitFor(() => expect(result.current.candidatesLoading).toBe(false))
    expect(result.current.error).toBe("Lateral footholds could not be read (HTTP 500).")
  })

  it("the panel says evaluation is held and that no result is not 'no lateral movement'", async () => {
    await act(async () => {
      render(<AtlasLateralLensPanel candidates={[CANDIDATE as never]} selectedFootholdId={null} selectedFoothold={null}
        response={null} evaluation={null} candidatesLoading={false} simulationLoading={false} error={null}
        evaluationHeld="SERVING_ROUTE_HELD: READ_MODEL_MISSING" onSelectFoothold={() => undefined} onRetry={() => undefined} />)
    })
    expect(screen.getByTestId("atlas-lateral-evaluation-held").textContent).toMatch(
      /^Lateral evaluation is held on this install; published reach shown\. No result here means not evaluated, never “no lateral movement”\./)
  })
})

describe("Exfiltration: aggregate, not bound to the selected compute; empty is not 'no exfiltration'", () => {
  it("labels the rail aggregate when paths exist and when none exist", () => {
    render(<ExfilPathListColumn paths={[]} selectedPathId={null} onSelectPath={() => undefined} jewelName="acme-data" />)
    expect(screen.getByTestId("exfil-aggregate-binding").textContent).toBe("Jewel-wide destinations (aggregate). Not bound to the selected compute.")
    expect(screen.getByTestId("exfil-rail-empty").textContent).toMatch(/not a “no\s+exfiltration” verdict/)
    expect(document.body.textContent).not.toMatch(/No exfil paths surfaced/)
  })

  it("the two chip titles say what the view is on an install", () => {
    const tabs = Object.fromEntries(buildModeBarTabs().map((t) => [t.key, t]))
    expect(tabs.lateral.title).toMatch(/published reach is shown and labelled/)
    expect(tabs.exfil.title).toMatch(/^Jewel-wide destinations \(aggregate\)\. Not bound to the selected compute\./)
    expect(buildModeBarTabs().some((t) => /beta/i.test(t.label))).toBe(false)
  })
})

describe("Held routes say 'not available on this install' with the server's reason (§4.4)", () => {
  it("a SERVING_ROUTE_HELD body names the capability as not available, never a result", () => {
    for (const capability of ["Damage scope", "Business impact", "Closure preview", "Permission-cut plan"]) {
      const line = heldRouteMessage(ROUTE_HELD, 503, capability)
      expect(line).toBe(`${capability} is not available on this install (SERVING_ROUTE_HELD: HELD_CUSTOMER_READ). This is not a result.`)
      expect(line).not.toMatch(/no damage|no excess|no exposure|\[object/i)
    }
  })

  it("other typed answers and plain bodies keep the server's words; nothing renders an object", () => {
    expect(heldRouteMessage({ detail: { code: "SEMANTIC_READ_UNAVAILABLE", reason: "store" } }, 503, "Damage scope"))
      .toBe("Damage scope: Unavailable — SEMANTIC_READ_UNAVAILABLE: store")
    expect(heldRouteMessage({ detail: "Attack path p1 not found" }, 404, "Damage scope")).toBe("Attack path p1 not found")
    expect(heldRouteMessage({ detail: { x: 1 } }, 500, "Damage scope")).toBe("Damage scope could not be read (HTTP 500).")
  })

  it("the damage-scope hook surfaces the held message, not an object", async () => {
    const { useDamageScope } = await import("@/components/attack-paths-v2/use-damage-scope")
    vi.stubGlobal("fetch", vi.fn(async () => respond(503, ROUTE_HELD)))
    const { result } = renderHook(() => useDamageScope({ systemName: "payments", pathId: "p1", nodeId: "n1" }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe("Damage scope is not available on this install (SERVING_ROUTE_HELD: HELD_CUSTOMER_READ). This is not a result.")
    expect(result.current.data).toBeNull()
  })
})
