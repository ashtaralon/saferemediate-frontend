import { mkdir } from "node:fs/promises"
import path from "node:path"
import { expect, test, type Page, type Route } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"

const SETTINGS_URL = "/settings/accounts?customer_id=acme"
const ARTIFACT_DIR = process.env.ACCOUNT_ONBOARDING_ARTIFACT_DIR

type OperationStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "BLOCKED" | "FAILED"

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

function operation(request: Record<string, unknown>, status: OperationStatus) {
  const operationType = String(request.operation_type)
  const terminal = ["SUCCEEDED", "BLOCKED", "FAILED"].includes(status)
  return {
    contract_version: "account-onboarding/v1",
    operation_id: operationType === "REGISTER_METADATA" ? "aon-register-fixture-0001" : "aon-validate-fixture-0001",
    request_id: request.request_id,
    idempotency_key: request.idempotency_key,
    customer_id: request.customer_id,
    account_id: request.account_id,
    operation_type: operationType,
    command_digest: `sha256:${"a".repeat(64)}`,
    requested_by: { identity_source: "auth_verified", actor: "fixture-operator", tenant_id: "acme", roles: ["OPERATOR"] },
    status,
    requested_at: "2026-09-15T10:00:00+00:00",
    updated_at: "2026-09-15T10:00:01+00:00",
    started_at: status === "QUEUED" ? null : "2026-09-15T10:00:00+00:00",
    finished_at: terminal ? "2026-09-15T10:00:01+00:00" : null,
    attempt_count: status === "QUEUED" ? 0 : 1,
    lifecycle_state: status === "SUCCEEDED" ? (operationType === "REGISTER_METADATA" ? "INSTALLING" : "PROVISIONING") : null,
    steps: [{
      step_id: status === "QUEUED" ? "command.accepted" : status === "RUNNING" ? "worker.claimed" : operationType === "REGISTER_METADATA" ? "registry.metadata" : "worker.blocked",
      status: status === "SUCCEEDED" ? "SUCCEEDED" : status,
      recorded_at: "2026-09-15T10:00:01+00:00",
      detail: status === "SUCCEEDED"
        ? "Account display and scope metadata registered"
        : status === "BLOCKED" ? "Live AWS validation is not installed in this worker release" : `${status} fixture state`,
      evidence: status === "SUCCEEDED" ? { mutation_enabled: false } : {},
    }],
    failure: status === "BLOCKED" ? {
      code: "aws_validation_not_wired",
      message: "Live AWS validation is not installed in this worker release",
      retryable: false,
    } : status === "FAILED" ? {
      code: "handler_failed",
      message: "Write-authorized onboarding handler failed",
      retryable: false,
    } : null,
  }
}

async function routeSettings(page: Page, setupUnavailable = false, stayQueued = false) {
  let registerRequest: Record<string, unknown> | null = null
  let registrationReads = 0
  await page.route("**/api/build-version", route => json(route, { version: "fixture" }))
  await page.route("**/api/proxy/admin/customers", route => json(route, [
    { customer_id: "acme", display_name: "ACME" },
  ]))
  await page.route("**/api/proxy/systems**", route => json(route, { success: true, systems: [] }))
  await page.route("**/api/proxy/admin/accounts/scope/options/all**", route => json(route, {
    customer_id: "acme",
    accounts: [],
    groups: [],
  }))
  await page.route("**/api/proxy/admin/accounts**", async route => {
    const url = new URL(route.request().url())
    const pathname = url.pathname
    if (pathname.endsWith("/groups/all")) return json(route, { customer_id: "acme", groups: [], total: 0 })
    if (pathname.endsWith("/onboarding-operations") && route.request().method() === "POST") {
      if (setupUnavailable) {
        return json(route, {
          detail: {
            error: "account_onboarding_commands_unavailable",
            contract_version: "account-onboarding/v1",
            message: "Account onboarding command storage and worker wiring are not installed in this release.",
          },
        }, 503)
      }
      const request = route.request().postDataJSON() as Record<string, unknown>
      if (request.operation_type === "VALIDATE_ACCESS") {
        return json(route, { accepted: true, replayed: false, operation: operation(request, "BLOCKED") }, 202)
      }
      registerRequest = request
      return json(route, { accepted: true, replayed: false, operation: operation(request, "QUEUED") }, 202)
    }
    if (pathname.includes("/onboarding-operations/aon-register-fixture-0001")) {
      registrationReads += 1
      return json(route, { operation: operation(registerRequest!, stayQueued ? "QUEUED" : registrationReads === 1 ? "RUNNING" : "SUCCEEDED") })
    }
    if (pathname.endsWith("/api/proxy/admin/accounts")) {
      return json(route, {
        customer_id: "acme",
        accounts: [],
        total: 0,
        registry_available: true,
        summary: { connected: 0, needs_attention: 0, discovered: 0, mutation_enabled: 0 },
      })
    }
    return json(route, { detail: "unexpected fixture route" }, 404)
  })
  return { registrationReads: () => registrationReads }
}

