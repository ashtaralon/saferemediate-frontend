/**
 * QA-10 (rehearsal.32): on a 1512x827 window the Add AWS account dialog's footer sat below the fold and could not be
 * reached -- a fixed overlay that CENTRES its card clips whatever is taller than the window (overflow-y: visible).
 * Every Settings / account dialog overlay is therefore scroll-safe: top-aligned, the overlay scrolls, and the card centres
 * itself with my-auto only while it fits. A side drawer scrolls its own body instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOTS = ["app/settings", "app/accounts", "components/settings", "components/accounts"]

function tsxFiles(dir: string): string[] {
  const abs = resolve(process.cwd(), dir)
  return readdirSync(abs).flatMap((name) => {
    const path = join(abs, name)
    if (statSync(path).isDirectory()) return tsxFiles(join(dir, name))
    return name.endsWith(".tsx") ? [join(dir, name)] : []
  })
}

const overlays = ROOTS.flatMap(tsxFiles).flatMap((file) => {
  const text = readFileSync(resolve(process.cwd(), file), "utf8")
  return [...text.matchAll(/className="(fixed inset-0[^"]*)"/g)].map((m) => ({ file, className: m[1], at: m.index ?? 0, text }))
})

describe("Settings and account dialogs never clip their footer", () => {
  it("finds the overlays it guards (the Add, confirm, remove, group and journey dialogs)", () => {
    expect(overlays.length).toBeGreaterThanOrEqual(7)
  })

  it.each(overlays.map((o) => [`${o.file}@${o.at}`, o] as const))("%s is scroll-safe", (_name, o) => {
    if (o.className.includes("justify-end")) {
      // a drawer: full height, its body scrolls
      expect(o.text.slice(o.at, o.at + 1500)).toMatch(/flex-1[^"]*overflow-y-auto|overflow-y-auto[^"]*flex-1/)
      return
    }
    expect(o.className).not.toMatch(/\bitems-center\b/)
    expect(o.className).toMatch(/\boverflow-y-auto\b/)
    expect(o.className).toMatch(/\bitems-start\b/)
    // the card right inside centres itself only while it fits
    expect(o.text.slice(o.at, o.at + 600)).toMatch(/<(div|aside)[^>]*className="my-auto /)
  })
})
