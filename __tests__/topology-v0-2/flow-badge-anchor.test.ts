import { describe, expect, it } from "vitest"
import { flowBadgeAnchor } from "@/components/topology-v0-2/aws-frame"

type Rect = { l: number; t: number; r: number; b: number; cx: number; cy: number }
const rect = (l: number, t: number, w: number, h: number): Rect => ({ l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 })
const inside = (p: { x: number; y: number }, r: Rect) => p.x >= r.l && p.x <= r.r && p.y >= r.t && p.y <= r.b

// The C1 public subnet cell (QA run 34661856217): the NAT chip sits at the top
// of the cell with the web instance right under it; the app instance in the
// private subnet below is the egress source, the IGW is up in the boundary column.
const nat = rect(80, 508, 200, 16)
const web = rect(180, 526, 40, 40)
const app = rect(270, 612, 40, 40)
const igw = rect(858, 364, 130, 14)

describe("flowBadgeAnchor", () => {
  it("keeps an egress badge above its source chip even when the line legs through the NAT", () => {
    const firstLeg = [
      { x: app.cx, y: app.t },
      { x: app.cx, y: nat.b },
    ]
    const p = flowBadgeAnchor({ cls: "egress", src: app, legTarget: nat, laneX: null, firstLegPts: firstLeg })
    expect(p).toEqual({ x: app.cx, y: app.t - 16 })
    expect(inside(p, nat)).toBe(false)
    expect(inside(p, web)).toBe(false)
  })

  it("is the same anchor a hopless egress edge gets, so the corridor bundle keeps its place", () => {
    const hopless = flowBadgeAnchor({ cls: "egress", src: app, legTarget: igw, laneX: null, firstLegPts: [] })
    const hopped = flowBadgeAnchor({ cls: "egress", src: app, legTarget: nat, laneX: null, firstLegPts: [] })
    expect(hopped).toEqual(hopless)
  })

  it("puts a corridor leg's badge beside the source on the side the leg leaves from", () => {
    const right = flowBadgeAnchor({ cls: "edge_service", src: app, legTarget: igw, laneX: 700, firstLegPts: [] })
    expect(right).toEqual({ x: app.r + 16, y: app.cy })
    const leftTarget = rect(10, 612, 40, 40)
    const left = flowBadgeAnchor({ cls: "edge_service", src: app, legTarget: leftTarget, laneX: 60, firstLegPts: [] })
    expect(left).toEqual({ x: app.l - 16, y: app.cy })
  })

  it("takes the midpoint of the FIRST leg only for a plain hopped edge, never a boundary leg", () => {
    const firstLeg = [
      { x: app.r, y: app.cy },
      { x: 400, y: app.cy },
      { x: 400, y: nat.cy },
      { x: nat.l, y: nat.cy },
    ]
    const p = flowBadgeAnchor({ cls: "internal", src: app, legTarget: nat, laneX: null, firstLegPts: firstLeg })
    // Longest segment of the first leg is the vertical run at x=400.
    expect(p).toEqual({ x: 400, y: (app.cy + nat.cy) / 2 })
    expect(inside(p, nat)).toBe(false)
    expect(inside(p, igw)).toBe(false)
  })
})
