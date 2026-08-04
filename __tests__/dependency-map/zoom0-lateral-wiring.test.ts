/** Wiring guard — Lateral runs ATLAS from any selected compute foothold. */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const PANEL = "components/attack-paths-v2/zoom0-fan-in-panel.tsx"
const HOOK = "components/attack-paths-v2/use-atlas-lateral.ts"
const FULL_VIEW = "components/attack-paths-v2/atlas-lateral-view.tsx"
const SHELL = "components/attack-paths-v2/attack-paths-v2.tsx"
const PROXY = "app/api/proxy/attack-paths/[systemName]/jewel-footholds/route.ts"

const read = (p: string) =>
  readFileSync(join(ROOT, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

describe("Zoom0 Lateral wiring", () => {
  it("uses the ATLAS foothold lens rather than a pinned current-access path", () => {
    const src = read(PANEL)
    expect(src).toContain("useAtlasLateral")
    expect(src).toContain("AtlasLateralLensPanel")
    expect(src).toContain("AtlasLateralChainCanvas")
    expect(src).not.toContain("resolveZoom0LateralIdentity")
    expect(src).not.toContain('"zoom0-lateral-tfm"')
  })

  it("enumerates graph compute then invokes canonical ATLAS", () => {
    const src = read(HOOK)
    expect(src).toContain("jewel-footholds")
    expect(src).toContain("evaluate=true")
    expect(src).toContain("recommended_candidate_id")
    expect(src).toContain("recommended_simulation")
    expect(src).toContain("/api/proxy/atlas/search/")
    expect(src).toContain("start_node_id: selectedFootholdId")
    expect(src).toContain("target_node_id: jewelRef")
  })

  it("forwards bounded evaluation controls through the Next proxy", () => {
    const src = read(PROXY)
    expect(src).toContain('"evaluate"')
    expect(src).toContain('"evaluation_limit"')
    expect(src).toContain('"evaluation_budget_ms"')
    expect(src).toContain('"max_hops"')
    expect(src).toContain("backendParams.set")
  })

  it("does not require a pinned current-access path", () => {
    const src = read(PANEL)
    expect(src).toContain('detailsPanel === "lateral"')
    expect(src).not.toContain("lateralIdentity.status")
    expect(src).not.toContain("Pin a path to choose the initial breach")
  })

  it("uses the same foothold-first ATLAS model in the full Lateral tab", () => {
    const view = read(FULL_VIEW)
    const shell = read(SHELL)
    expect(view).toContain("useAtlasLateral")
    expect(view).toContain("AtlasLateralLensPanel")
    expect(view).toContain("AtlasLateralChainCanvas")
    expect(read("components/attack-paths-v2/atlas-lateral-flow-map.tsx")).toContain("<ReactFlow")
    expect(shell).toContain("<AtlasLateralView")
    expect(shell).not.toContain("<LateralMovementPanel")
  })
})
