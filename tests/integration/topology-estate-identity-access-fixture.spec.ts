import path from "node:path"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import {
  ESTATE_URL,
  routeSnapshot,
  v11IdentityAccessSnapshot,
} from "./topology-fixture"

const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900, input: "keyboard" },
  { name: "1512x771", width: 1512, height: 771, input: "mouse" },
  { name: "1366x768", width: 1366, height: 768, input: "keyboard" },
  { name: "1024x720", width: 1024, height: 720, input: "mouse" },
] as const

const ARTIFACT_DIR = "/Users/admin/Documents/Eltro/Platfrom/.qa-artifacts/estate-full-plan"

async function openFullscreenMap(page: Page, snapshot: Record<string, unknown>) {
  await routeSnapshot(page, snapshot as never)
  // Selecting a workload opens existing resource detail consumers. Keep this
  // fixture lane fully local; identity assertions must never reach C1 or turn
  // a missing detail response into evidence about the v1 projection.
  await page.route("**/api/proxy/inspector/**", route => route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"fixture only"}' }))
  await page.route("**/api/proxy/operational-map/**", route => route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"fixture only"}' }))
  await page.route("**/api/proxy/decision-coverage/**", route => route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"fixture only"}' }))
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()
  await page.getByTestId("topology-estate-map-enlarge").click()
  await expect(page.getByTestId("topology-estate-map-fullscreen")).toBeVisible()
}

async function openIdentitySurface(page: Page, snapshot: Record<string, unknown>) {
  await routeSnapshot(page, snapshot as never)
  await page.route("**/api/proxy/inspector/**", route => route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"fixture only"}' }))
  await page.route("**/api/proxy/operational-map/**", route => route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"fixture only"}' }))
  await page.route("**/api/proxy/decision-coverage/**", route => route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"fixture only"}' }))
  await page.goto(`${ESTATE_URL}&surface=identity`, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("topology-estate-view-identity")).toHaveAttribute("aria-selected", "true", { timeout: 60_000 })
  return page.getByTestId("topology-identity-access-surface")
}

async function expectViewportContained(locator: Locator, page: Page) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  const viewport = page.viewportSize()!
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 0.5)
}

async function expectSurfaceViewportAligned(locator: Locator, page: Page) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  const viewport = page.viewportSize()!
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeLessThan(viewport.height)
  expect(box!.height).toBeGreaterThan(180)
}

async function expectPanelTopmost(page: Page) {
  await page.waitForFunction(() => {
    const panel = document.querySelector<HTMLElement>('[data-testid="topology-identity-access-panel"]')
    if (!panel) return false
    const rect = panel.getBoundingClientRect()
    if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) return false
    let opacity = 1
    for (let node: Element | null = panel; node && node !== document.documentElement; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity)
    }
    const probes = [
      [rect.left + rect.width / 2, rect.top + 8],
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + rect.width / 2, rect.bottom - 8],
      [rect.left + 8, rect.top + rect.height / 2],
      [rect.right - 8, rect.top + rect.height / 2],
    ]
    return opacity >= 0.999 && probes.every(([x, y]) => {
      const top = document.elementFromPoint(x, y)
      return Boolean(top && (top === panel || panel.contains(top)))
    })
  }, undefined, { timeout: 10_000 })
}

