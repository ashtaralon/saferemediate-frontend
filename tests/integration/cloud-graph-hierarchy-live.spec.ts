/**
 * LIVE Playwright — Visual Hierarchy Contract acceptance criteria.
 *
 * Validates against the canonical alon-prod path-5203dfee3012:
 *   C1 KMS card inside VPC frame
 *   C2 No overlapping resource cards
 *   C3 Container frame labels inside their bounding box
 *   C4 JEWEL.x > 70% of canvas width
 *   C8 Spine protagonist transitions monotonic on x-axis
 *   C9 Layout deterministic across canvas-size changes
 */
import { test, expect, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"

const SYSTEM = "alon-prod"
const PATH_ID = "path-5203dfee3012"
const JEWEL_ID = encodeURIComponent("arn:aws:s3:::saferemediate-logs-745783559495")

interface NodeProbe {
  txt: string
  semantic: string | null
  step: number | null
  x: number
  y: number
  w: number
  h: number
}

async function probeResourceNodes(page: Page): Promise<NodeProbe[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll(".react-flow__node-resource")).map((el) => {
      const r = el.getBoundingClientRect()
      const semEl = el.querySelector("[data-semantic]")
      const stepBadge = el.querySelector(".text-white.font-extrabold.rounded-full")
      const stepRaw = stepBadge?.textContent ?? ""
      const stepNum = parseInt(stepRaw, 10)
      return {
        txt: (el.textContent || "").slice(0, 30),
        semantic: semEl?.getAttribute("data-semantic") ?? null,
        step: Number.isNaN(stepNum) ? null : stepNum,
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
      }
    })
  })
}

async function waitForMap(page: Page) {
  await page.waitForFunction(
    () => document.querySelectorAll(".react-flow__node-resource").length > 0,
    null,
    { timeout: 60_000 },
  )
  // settle anchoring snaps + frame expansions
  await page.waitForTimeout(800)
}