async function openDialog(page: Page) {
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" })
  const addAccount = page.getByRole("button", { name: "Add AWS account" })
  await expect(addAccount).toHaveAttribute("data-hydrated", "true")
  await expect(addAccount).toBeEnabled()
  await addAccount.click()
  const dialog = page.getByRole("dialog", { name: "Add an AWS account" })
  await expect(dialog).toBeVisible()
  await expect(page.getByLabel("Account name")).toBeFocused()
  await page.getByLabel("Account name").fill("Payments production")
  await page.getByLabel("AWS account ID").fill("111111111111")
  await page.getByRole("button", { name: "Review installation" }).click()
  return dialog
}

async function screenshot(page: Page, name: string) {
  if (!ARTIFACT_DIR) return
  await mkdir(ARTIFACT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(ARTIFACT_DIR, name), fullPage: true })
}

test("desktop onboarding polls queued and running, then separates registration from blocked validation", async ({ context, page }) => {
  test.setTimeout(60_000)
  await seedAuthCookie(context)
  await routeSettings(page)
  await page.setViewportSize({ width: 1512, height: 900 })
  const dialog = await openDialog(page)

  await expect(dialog.getByText("Automated StackSet installation is unavailable")).toBeVisible()
  await expect(dialog.getByText("OFF")).toHaveCount(3)
  await expect(dialog.locator('[aria-disabled="true"]')).toHaveCount(3)
  await dialog.getByRole("button", { name: "Register metadata" }).click()
  await expect(dialog.getByText("Metadata registration: queued")).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Close account onboarding" })).toBeDisabled()
  await expect(dialog.getByText("Metadata registration: running")).toBeVisible({ timeout: 5_000 })
  await expect(dialog.getByText("Metadata registration: succeeded")).toBeVisible({ timeout: 5_000 })
  await expect(dialog.getByText("Metadata is registered; access is still off")).toBeVisible()
  await screenshot(page, "desktop-registration-succeeded.png")

  await dialog.getByRole("button", { name: "Validate access" }).click()
  await expect(dialog.getByText("Access validation: blocked")).toBeVisible()
  await expect(dialog.getByText("Live AWS validation is not installed in this worker release")).toBeVisible()
  await expect(dialog.getByText("The scoped access validation succeeded.")).toHaveCount(0)
  await expect(dialog.getByRole("button", { name: "Return to accounts" })).toBeEnabled()
  await screenshot(page, "desktop-validation-blocked.png")
})

test("compact 503 is a setup-unavailable state with no completion claim or horizontal clipping", async ({ context, page }) => {
  await seedAuthCookie(context)
  await routeSettings(page, true)
  await page.setViewportSize({ width: 1024, height: 768 })
  const dialog = await openDialog(page)

  await dialog.getByRole("button", { name: "Register metadata" }).click()
  const alert = dialog.getByRole("alert")
  await expect(alert).toContainText("Account setup is unavailable")
  await expect(alert).toContainText("Nothing was marked successful")
  await expect(dialog.getByText("Metadata is registered; access is still off")).toHaveCount(0)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await screenshot(page, "compact-setup-unavailable.png")
})

test("a permanently queued request stops polling when the Settings dialog unmounts", async ({ context, page }) => {
  await seedAuthCookie(context)
  const tracker = await routeSettings(page, false, true)
  await page.setViewportSize({ width: 1024, height: 768 })
  const dialog = await openDialog(page)
  await dialog.getByRole("button", { name: "Register metadata" }).click()
  await expect(dialog.getByText("Metadata registration: queued")).toBeVisible()
  await expect.poll(() => tracker.registrationReads()).toBeGreaterThanOrEqual(1)

  await page.goto("/login", { waitUntil: "domcontentloaded" })
  const readsAfterUnmount = tracker.registrationReads()
  await page.waitForTimeout(2_000)
  expect(tracker.registrationReads()).toBe(readsAfterUnmount)
})