async function openIdentity(page: Page, input: "mouse" | "keyboard") {
  const trigger = page.getByTestId("topology-identity-access-trigger")
  await expect(trigger).toBeVisible()
  await expectViewportContained(trigger, page)
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  if (input === "mouse") await trigger.click()
  else {
    await trigger.focus()
    await page.keyboard.press("Enter")
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  const panel = page.getByTestId("topology-identity-access-panel")
  await expect(panel).toBeVisible()
  await expectViewportContained(panel, page)
  await expectPanelTopmost(page)
  return { trigger, panel }
}

for (const viewport of VIEWPORTS) {
  test(`identity authority remains readable and lens-independent at ${viewport.name}`, async ({ context, page }) => {
    test.setTimeout(120_000)
    const fixture = v11IdentityAccessSnapshot()
    const unexpectedRequests: string[] = []
    page.on("request", request => {
      if (
        request.url().includes("/api/proxy/identities/data-access/")
        || request.url().includes("/api/proxy/iam-roles/")
        || request.url().includes("/api/proxy/least-privilege/roles/")
      ) unexpectedRequests.push(request.url())
    })
    await seedAuthCookie(context)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openFullscreenMap(page, fixture.snapshot)

    const architecture = page.getByRole("button", { name: "Architecture", exact: true })
    if (viewport.name === "1366x768") {
      await architecture.click()
      await expect(architecture).toHaveAttribute("aria-pressed", "true")
    }

    const { trigger, panel } = await openIdentity(page, viewport.input)
    await expect(trigger).toHaveAttribute("data-role-count", "1")
    await expect(panel).toHaveAttribute("data-identity-status", "ready")
    await expect(panel.getByTestId("topology-identity-role-totals")).toContainText("1 exact role · 1 returned")
    await expect(panel.getByTestId("topology-identity-configured-grants")).toContainText("1")
    await expect(panel.getByTestId("topology-identity-observed-use")).toContainText("1 successful · 0 denied-only")
    await expect(panel.getByTestId("topology-identity-effective-authorization").first()).toContainText("Effective authorization · Unknown")
    await expect(panel.getByTestId("topology-identity-effective-gap").filter({ hasText: "ACTION_AND_RESOURCE_SCOPE_REQUIRED" }).first()).toBeVisible()
    await expect(panel.getByTestId("topology-identity-effective-gap").filter({ hasText: "NO_PROJECTED_EFFECTIVE_DECISION" }).first()).toBeVisible()
    await expect(panel.getByTestId("topology-identity-role-link")).toHaveAttribute(
      "href",
      `/iam/shared-roles?system_name=${encodeURIComponent(fixture.identityAccess.scope.system_name)}&role_ref=${encodeURIComponent(fixture.identityAccess.roles[0].role_arn)}`,
    )
    await expect(panel).not.toContainText("unused")
    await expect(panel).not.toContainText(/\d+%/)
    await expect(page.locator('[data-flow-motion="moving"]')).toHaveCount(0)

    if (viewport.name === "1600x900") {
      await panel.focus()
      await page.keyboard.press("Tab")
      await expect(panel.getByTestId("topology-identity-role-link")).toBeFocused()
    }

    const actionSummary = panel.locator("summary").filter({ hasText: "Action evidence · 1 exact" })
    await actionSummary.click()
    const action = panel.getByTestId("topology-identity-action")
    await expect(action).toHaveAttribute("data-configured-grant", "true")
    await expect(action).toHaveAttribute("data-usage-state", "SUCCESS_OBSERVED")
    await expect(action).toHaveAttribute("data-coverage-state", "COMPLETE")
    await expect(action).toHaveAttribute("data-effective-decision", "unknown")

    if (viewport.name === "1512x771" || viewport.name === "1366x768") {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `frontend-identity-access-${viewport.name}.png`),
        fullPage: false,
      })
    }

    const workloadLink = panel.getByTestId("topology-identity-workload-link")
    await expect(workloadLink).toHaveAttribute("data-workload-id", fixture.browserSourceId)
    await workloadLink.click()
    await expect(panel).toBeHidden()
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.flowId ?? null)).toBe(fixture.browserSourceId)

    const reopened = await openIdentity(page, "keyboard")
    await reopened.panel.press("Escape")
    await expect(reopened.panel).toBeHidden()
    await expect(reopened.trigger).toBeFocused()
    if (viewport.name === "1366x768") await expect(architecture).toHaveAttribute("aria-pressed", "true")
    expect(unexpectedRequests).toEqual([])
  })
}

test("missing v1 block is unavailable and never exact empty", async ({ context, page }) => {
  const fixture = v11IdentityAccessSnapshot()
  const snapshot = structuredClone(fixture.snapshot) as Record<string, unknown>
  delete snapshot.identity_access
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1024, height: 720 })
  await openFullscreenMap(page, snapshot)
  const { trigger, panel } = await openIdentity(page, "mouse")
  await expect(trigger).toHaveAttribute("data-role-count", "unavailable")
  await expect(panel.getByTestId("topology-identity-access-unavailable")).toContainText("was not projected")
  await expect(panel.getByTestId("topology-identity-access-empty")).toHaveCount(0)
})

test("ready zero is the only exact-empty state", async ({ context, page }) => {
  const fixture = v11IdentityAccessSnapshot()
  const snapshot = structuredClone(fixture.snapshot) as typeof fixture.snapshot
  snapshot.identity_access.roles = []
  snapshot.identity_access.roles_total = 0
  snapshot.identity_access.roles_returned = 0
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1024, height: 720 })
  await openFullscreenMap(page, snapshot)
  const { panel } = await openIdentity(page, "keyboard")
  await expect(panel.getByTestId("topology-identity-access-empty")).toContainText(
    "No IAM roles are attached to resources in this Estate scope.",
  )
  await expect(panel.getByTestId("topology-identity-access-unavailable")).toHaveCount(0)
})

