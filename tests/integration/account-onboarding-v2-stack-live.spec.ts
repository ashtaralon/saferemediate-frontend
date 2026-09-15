/**
 * Account onboarding v2 Settings UI in a real Chromium against the contract stack.
 *
 * Needs IDENTITY_STACK_FILE from the backend's tests/e2e_identity/run_identity_contract.py
 * started with --worker --scenario organization: the built console (next start),
 * the real onboarding API and worker on emulated AWS (moto), an emulated AWS
 * Organization, and an emulated trust denial for the accounts it names. Nothing
 * in the console or API is patched. ExternalIds shown during the run are never
 * written to the observations file or screenshots' names.
 */
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const stackFile = process.env.IDENTITY_STACK_FILE
const stack = stackFile ? JSON.parse(readFileSync(stackFile, "utf8")) : null
const sitePassword = process.env.IDENTITY_STACK_SITE_PASSWORD || ""
const out = process.env.IDENTITY_STACK_OUT || "test-results/account-onboarding-v2"
const scenario = stack?.scenario || {}
const tenant: string = stack?.tenant_id || ""
const management: string = scenario.management_account_id || ""
const denied: string[] = scenario.denied_accounts || []
const members: Record<string, string> = scenario.members || {}
const SINGLE_OK = "111122223333"
const SINGLE_DENIED = "210987654321"
const VIEWPORTS = { mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, laptop: { width: 1280, height: 800 }, desktop: { width: 1920, height: 1080 } }

test.skip(!stack || !sitePassword || !management, "requires run_identity_contract.py --worker --scenario organization")
test.use({ baseURL: stack?.hosted_url, ignoreHTTPSErrors: true, trace: "retain-on-failure", channel: undefined })

const observations: Record<string, unknown> = {}
function record(name: string, value: unknown) {
  observations[name] = value
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, "v2-observations.json"), JSON.stringify(observations, null, 2))
}

async function shoot(page: Page, name: string, focus?: Locator) {
  mkdirSync(out, { recursive: true })
  for (const [label, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size)
    await page.waitForTimeout(250)
    if (focus) await focus.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(out, `${name}-${label}.png`), fullPage: false })
  }
  await page.setViewportSize(VIEWPORTS.laptop)
}

async function signIn(page: Page, persona: string, base = stack.hosted_url) {
  await page.goto(`${base}/login`)
  await page.getByPlaceholder("Enter password").fill(sitePassword)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith("/login")), page.getByRole("button", { name: "Enter" }).click()])
  await page.goto(`${base}/api/auth/operator/start?returnTo=%2Fsettings%2Faccounts`)
  await page.locator(`input[name="persona"][value="${persona}"]`).check()
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/settings/accounts", { timeout: 30_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ])
  await expect(page.getByTestId("operator-panel").first()).not.toHaveAttribute("data-operator-state", "loading", { timeout: 20_000 })
}

async function openDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /Add AWS account/ }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  return dialog
}

async function operationStatus(scope: Locator, statuses: string[], timeout = 60_000): Promise<string> {
  const card = scope.getByTestId("onboarding-operation").last()
  await expect.poll(async () => card.getAttribute("data-operation-status"), { timeout, intervals: [500] }).toMatch(new RegExp(`^(${statuses.join("|")})$`))
  return (await card.getAttribute("data-operation-status")) || ""
}

async function connectSingle(dialog: Locator, account: string, name: string) {
  const flow = dialog.getByTestId("single-account-onboarding")
  await flow.getByLabel("Account name").fill(name)
  await flow.getByLabel("AWS account ID").fill(account)
  await flow.getByRole("button", { name: "Create access binding" }).click()
  const once = flow.getByTestId("external-id-once")
  await expect(once).toBeVisible()
  const externalId = (await once.getByTestId("external-id-value").textContent()) || ""
  await expect(flow.getByTestId("installation-plan")).toBeVisible()
  const planText = (await flow.getByTestId("installation-plan").textContent()) || ""
  await once.getByRole("button", { name: /I stored it/ }).click()
  await expect(once).toHaveCount(0)
  await flow.getByPlaceholder(/arn:aws:iam::/).fill(`arn:aws:iam::${account}:role/CyntroRead-${tenant}`)
  await flow.getByRole("button", { name: "Attach role" }).click()
  await flow.getByRole("button", { name: "Connect account" }).click()
  return { flow, externalIdLength: externalId.length, planContainsExternalId: externalId.length > 0 && planText.includes(externalId) }
}

