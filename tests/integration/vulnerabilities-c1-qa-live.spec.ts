/**
 * LIVE QA — Risk › Vulnerabilities on a deployed frontend (C1 by default)
 * against the real graph. Not deterministic on purpose: it reads whatever the
 * deployed backend serves and reports it. The deterministic behaviour of the
 * tab lives in __tests__/cve-management-phase2.test.tsx and friends.
 *
 * Two probes. Each prints `C1QA <name> <json>` lines on stdout (the dispatch
 * workflow's log is the written report) and attaches the same JSON plus
 * screenshots to the Playwright report:
 *   1. the vulnerability-map proxy: the payload the tab is built from — the
 *      summary counts, the coverage block, every node's coverage state and
 *      finding totals — plus the scanner-refresh capability and one resource
 *      detail read;
 *   2. the tab in Chromium, reached the way an operator reaches it
 *      (/?system=<name>&vulnerability_focus=1 → Risk › Vulnerabilities): the
 *      KPI row, the evidence banner, every sub-tab (Prioritized, Assets, CVEs,
 *      Map, Remediated) and the evidence drawer, with console and page errors
 *      and every vulnerability-map proxy response recorded.
 *
 * Auth is the site cookie (./live-auth). Vercel-auth protected previews are
 * out of scope: a share token would land in a public workflow log.
 *
 *   FRONTEND_URL=https://cyntro-c1.vercel.app C1_SYSTEM=testbed-webshop \
 *     npx playwright test tests/integration/vulnerabilities-c1-qa-live.spec.ts
 */
import fs from "node:fs"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { authedApi, liveGetWithRetry, seedAuthCookie } from "./live-auth"

const SYSTEM = process.env.C1_SYSTEM || "testbed-webshop"
const MAP_PATH = `/api/proxy/vulnerability-map/${encodeURIComponent(SYSTEM)}?include_traffic=false`
const SCANNER_PATH = "/api/proxy/vulnerability-map/scanner/sync"
const TAB_URL = `/?system=${encodeURIComponent(SYSTEM)}&vulnerability_focus=1`
const KPI_IDS = ["exploitable-now", "exploitable-after-foothold", "blocked-by-controls", "coverage-gaps"] as const
const LIST_TABS = ["Assets", "CVEs", "Remediated"] as const

interface MapNodeVulnerabilities {
  total_cves?: number | null
  critical?: number | null
  high?: number | null
  medium?: number | null
  low?: number | null
  untriaged?: number | null
  exploits_available?: boolean | null
  highest_cvss?: number | null
  top_cves?: string[]
  software_affected?: string[]
  patch_urgency?: string | null
  exposed_ports?: number[]
  coverage?: string
  coverage_reason?: string | null
}
interface MapNode {
  id?: string
  name?: string
  type?: string
  is_public?: boolean
  security_groups?: string[]
  vulnerabilities?: MapNodeVulnerabilities
}
interface MapPayload {
  system_name?: string
  timestamp?: string
  total_resources?: number | null
  vulnerable_resources?: number | null
  total_cves?: number | null
  critical_cves?: number | null
  resources_needing_patches?: number | null
  nodes?: MapNode[]
  coverage?: Record<string, unknown>
  fromStaleCache?: boolean
  staleReason?: string
  findings?: unknown[]
  vulnerability_findings?: unknown[]
  assessments?: unknown[]
  cve_assessments?: unknown[]
}
interface ResourceDetail {
  summary?: { coverage?: string; coverage_reason?: string | null; total_cves?: number | null }
  cves?: unknown[]
  port_exposure?: unknown[]
  exposure_assertions?: unknown[]
}

/** Every measurement of the current test, written out by the afterEach below. */
const measurements: Array<{ name: string; data: unknown }> = []

function report(name: string, data: unknown) {
  measurements.push({ name, data })
  console.log(`C1QA ${name} ${JSON.stringify(data)}`)
}