test("partial and bounded states preserve backend totals and unavailable evidence", async ({ context, page }) => {
  const fixture = v11IdentityAccessSnapshot()
  const snapshot = structuredClone(fixture.snapshot) as typeof fixture.snapshot
  const identity = snapshot.identity_access
  identity.status = "partial"
  identity.roles_total = 8
  identity.roles_truncated = true
  identity.roles_omitted_unresolved = 2
  identity.gaps = [{ code: "ROLE_ID_UNRESOLVED", detail: "Two visible attachments have no stable RoleId." }]
  const role = identity.roles[0]
  role.configured_grants = { state: "unavailable", exact_action_count: null }
  role.observed_use = {
    state: "unavailable",
    successful_action_count: null,
    denied_only_action_count: null,
    not_observed_action_count: null,
    unknown_action_count: null,
    coverage_counts: null,
    last_success_at: null,
  }
  role.action_details_total = null
  role.action_details_returned = 0
  role.action_details_truncated = false
  role.action_details = []
  role.gaps = [{ code: "DECISION_EVIDENCE_UNAVAILABLE", detail: "Canonical decision evidence is unavailable." }]
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1366, height: 768 })
  await openFullscreenMap(page, snapshot)
  const { panel } = await openIdentity(page, "mouse")
  await expect(panel.getByTestId("topology-identity-access-partial")).toBeVisible()
  await expect(panel.getByTestId("topology-identity-roles-truncated")).toContainText("Showing 1 of 8 exact roles")
  await expect(panel.getByTestId("topology-identity-roles-unresolved")).toContainText("2 attached roles are omitted")
  await expect(panel.getByTestId("topology-identity-configured-grants")).toContainText("unavailable")
  await expect(panel.getByTestId("topology-identity-observed-use")).toContainText("unavailable")
  await expect(panel.getByTestId("topology-identity-access-empty")).toHaveCount(0)
})

test("stale snapshot keeps its original authority generations and is labelled stale", async ({ context, page }) => {
  const fixture = v11IdentityAccessSnapshot()
  const snapshot = { ...fixture.snapshot, fromStaleCache: true }
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1366, height: 768 })
  await openFullscreenMap(page, snapshot)
  const { trigger, panel } = await openIdentity(page, "keyboard")
  await expect(trigger).toHaveAttribute("data-snapshot-stale", "true")
  await expect(panel.getByTestId("topology-identity-access-stale")).toContainText("Stale snapshot")
  await expect(panel.getByTestId("topology-identity-authority")).toContainText("generation 31")
  await expect(panel.getByTestId("topology-identity-authority")).toContainText("generation 12")
})

test("valid unavailable projection keeps its named backend gap", async ({ context, page }) => {
  const fixture = v11IdentityAccessSnapshot()
  const snapshot = structuredClone(fixture.snapshot) as typeof fixture.snapshot
  snapshot.identity_access = {
    ...snapshot.identity_access,
    status: "unavailable",
    inventory_authority: null,
    decision_authority: null,
    roles_total: null,
    roles_returned: 0,
    roles_truncated: false,
    roles_omitted_unresolved: null,
    roles: [],
    gaps: [{ code: "ACTIVE_INVENTORY_POINTER_INVALID", detail: "Active inventory pointer failed integrity validation." }],
  }
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1024, height: 720 })
  await openFullscreenMap(page, snapshot)
  const { panel } = await openIdentity(page, "keyboard")
  await expect(panel.getByTestId("topology-identity-access-unavailable")).toBeVisible()
  await expect(panel.getByTestId("topology-identity-access-gap")).toHaveAttribute(
    "data-gap-code",
    "ACTIVE_INVENTORY_POINTER_INVALID",
  )
  await expect(panel.getByTestId("topology-identity-access-empty")).toHaveCount(0)
})