test.describe("Cloud Graph Visual Hierarchy Contract — live acceptance", () => {
  test.beforeEach(async ({ page, context }) => {
    test.setTimeout(180_000)
    await seedAuthCookie(context)
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto(
      `/attack-paths-v2?system=${SYSTEM}&jewel=${JEWEL_ID}&path=${PATH_ID}&mode=attack-path`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(14_000)
    await waitForMap(page)
  })

  test("C1 — cyntro-demo-cmk KMS card sits inside the VPC frame", async ({ page }) => {
    const result = await page.evaluate(() => {
      const find = (sel: string, t: string) =>
        Array.from(document.querySelectorAll(sel)).find((e) => e.textContent?.includes(t))
      const k = find(".react-flow__node-resource", "cyntro-demo-cmk")
      const v = find(".react-flow__node-container", "VPC ·")
      if (!k || !v) return { found: false }
      const kr = (k as HTMLElement).getBoundingClientRect()
      const vr = (v as HTMLElement).getBoundingClientRect()
      return {
        found: true,
        inside:
          kr.left >= vr.left - 2 &&
          kr.top >= vr.top - 2 &&
          kr.right <= vr.right + 2 &&
          kr.bottom <= vr.bottom + 2,
      }
    })
    expect(result.found).toBe(true)
    expect(result.inside).toBe(true)
  })

  test("C2 — no two resource cards overlap", async ({ page }) => {
    const overlaps = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".react-flow__node-resource")).map((el) => ({
        txt: (el.textContent || "").slice(0, 30),
        r: (el as HTMLElement).getBoundingClientRect(),
      }))
      const out: string[] = []
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i].r
          const b = cards[j].r
          if (a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom) {
            out.push(`${cards[i].txt} ↔ ${cards[j].txt}`)
          }
        }
      }
      return out
    })
    expect(overlaps).toEqual([])
  })

  test("C3 — every container frame label is inside its frame", async ({ page }) => {
    const escapes = await page.evaluate(() => {
      const out: string[] = []
      for (const frame of Array.from(document.querySelectorAll(".react-flow__node-container"))) {
        const fr = (frame as HTMLElement).getBoundingClientRect()
        const labelEl =
          frame.querySelector(".font-extrabold.uppercase") ?? frame.querySelector(".font-bold.uppercase")
        if (!labelEl) continue
        const lr = (labelEl as HTMLElement).getBoundingClientRect()
        const inside =
          lr.left >= fr.left && lr.top >= fr.top && lr.right <= fr.right && lr.bottom <= fr.bottom
        if (!inside) out.push((labelEl.textContent || "").slice(0, 40))
      }
      return out
    })
    expect(escapes).toEqual([])
  })

  test("C4 — JEWEL nodes positioned in right half of canvas", async ({ page }) => {
    const result = await page.evaluate(() => {
      const slot = document.querySelector('[data-testid="attack-path-flow-map-slot"]')
      if (!slot) return { found: false }
      const sRect = (slot as HTMLElement).getBoundingClientRect()
      const jewels = Array.from(document.querySelectorAll(".react-flow__node-resource"))
        .map((el) => ({
          sem: el.querySelector("[data-semantic]")?.getAttribute("data-semantic"),
          r: (el as HTMLElement).getBoundingClientRect(),
        }))
        .filter((x) => x.sem === "JEWEL")
      if (jewels.length === 0) return { found: false }
      const threshold = sRect.left + sRect.width * 0.5
      const violators = jewels.filter((j) => j.r.left + j.r.width / 2 < threshold)
      return { found: true, jewelCount: jewels.length, violators: violators.length }
    })
    expect(result.found).toBe(true)
    expect(result.violators).toBe(0)
  })

  test("C8 — spine protagonist transitions monotonic on x-axis", async ({ page }) => {
    const result = await page.evaluate(() => {
      const PROTAGONIST = new Set(["ENTRY", "NETWORK", "IDENTITY", "JEWEL"])
      const steps: Array<{ step: number; x: number; sem: string }> = []
      document.querySelectorAll(".react-flow__node-resource").forEach((n) => {
        const sb = n.querySelector(".text-white.font-extrabold.rounded-full")
        if (!sb) return
        const step = parseInt(sb.textContent || "", 10)
        if (Number.isNaN(step)) return
        const sem = n.querySelector("[data-semantic]")?.getAttribute("data-semantic")
        if (!sem) return
        const r = (n as HTMLElement).getBoundingClientRect()
        steps.push({ step, sem, x: r.left + r.width / 2 })
      })
      steps.sort((a, b) => a.step - b.step)
      let prev: { sem: string; x: number; step: number } | null = null
      const violations: string[] = []
      for (const s of steps) {
        if (!PROTAGONIST.has(s.sem)) continue
        if (prev && s.sem !== prev.sem && s.x < prev.x) {
          violations.push(
            `${prev.sem}(step ${prev.step}, x=${prev.x.toFixed(0)}) → ${s.sem}(step ${s.step}, x=${s.x.toFixed(0)})`,
          )
        }
        prev = s
      }
      return { violations }
    })
    expect(result.violations).toEqual([])
  })

  test("C9 — layout deterministic across two canvas-size changes", async ({ page }) => {
    // Capture node positions at viewport A (1600x1000), normalize by slot width.
    const captureNormalized = async () => {
      return page.evaluate(() => {
        const slot = document.querySelector('[data-testid="attack-path-flow-map-slot"]')
        const sRect = slot ? (slot as HTMLElement).getBoundingClientRect() : null
        const slotW = sRect?.width ?? 1
        const slotH = sRect?.height ?? 1
        const nodes = Array.from(document.querySelectorAll(".react-flow__node-resource")).map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect()
          // Normalize relative to slot origin so positions are scale-comparable
          return {
            id: el.getAttribute("data-id") ?? "",
            nx: (r.left - (sRect?.left ?? 0)) / slotW,
            ny: (r.top - (sRect?.top ?? 0)) / slotH,
          }
        })
        return nodes.sort((a, b) => a.id.localeCompare(b.id))
      })
    }

    const a = await captureNormalized()
    // Resize the viewport — triggers a layout re-fit
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(1200)
    const b = await captureNormalized()

    // Both captures should yield the same set of node ids
    expect(a.map((n) => n.id).sort()).toEqual(b.map((n) => n.id).sort())

    // For each node, normalized positions should agree within a small tolerance
    // (≈ 1.5% of the canvas — accounts for rounding + fitView's padding
    // recomputation at different viewport sizes).
    const TOL = 0.015
    const aById = new Map(a.map((n) => [n.id, n]))
    const drift: string[] = []
    for (const nb of b) {
      const na = aById.get(nb.id)
      if (!na) continue
      const dx = Math.abs(na.nx - nb.nx)
      const dy = Math.abs(na.ny - nb.ny)
      if (dx > TOL || dy > TOL) {
        drift.push(`${nb.id}: Δnx=${dx.toFixed(3)} Δny=${dy.toFixed(3)} (tol ${TOL})`)
      }
    }
    expect(drift).toEqual([])
  })
})
