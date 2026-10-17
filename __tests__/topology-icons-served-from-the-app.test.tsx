// @vitest-environment happy-dom
/**
 * The map's icons are served by THIS app, never fetched from a CDN, and a card whose icon file
 * does not load shows the in-app glyph -- a customer-resident install runs in a VPC that reaches
 * nothing outside the customer's account.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import path from "node:path"
import React from "react"
import { describe, expect, it } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { __catalogForTest, awsIconUrl, awsIconSlug } from "@/components/topology-v0-2/aws-architecture-icons"

const ROOT = path.resolve(__dirname, "..")

describe("icon URLs", () => {
  it("are same-origin paths under /aws-icons, for every catalog type with a slug", () => {
    const { CATALOG, ICON_PATH } = __catalogForTest
    expect(ICON_PATH).toBe("/aws-icons")
    let checked = 0
    for (const type of Object.keys(CATALOG)) {
      const slug = awsIconSlug(type)
      const url = awsIconUrl(type)
      if (slug === null) {
        expect(url).toBeNull()
        continue
      }
      checked += 1
      expect(url).toBe(`/aws-icons/${slug}.svg`)
      expect(url).not.toMatch(/^https?:/)
    }
    expect(checked).toBeGreaterThan(40)
  })

  it("no source under app/, components/, lib/ or hooks/ reaches the icon CDN at runtime", () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
          const text = readFileSync(full, "utf8")
          // the string may be named in a comment (where the icons come from); never in code
          const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
          if (/thesvg\.org/.test(code)) offenders.push(path.relative(ROOT, full))
        }
      }
    }
    for (const dir of ["app", "components", "lib", "hooks"]) walk(path.join(ROOT, dir))
    expect(offenders).toEqual([])
  })

  it("the vendoring gate names every slug the catalog names", () => {
    const script = readFileSync(path.join(ROOT, "scripts/check-aws-icons-vendored.mjs"), "utf8")
    expect(script).toContain('"public/aws-icons"')
    expect(script).toContain("process.exit(1)")
    const dockerfile = readFileSync(path.join(ROOT, "Dockerfile.customer-pilot"), "utf8")
    expect(dockerfile).toContain("RUN node scripts/check-aws-icons-vendored.mjs")
    // and if the icons are vendored, they are the catalog's
    const dir = path.join(ROOT, "public/aws-icons")
    if (existsSync(dir)) {
      const present = new Set(readdirSync(dir).filter((n) => n.endsWith(".svg")).map((n) => n.slice(0, -4)))
      const slugs = new Set(Object.keys(__catalogForTest.CATALOG).map(awsIconSlug).filter(Boolean) as string[])
      for (const slug of slugs) expect(present.has(slug), `${slug}.svg`).toBe(true)
    }
  })
})

describe("a card whose icon file does not load", () => {
  it("shows the in-app glyph for the type instead of a broken image", async () => {
    const mod = await import("@/components/topology-v0-2/aws-frame")
    const OfficialIcon = (mod as unknown as { __OfficialIconForTest: (p: { url: string; type: string | null }) => React.ReactElement })
      .__OfficialIconForTest
    expect(typeof OfficialIcon).toBe("function")
    const { container } = render(<OfficialIcon url="/aws-icons/aws-amazon-ec2.svg" type="EC2" />)
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.getAttribute("src")).toBe("/aws-icons/aws-amazon-ec2.svg")
    fireEvent.error(img!)
    expect(container.querySelector("img")).toBeNull()
    const fallback = container.querySelector("[data-icon-fallback]")
    expect(fallback).not.toBeNull()
    expect(fallback!.getAttribute("data-icon-fallback")).toBe("EC2")
    expect(fallback!.querySelector("svg")).not.toBeNull()
  })
})