test("large exact role sets scroll inside the bounded panel", async ({ context, page }) => {
  const fixture = v11IdentityAccessSnapshot()
  const snapshot = structuredClone(fixture.snapshot) as typeof fixture.snapshot
  const sourceRole = snapshot.identity_access.roles[0]
  snapshot.identity_access.roles = Array.from({ length: 12 }, (_, index) => ({
    ...structuredClone(sourceRole),
    role_id: `${sourceRole.role_id}-${index + 1}`,
    role_arn: `${sourceRole.role_arn}-${index + 1}`,
    name: `${sourceRole.name}-${index + 1}`,
  }))
  snapshot.identity_access.roles_total = 12
  snapshot.identity_access.roles_returned = 12
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1024, height: 720 })
  await openFullscreenMap(page, snapshot)
  const { panel } = await openIdentity(page, "mouse")
  expect(await panel.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  const lastRole = panel.getByTestId("topology-identity-role").last()
  await lastRole.scrollIntoViewIfNeeded()
  await expect(lastRole).toBeVisible()
  await expectViewportContained(panel, page)
})

for (const viewport of VIEWPORTS) {
  test(`Identity & access is a permanent sibling surface at ${viewport.name}`, async ({ context, page }) => {
    test.setTimeout(120_000)
    const fixture = v11IdentityAccessSnapshot()
    const unexpectedRequests: string[] = []
    page.on("request", request => {
      if (
        request.url().includes("/api/proxy/identities/data-access/")
        || request.url().includes("/api/proxy/iam-roles/")
        || request.url().includes("/api/proxy/least-privilege/roles/")
      ) unexpectedRequests.push(request.url())
    })
    await seedAuthCookie(context)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.emulateMedia({ reducedMotion: "reduce" })
    const surface = await openIdentitySurface(page, fixture.snapshot)

    await expect(surface).toBeVisible()
    await expect(surface).toHaveAttribute("data-identity-status", "ready")
    await expect(surface.getByTestId("topology-identity-relationship-map")).toHaveAttribute("data-relationship-count", "1")
    await expect(surface.getByTestId("topology-identity-relationship-row")).toHaveAttribute(
      "data-role-id",
      fixture.identityAccess.roles[0].role_id,
    )
    await expect(surface.getByTestId("topology-identity-effective-authorization").first()).toContainText(
      "Effective authorization · Unknown",
    )
    await expect(page).toHaveURL(/(?:\?|&)surface=identity(?:&|$)/)
    await expectSurfaceViewportAligned(surface, page)
    await expect(page.getByTestId("topology-az-scope")).toHaveCount(0)
    await expect(page.getByTestId("topology-service-scope")).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
    expect(unexpectedRequests).toEqual([])

    if (viewport.name === "1512x771" || viewport.name === "1366x768") {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `frontend-identity-surface-${viewport.name}.png`),
        fullPage: false,
      })
    }

    if (viewport.name === "1600x900") {
      const identityTab = page.getByTestId("topology-estate-view-identity")
      await identityTab.focus()
      await page.keyboard.press("Home")
      await expect(page.getByTestId("topology-estate-view-inventory")).toHaveAttribute("aria-selected", "true")
      await page.keyboard.press("End")
      await expect(identityTab).toHaveAttribute("aria-selected", "true")
      await expect(identityTab).toBeFocused()

      const workload = surface.getByTestId("topology-identity-relationship-workload")
      await expect(workload).toHaveAttribute("data-workload-id", fixture.browserSourceId)
      await workload.click()
      await expect(page.getByTestId("topology-estate-view-map")).toHaveAttribute("aria-selected", "true")
      await expect(page.getByTestId("topology-az-scope")).toBeVisible()
      await expect(page.getByTestId("topology-service-scope")).toBeVisible()
      await expect(page).not.toHaveURL(/(?:\?|&)surface=identity(?:&|$)/)
      await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.flowId ?? null)).toBe(fixture.browserSourceId)
      await page.goBack()
      await expect(identityTab).toHaveAttribute("aria-selected", "true")
      await expect(page).toHaveURL(/(?:\?|&)surface=identity(?:&|$)/)
    }
  })
}

test("direct Identity surface keeps missing v1 authority unavailable", async ({ context, page }) => {
  const fixture = v11IdentityAccessSnapshot()
  const snapshot = structuredClone(fixture.snapshot) as Record<string, unknown>
  delete snapshot.identity_access
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1024, height: 720 })
  const surface = await openIdentitySurface(page, snapshot)
  await expect(surface.getByTestId("topology-identity-access-unavailable")).toContainText("was not projected")
  await expect(surface.getByTestId("topology-identity-relationship-map")).toHaveCount(0)
  await expect(surface.getByTestId("topology-identity-access-empty")).toHaveCount(0)
})