/** Attachments are written as files under the test's output directory so the
 *  publish step of the workflow can ship them with the screenshots. */
async function attachJson(name: string, data: unknown) {
  const path = test.info().outputPath(name)
  fs.writeFileSync(path, JSON.stringify(data, null, 2))
  await test.info().attach(name, { path, contentType: "application/json" })
}

test.afterEach(async () => {
  if (measurements.length === 0) return
  await attachJson("c1qa-measurements.json", {
    test: test.info().title,
    status: test.info().status,
    measurements: measurements.splice(0, measurements.length),
  })
})

async function shot(page: Page, name: string) {
  const path = test.info().outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await test.info().attach(name, { path, contentType: "image/png" })
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

async function textOrNull(locator: Locator, limit = 600): Promise<string | null> {
  if ((await locator.count()) === 0) return null
  return squash(await locator.first().innerText()).slice(0, limit)
}

/** Prefer a scanned node with findings for the detail read; any node otherwise. */
function detailCandidateRank(node: MapNode): number {
  const v = node.vulnerabilities ?? {}
  const scanned = v.coverage === "SCANNED" ? 1_000_000 : 0
  return scanned + (v.total_cves ?? 0)
}

test.describe("C1 live QA — Risk › Vulnerabilities against the deployed graph", () => {
  test("vulnerability-map on the deployed backend: counts, coverage, per-node evidence", async ({ playwright }) => {
    test.setTimeout(240_000)
    const request = await authedApi(playwright)

    const started = Date.now()
    const res = await liveGetWithRetry(request, MAP_PATH)
    const text = await res.text()
    report("vulnerability-map-fetch", {
      status: res.status(),
      ms: Date.now() - started,
      x_cache: res.headers()["x-cache"] ?? null,
      content_type: res.headers()["content-type"] ?? null,
    })
    let body: MapPayload = {}
    try {
      body = JSON.parse(text) as MapPayload
    } catch {
      report("vulnerability-map-body-not-json", { head: text.slice(0, 300) })
    }
    await attachJson("vulnerability-map.json", body)

    const nodes = body.nodes ?? []
    const byCoverage: Record<string, number> = {}
    const byType: Record<string, number> = {}
    for (const node of nodes) {
      const coverage = node.vulnerabilities?.coverage ?? "?"
      byCoverage[coverage] = (byCoverage[coverage] ?? 0) + 1
      const type = node.type ?? "?"
      byType[type] = (byType[type] ?? 0) + 1
    }
    const ids = nodes.map(node => node.id ?? "")
    report("vulnerability-map", {
      system_name: body.system_name ?? null,
      timestamp: body.timestamp ?? null,
      from_stale_cache: Boolean(body.fromStaleCache),
      stale_reason: body.staleReason ?? null,
      total_resources: body.total_resources ?? null,
      vulnerable_resources: body.vulnerable_resources ?? null,
      total_cves: body.total_cves ?? null,
      critical_cves: body.critical_cves ?? null,
      resources_needing_patches: body.resources_needing_patches ?? null,
      nodes: nodes.length,
      duplicate_ids: ids.length - new Set(ids).size,
      by_type: byType,
      by_coverage: byCoverage,
      canonical_findings: (body.vulnerability_findings ?? body.findings ?? []).length,
      path_assessments: (body.cve_assessments ?? body.assessments ?? []).length,
      coverage: body.coverage ?? null,
    })
    report("vulnerability-map-nodes", nodes.map(node => {
      const v = node.vulnerabilities ?? {}
      return {
        id: node.id ?? null,
        name: node.name ?? null,
        type: node.type ?? null,
        is_public: node.is_public ?? null,
        security_groups: (node.security_groups ?? []).length,
        coverage: v.coverage ?? null,
        coverage_reason: v.coverage_reason ?? null,
        total_cves: v.total_cves ?? null,
        critical: v.critical ?? null,
        high: v.high ?? null,
        medium: v.medium ?? null,
        low: v.low ?? null,
        untriaged: v.untriaged ?? null,
        highest_cvss: v.highest_cvss ?? null,
        exploits_available: v.exploits_available ?? null,
        top_cves: v.top_cves ?? [],
        software_affected: (v.software_affected ?? []).length,
        exposed_ports: v.exposed_ports ?? [],
        patch_urgency: v.patch_urgency ?? null,
      }
    }))

    const scanner = await request.get(SCANNER_PATH)
    report("scanner-refresh-capability", {
      status: scanner.status(),
      body: (await scanner.text()).slice(0, 400),
    })

    const candidate = [...nodes].sort((left, right) => detailCandidateRank(right) - detailCandidateRank(left))[0]
    if (candidate?.id) {
      const detailPath = `/api/proxy/vulnerability-map/${encodeURIComponent(SYSTEM)}/resource/${encodeURIComponent(candidate.id)}`
      const t0 = Date.now()
      const detail = await liveGetWithRetry(request, detailPath)
      const detailText = await detail.text()
      let detailBody: ResourceDetail = {}
      try {
        detailBody = JSON.parse(detailText) as ResourceDetail
      } catch {
        report("resource-detail-body-not-json", { head: detailText.slice(0, 300) })
      }
      await attachJson("resource-detail.json", detailBody)
      report("resource-detail", {
        resource_id: candidate.id,
        resource_type: candidate.type ?? null,
        status: detail.status(),
        ms: Date.now() - t0,
        coverage: detailBody.summary?.coverage ?? null,
        coverage_reason: detailBody.summary?.coverage_reason ?? null,
        total_cves: detailBody.summary?.total_cves ?? null,
        cves: Array.isArray(detailBody.cves) ? detailBody.cves.length : null,
        port_exposure: Array.isArray(detailBody.port_exposure) ? detailBody.port_exposure.length : null,
        exposure_assertions: Array.isArray(detailBody.exposure_assertions) ? detailBody.exposure_assertions.length : null,
        error_head: detail.status() === 200 ? null : detailText.slice(0, 300),
      })
    }
    await request.dispose()

    expect(res.status(), text.slice(0, 500)).toBe(200)
    expect(body.system_name).toBe(SYSTEM)
    expect(Array.isArray(body.nodes), "nodes must be a list").toBe(true)
  })

  test("Risk › Vulnerabilities on the deployed frontend: KPIs, banner, every sub-tab, evidence drawer", async ({ context, page }) => {
    test.setTimeout(300_000)
    await seedAuthCookie(context)
    await page.setViewportSize({ width: 1600, height: 1000 })

    const pageErrors: string[] = []
    const consoleErrors: string[] = []
    const proxyResponses: Array<{ path: string; status: number; x_cache: string | null }> = []
    page.on("pageerror", error => pageErrors.push(String(error.message ?? error).slice(0, 300)))
    page.on("console", message => {
      if (message.type() !== "error") return
      const at = message.location().url ? ` @ ${message.location().url}` : ""
      consoleErrors.push(`${message.text()}${at}`.slice(0, 300))
    })
    page.on("response", response => {
      const url = new URL(response.url())
      if (!url.pathname.startsWith("/api/proxy/vulnerability-map/")) return
      proxyResponses.push({
        path: `${url.pathname}${url.search}`,
        status: response.status(),
        x_cache: response.headers()["x-cache"] ?? null,
      })
    })

    await page.goto(TAB_URL, { waitUntil: "domcontentloaded", timeout: 90_000 })
    const bouncedToLogin = page.url().includes("/login")
    report("navigation", { url: page.url(), bounced_to_login: bouncedToLogin })

    const root = page.getByTestId("vulnerability-experience")
    await expect(root, "the Vulnerabilities tab must mount from the deep link").toBeVisible({ timeout: 120_000 })
    await expect(page.locator('[aria-label="Loading vulnerability inventory"]')).toHaveCount(0, { timeout: 150_000 })
    await page.waitForTimeout(1_000)

    const readListState = async (tab: string) => {
      const kpis: Record<string, string> = {}
      for (const id of KPI_IDS) {
        kpis[id] = (await textOrNull(page.getByTestId(`vulnerability-kpi-${id}`), 200)) ?? "(absent)"
      }
      const inventory = page.getByTestId("vulnerability-inventory")
      const rows = await inventory.getByRole("button", { name: "Investigate" }).count()
      const panel = page.locator('section[role="tabpanel"]')
      const state = {
        tab,
        active_tab: await textOrNull(page.getByRole("tab", { selected: true }), 60),
        header: await textOrNull(root.locator("header"), 400),
        kpis,
        banner: await textOrNull(page.getByTestId("vulnerability-coverage-banner")),
        alert: await textOrNull(page.getByRole("alert")),
        counter: await textOrNull(page.locator("span", { hasText: /^\d+ of \d+$/ }), 40),
        inventory_rows: rows,
        empty_state: (await inventory.count()) === 0 ? await textOrNull(panel, 400) : null,
      }
      report(`tab-${tab.toLowerCase()}`, state)
      return state
    }

    const prioritized = await readListState("Prioritized")
    await shot(page, "vulnerabilities-prioritized")
    for (const tab of LIST_TABS) {
      await page.getByRole("tab", { name: tab }).click()
      await page.waitForTimeout(800)
      await readListState(tab)
      await shot(page, `vulnerabilities-${tab.toLowerCase()}`)
    }

    await page.getByRole("tab", { name: "Map" }).click()
    await expect(page.getByText("Loading vulnerability map...")).toHaveCount(0, { timeout: 120_000 })
    await page.waitForTimeout(1_000)
    const mapPanel = page.locator('section[role="tabpanel"]')
    report("tab-map", {
      headings: (await mapPanel.locator("h3").allInnerTexts()).map(squash),
      stale_banner: await textOrNull(page.getByTestId("vulnerability-map-stale-banner")),
      text: (await textOrNull(mapPanel, 1_500)) ?? null,
    })
    await shot(page, "vulnerabilities-map")

    // The evidence drawer, from the first row that has one. An estate with no
    // current scanner coverage has no Prioritized rows; Assets always lists.
    let drawer: Record<string, unknown> | null = null
    for (const tab of ["Prioritized", "Assets"] as const) {
      await page.getByRole("tab", { name: tab }).click()
      await page.waitForTimeout(600)
      const investigate = page.getByTestId("vulnerability-inventory").getByRole("button", { name: "Investigate" }).first()
      if ((await investigate.count()) === 0) continue
      await investigate.click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible({ timeout: 30_000 })
      await expect(dialog.locator('[aria-label="Loading resource evidence"]')).toHaveCount(0, { timeout: 90_000 })
      await page.waitForTimeout(500)
      drawer = {
        opened_from: tab,
        title: await textOrNull(dialog.getByRole("heading").first(), 120),
        text: await textOrNull(dialog, 2_500),
      }
      await shot(page, "vulnerabilities-drawer")
      await page.keyboard.press("Escape")
      await expect(dialog).toHaveCount(0, { timeout: 15_000 })
      break
    }
    report("evidence-drawer", drawer ?? { opened_from: null, reason: "no Investigate button on Prioritized or Assets" })

    report("proxy-responses", proxyResponses)
    report("page-errors", pageErrors)
    report("console-errors", consoleErrors.filter(entry => !/favicon|net::ERR_ABORTED|third-party cookie/i.test(entry)))

    expect(bouncedToLogin, "site cookie auth must admit the tab").toBe(false)
    expect(prioritized.kpis["coverage-gaps"], "the KPI row must render").not.toBe("(absent)")
    expect(pageErrors, "uncaught page errors on the Vulnerabilities tab").toEqual([])
  })
})