test.describe.serial("account onboarding v2 in Chromium", () => {
  test.setTimeout(600_000)

  test("single account: binding, display-once ExternalId, role, connect to SUCCEEDED", async ({ page }) => {
    await signIn(page, "operator")
    await expect(page.getByTestId("operator-panel").first()).toHaveAttribute("data-operator-state", "operator")
    const dialog = await openDialog(page)
    const { flow, externalIdLength, planContainsExternalId } = await connectSingle(dialog, SINGLE_OK, "Payments production")
    const status = await operationStatus(flow, ["SUCCEEDED", "BLOCKED", "FAILED"])
    expect(status).toBe("SUCCEEDED")
    await expect(flow.getByText("Inventory bootstrap", { exact: false }).first()).toBeVisible()
    await shoot(page, "single-account-succeeded", flow.getByTestId("onboarding-operation").last())
    record("single_account_success", { account: SINGLE_OK, status, external_id_length: externalIdLength, plan_contains_external_id: planContainsExternalId })
    expect(planContainsExternalId).toBe(false)
  })

  test("single account with a denied trust: BLOCKED with the operator message, retry records a new attempt", async ({ page }) => {
    expect(denied).toContain(SINGLE_DENIED)
    await signIn(page, "operator")
    const dialog = await openDialog(page)
    const { flow } = await connectSingle(dialog, SINGLE_DENIED, "Wrong trust")
    expect(await operationStatus(flow, ["SUCCEEDED", "BLOCKED", "FAILED"])).toBe("BLOCKED")
    const card = flow.getByTestId("onboarding-operation").last()
    await expect(card.getByRole("paragraph").filter({ hasText: /could not assume the role/i }).first()).toBeVisible()
    await expect(card.getByText("ASSUME_ROLE_DENIED", { exact: false }).first()).toBeVisible()
    const firstId = await flow.getByTestId("onboarding-operation").locator(".font-mono").first().textContent()
    await flow.getByRole("button", { name: "Retry" }).click()
    await expect(flow.getByText(/retry of/).first()).toBeVisible({ timeout: 30_000 })
    expect(await operationStatus(flow, ["BLOCKED", "FAILED", "SUCCEEDED"])).toBe("BLOCKED")
    await shoot(page, "single-account-denied-retried", flow.getByTestId("onboarding-operation").last())
    record("single_account_denied", { account: SINGLE_DENIED, first_operation: firstId, retried: true })
  })

  test("organization: discovery, explicit OU scope, partial failure with per-account retry", async ({ page }) => {
    await signIn(page, "operator")
    const dialog = await openDialog(page)
    await dialog.getByRole("tab", { name: /AWS Organization/ }).click()
    const flow = dialog.getByTestId("organization-onboarding")
    await flow.getByLabel("Management account ID").fill(management)
    await flow.getByRole("button", { name: "Create organization bindings" }).click()
    await expect(flow.getByTestId("external-id-once")).toHaveCount(2)
    // Each confirmation removes its ExternalId panel, so click the first until none remain.
    const stored = flow.getByRole("button", { name: /I stored it/ })
    while (await stored.count()) await stored.first().click()
    await expect(flow.getByTestId("installation-plan")).toBeVisible()
    await flow.getByLabel(/Discovery role ARN/).fill(`arn:aws:iam::${management}:role/CyntroOrganizationsDiscovery-${tenant}`)
    await flow.getByRole("button", { name: "Attach roles" }).click()
    await flow.getByRole("button", { name: "Discover organization" }).click()
    const scope = flow.getByTestId("organization-scope")
    await expect(scope).toBeVisible({ timeout: 60_000 })
    await scope.getByLabel("Organizational unit Production").check()
    await expect(scope.getByTestId("scope-preview")).toHaveText(/^3 accounts will be connected/)
    await expect(scope.getByLabel("Organizational unit Apps")).toBeChecked()
    await expect(scope.getByLabel("Organizational unit Apps")).toBeDisabled()
    await shoot(page, "organization-scope", scope)
    await scope.getByRole("button", { name: "Connect 3 accounts" }).click()

    const table = flow.getByTestId("organization-children")
    await expect(table).toBeVisible({ timeout: 60_000 })
    const row = (account: string) => table.locator(`[data-child-account="${account}"]`)
    await expect(row(members.checkout)).toHaveAttribute("data-child-status", "BLOCKED", { timeout: 90_000 })
    await expect(row(members.payments)).toHaveAttribute("data-child-status", "SUCCEEDED", { timeout: 90_000 })
    await expect(row(members.ledger)).toHaveAttribute("data-child-status", "SUCCEEDED", { timeout: 90_000 })
    await expect(row(members.sandbox)).toHaveCount(0)
    // The parent aggregates on the worker's next pass (120s).
    await expect(flow.getByTestId("organization-connect").getByTestId("onboarding-operation").first()).toHaveAttribute("data-operation-status", "PARTIALLY_SUCCEEDED", { timeout: 240_000 })
    await expect(flow.getByTestId("organization-counts")).toHaveText(/^2 connected · 1 need attention · 0 pending/)
    await shoot(page, "organization-partially-succeeded", table)
    await row(members.checkout).getByRole("button", { name: "Retry" }).click()
    await expect(flow.getByTestId("organization-connect").getByText(/retry of/).first()).toBeVisible({ timeout: 30_000 })
    record("organization_partial_failure", {
      management_account: management,
      children: { payments: "SUCCEEDED", ledger: "SUCCEEDED", checkout: "BLOCKED", sandbox_out_of_scope: true },
      parent: "PARTIALLY_SUCCEEDED",
      child_retry_submitted: true,
    })
  })

  test("organization: an operation waiting on member accounts can be cancelled", async ({ page }) => {
    await signIn(page, "operator")
    const dialog = await openDialog(page)
    await dialog.getByRole("tab", { name: /AWS Organization/ }).click()
    const flow = dialog.getByTestId("organization-onboarding")
    await flow.getByLabel("Management account ID").fill(management)
    await flow.getByRole("button", { name: "Discover organization" }).click()
    const scope = flow.getByTestId("organization-scope")
    await expect(scope).toBeVisible({ timeout: 60_000 })
    await scope.getByLabel("Organizational unit Sandbox").check()
    await expect(scope.getByTestId("scope-preview")).toHaveText(/^1 account will be connected/)
    await scope.getByRole("button", { name: "Connect 1 accounts" }).click()
    const parentCard = flow.getByTestId("organization-connect").getByTestId("onboarding-operation").first()
    await expect(parentCard).toHaveAttribute("data-operation-status", /^(QUEUED|RUNNING|RETRY_SCHEDULED)$/, { timeout: 30_000 })
    await expect(parentCard.getByRole("button", { name: "Cancel" })).toBeVisible({ timeout: 60_000 })
    await parentCard.getByRole("button", { name: "Cancel" }).click()
    await expect(parentCard).toHaveAttribute("data-operation-status", /^(CANCEL_REQUESTED|CANCELLED)$/, { timeout: 30_000 })
    await expect(parentCard).toHaveAttribute("data-operation-status", "CANCELLED", { timeout: 240_000 })
    await shoot(page, "organization-cancelled", parentCard)
    record("organization_cancel", { scope: "Sandbox", parent: "CANCELLED" })
  })

  test("auditor is read-only and a signed-out console offers identity-provider sign-in", async ({ browser }) => {
    const auditor = await newContext(browser)
    const auditorPage = await auditor.newPage()
    await signIn(auditorPage, "auditor")
    await expect(auditorPage.getByTestId("operator-panel").first()).toHaveAttribute("data-operator-state", "read-only")
    await expect(auditorPage.getByTestId("onboarding-activity")).toBeVisible()
    const dialog = await openDialog(auditorPage)
    await dialog.getByLabel("Account name").fill("Read only")
    await dialog.getByLabel("AWS account ID").fill("555566667777")
    await expect(dialog.getByRole("button", { name: "Create access binding" })).toBeDisabled()
    await shoot(auditorPage, "auditor-read-only", dialog.getByTestId("operator-panel"))
    await auditor.close()

    const anonymous = await newContext(browser)
    const anonymousPage = await anonymous.newPage()
    await anonymousPage.goto(`${stack.hosted_url}/login`)
    await anonymousPage.getByPlaceholder("Enter password").fill(sitePassword)
    await Promise.all([anonymousPage.waitForURL((url) => !url.pathname.startsWith("/login")), anonymousPage.getByRole("button", { name: "Enter" }).click()])
    await anonymousPage.goto(`${stack.hosted_url}/settings/accounts`)
    const panel = anonymousPage.getByTestId("operator-panel").first()
    await expect(panel).toHaveAttribute("data-operator-state", "signed-out", { timeout: 20_000 })
    await expect(panel.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/api/auth/operator/start?returnTo=%2Fsettings%2Faccounts")
    await expect(anonymousPage.getByTestId("onboarding-activity")).toHaveCount(0)
    await shoot(anonymousPage, "signed-out")
    await anonymous.close()
    record("roles", { auditor: "read-only, create disabled", signed_out: "sign-in offered, no activity shown" })
  })

  test("a copied session is refused on another console instance after sign-out", async ({ browser }) => {
    const original = await newContext(browser)
    const page = await original.newPage()
    await signIn(page, "operator")
    const copied = (await original.cookies()).filter((cookie) => cookie.name.startsWith("cyntro_"))
    const secondInstance = await newContext(browser)
    await secondInstance.addCookies(copied)
    const other = await secondInstance.newPage()
    await other.goto(`${stack.hosted_b_url}/settings/accounts`)
    await expect(other.getByTestId("operator-panel").first()).toHaveAttribute("data-operator-state", "operator", { timeout: 20_000 })

    await page.getByTestId("operator-panel").first().getByRole("button", { name: "Sign out" }).click()
    await expect(page.getByText("Signed out of Cyntro on every device.")).toBeVisible()

    await other.reload()
    const panel = other.getByTestId("operator-panel").first()
    await expect(panel).toHaveAttribute("data-operator-state", "refused", { timeout: 20_000 })
    await expect(panel).toContainText("This session was signed out")
    const read = await other.evaluate(async (customer) => {
      const response = await fetch(`/api/proxy/admin/accounts/onboarding/operations?customer_id=${customer}`)
      return { status: response.status, error: (await response.json())?.detail?.error }
    }, tenant)
    expect(read.status).toBe(401)
    await shoot(other, "copied-session-refused")
    record("copied_session_after_sign_out", { second_instance: stack.hosted_b_url, panel: "refused", read })
    await original.close()
    await secondInstance.close()
  })
})

async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: stack.hosted_url, ignoreHTTPSErrors: true, viewport: VIEWPORTS.laptop })
}
