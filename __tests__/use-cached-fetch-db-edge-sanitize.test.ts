/**
 * Render-boundary DB-edge engine gate (mirrors backend #407). A cached
 * pre-#407 payload can resurface an impossible edge like :3306 to a Postgres
 * RDS via localStorage SWR; sanitizePhantomEdges must drop it, independent of
 * cache age — while keeping legit edges, port-less QUERIES_DB, and unknown
 * engines.
 */
import { sanitizePhantomEdges } from "@/lib/use-cached-fetch"

function payload(edges: unknown[]) {
  return { traffic_edges: edges }
}

describe("sanitizePhantomEdges — impossible DB engine/port", () => {
  it("drops :3306 to a Postgres target (the RDS·3306 phantom)", () => {
    const { cleaned, dropped } = sanitizePhantomEdges(
      payload([
        { edge_class: "database", engine: "postgres", port: 3306, target_id: "x:db:pg" },
        { edge_class: "database", engine: "postgres", port: 5432, target_id: "x:db:pg" },
      ]),
    )
    expect(dropped).toBe(1)
    const kept = (cleaned as any).traffic_edges
    expect(kept).toHaveLength(1)
    expect(kept[0].port).toBe(5432)
  })

  it("keeps the canonical engine port (5432 → postgres)", () => {
    const { dropped } = sanitizePhantomEdges(
      payload([{ edge_class: "database", engine: "aurora-postgresql", port: 5432 }]),
    )
    expect(dropped).toBe(0)
  })

  it("keeps port-less QUERIES_DB edges", () => {
    const { dropped } = sanitizePhantomEdges(
      payload([{ edge_class: "database", engine: "postgres", port: null, protocol: "QUERIES_DB" }]),
    )
    expect(dropped).toBe(0)
  })

  it("keeps edges with an unknown engine (can't judge)", () => {
    const { dropped } = sanitizePhantomEdges(
      payload([{ edge_class: "database", engine: "neptune", port: 8182 }]),
    )
    expect(dropped).toBe(0)
  })

  it("drops :5432 to a MySQL target", () => {
    const { dropped } = sanitizePhantomEdges(
      payload([{ edge_class: "database", engine: "mysql", port: 5432 }]),
    )
    expect(dropped).toBe(1)
  })

  it("ignores non-database edges", () => {
    const { dropped } = sanitizePhantomEdges(
      payload([{ edge_class: "network", port: 3306, source: "a", target: "b" }]),
    )
    expect(dropped).toBe(0)
  })
})
