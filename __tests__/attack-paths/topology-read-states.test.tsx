/**
 * AP195 · TopologyAttackGraph over each state the convergence hook can hand it, including the one a mounted page passes
 * through too fast to observe: the render before the hook's effect starts a read (data, error and loading all empty for
 * a target that is NOT catalog-settled). That is a read not started yet: loading, never "convergence API unavailable"
 * and never "No paths available.". The catalog-settled target in the same hook state is the catalog's conclusion, and a
 * failed read keeps its error and Retry.
 *
 * Real: TopologyAttackGraph, the target-catalog adapter, hasAuthoritativeZeroPaths (the hook module's own, via
 * importOriginal). Stubbed: the hook's RESULT (useCrownJewelConvergence) and useAwsTopology. Catalog rows are the
 * captured section's (__tests__/fixtures/ap182-lifecycle); hook states are CONSTRUCTED per case.
 */
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import capturedSection from "@/__tests__/fixtures/ap182-lifecycle/target-catalog-section.json"
import type { TargetCatalogEntry } from "@/lib/attack-paths/target-catalog"
import { targetEntryToJewelSummary } from "@/lib/attack-paths/target-catalog"

const hook = vi.hoisted(() => ({
  state: { data: null as unknown, loading: false, error: null as string | null },
  retry: () => undefined,
}))
vi.mock("@/lib/attack-paths/use-crown-jewel-convergence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/attack-paths/use-crown-jewel-convergence")>()),
  useCrownJewelConvergence: () => ({ ...hook.state, retry: hook.retry }),
}))
vi.mock("@/lib/attack-paths/use-aws-topology", () => ({ useAwsTopology: () => ({ data: null, error: "http_404" }) }))

import { TopologyAttackGraph } from "@/components/attack-map/topology-attack-graph"

afterEach(cleanup)

const TARGETS = (capturedSection as unknown as { targets: TargetCatalogEntry[] }).targets
const jewelOf = (name: string) => targetEntryToJewelSummary(TARGETS.find((t) => t.name === name)!)

function mount(name: string, state: typeof hook.state) {
  hook.state = state
  const jewel = jewelOf(name)
  render(<TopologyAttackGraph systemName="Orders" initialJewel={jewel} jewels={[jewel]} />)
  return screen.getByTestId("topology-attack-graph")
}

describe("TopologyAttackGraph keeps each read state its own (AP195)", () => {
  it("captured bucket-1 (lists a path), the read not started yet: loading in the center and the rail", () => {
    const graph = mount("bucket-1", { data: null, loading: false, error: null })
    expect(within(graph).queryByText("convergence API unavailable")).toBeNull()
    expect(within(graph).queryByText("No paths available.")).toBeNull()
    expect(within(graph).getByText("Loading topology…")).toBeInTheDocument()
    expect(within(graph).getByText("Loading paths…")).toBeInTheDocument()
    expect(within(graph).queryByRole("button", { name: /Retry/ })).toBeNull()
  })

  it("captured bucket-1, the read in flight: loading", () => {
    const graph = mount("bucket-1", { data: null, loading: true, error: null })
    expect(within(graph).getByText("Loading topology…")).toBeInTheDocument()
    expect(within(graph).getByText("Loading paths…")).toBeInTheDocument()
  })

  it("CONTROL: captured bucket-1, the read failed: its error and Retry, the rail says unavailable", () => {
    const graph = mount("bucket-1", { data: null, loading: false, error: "Backend busy (502)" })
    expect(within(graph).getByText("Backend busy (502)")).toBeInTheDocument()
    expect(within(graph).getByRole("button", { name: /Retry/ })).toBeInTheDocument()
    expect(within(graph).getByText("Paths unavailable — see canvas.")).toBeInTheDocument()
    expect(within(graph).queryByText("Loading paths…")).toBeNull()
  })

  it("captured empty-bucket (catalog-settled) in the same empty hook state: the catalog's conclusion, no loading", () => {
    const graph = mount("empty-bucket", { data: null, loading: false, error: null })
    expect(within(graph).queryByText("convergence API unavailable")).toBeNull()
    expect(within(graph).queryByText("Loading topology…")).toBeNull()
    expect(within(graph).getByTestId("topology-catalog-conclusion")).toHaveTextContent("Current-access coverage incomplete")
    expect(within(graph).getByTestId("topology-path-rail-state")).toHaveTextContent("+1 held, not counted")
  })
})
