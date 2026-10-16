/**
 * CHROME0117-NAV1: on a page that mounts the sidebar WITHOUT onItemClick (the account page, settings pages), every
 * section item renders as a <Link>. Systems linked to /?section=systems, which HomePage deliberately ignores (it opens on
 * the dashboard), so the click from account inventory never reached Systems. The dedicated /systems route already renders
 * SystemsView when no systemName is given, so only Systems gets that route, and only in the <Link> branch.
 *
 * EXPECTED below is every menu item at FE d73b2b3d (installed 0.10.17). It was extracted by parsing that revision's
 * components/left-sidebar-nav.tsx, which yielded 20 items. Every href must stay identical except Systems; Attack Paths
 * included.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import React from "react"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : String(href)} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("next/image", () => ({ default: (props: any) => <img alt={props.alt ?? ""} /> }))
vi.mock("@/lib/scoped-system-catalog", () => ({
  // Not ready: the shared-resources badge never fetches in this test.
  useScopedSystemCatalog: () => ({ ready: false, url: null, customerId: null }),
  catalogEntries: () => [],
  selectCatalogSystem: () => ({ kind: "NOT_FOUND" }),
}))

import { LeftSidebarNav } from "@/components/left-sidebar-nav"

const EXPECTED: Array<[string, string, string]> = [
  ["home", "Home", "/"],
  ["change-queue", "Change Queue", "/change-queue"],
  ["copilot", "Cyntro Analyst", "/?section=copilot"],
  ["issues", "Issues", "/?section=issues"],
  ["least-privilege", "Resource Risk", "/?section=least-privilege"],
  ["attack-paths", "Attack Paths", "/?section=attack-paths"],
  ["business-impact", "Business Impact", "/?section=business-impact"],
  ["attack-paths-v2", "Attack Paths v2", "/attack-paths-v2"],
  ["business-systems", "System Ranking", "/business-systems"],
  ["vulnerabilities", "Vulnerabilities", "/?section=vulnerabilities"],
  ["systems", "Systems", "/?section=systems"],
  ["compliance", "Compliance", "/?section=compliance"],
  ["per-resource", "Shared Resource", "/?section=per-resource"],
  ["shared-resources", "Shared Resources V2", "/shared-resources"],
  ["dependency-map", "Observed-First Map", "/dependency-map"],
  ["network-lp", "Network LP", "/network-lp"],
  ["pending-tags", "Pending Tags", "/pending-tags"],
  ["orphan-resources", "Orphan Resources", "/orphan-resources"],
  ["automation", "Automation", "/?section=automation"],
  ["integrations", "Integrations", "/?section=integrations"],
]
const DEDICATED = new Set(["change-queue", "pending-tags", "orphan-resources", "attack-paths-v2", "business-systems",
                           "dependency-map", "shared-resources", "network-lp"])

function control(label: string): HTMLElement {
  const el = screen.getByText(label, { exact: true })
  const c = el.closest("a, button")
  if (!c) throw new Error(`no link or button around ${label}`)
  return c as HTMLElement
}

afterEach(() => cleanup())

describe("CHROME0117-NAV1: Systems navigation from pages without onItemClick", () => {
  it("links Systems to the dedicated /systems route (the account page's sidebar)", () => {
    render(<LeftSidebarNav activeItem="settings" />)
    const systems = control("Systems")
    expect(systems.tagName).toBe("A")
    expect(systems.getAttribute("href")).toBe("/systems")
  })

  it("leaves every other sidebar link byte-identical to d73b2b3d, Attack Paths included", () => {
    render(<LeftSidebarNav activeItem="settings" />)
    for (const [id, label, href] of EXPECTED) {
      if (id === "systems") continue
      const c = control(label)
      expect([id, c.tagName, c.getAttribute("href")]).toEqual([id, "A", href])
    }
  })
})

describe("HomePage's section-switcher path is unchanged", () => {
  it("renders Systems as a state button that calls onItemClick('systems')", () => {
    const onItemClick = vi.fn()
    render(<LeftSidebarNav activeItem="home" onItemClick={onItemClick} />)
    const systems = control("Systems")
    expect(systems.tagName).toBe("BUTTON")
    expect(systems.getAttribute("href")).toBeNull()
    fireEvent.click(systems)
    expect(onItemClick).toHaveBeenCalledWith("systems")
    expect(document.querySelector('a[href="/systems"]')).toBeNull()
  })

  it("keeps every other item's button / dedicated-route link exactly as before", () => {
    render(<LeftSidebarNav activeItem="home" onItemClick={() => {}} />)
    for (const [id, label, href] of EXPECTED) {
      const c = control(label)
      if (DEDICATED.has(id)) {
        expect([id, c.tagName, c.getAttribute("href")]).toEqual([id, "A", href])
      } else {
        expect([id, c.tagName]).toEqual([id, "BUTTON"])
      }
    }
  })
})
