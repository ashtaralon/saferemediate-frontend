/**
 * Operator sign-in in a real Chromium against the identity contract stack.
 *
 * Runs only when IDENTITY_STACK_FILE names a stack started by the backend's
 * tests/e2e_identity/run_identity_contract.py: a local TLS OIDC provider, the
 * real onboarding API with the service boundary enforced, and this console
 * built with `next build` and served by `next start`. The browser context
 * ignores certificate errors only for that provider's per-run CA; the console
 * and backend verify it strictly on the server side.
 */
import { expect, test, type Page } from "@playwright/test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const stackFile = process.env.IDENTITY_STACK_FILE
const stack = stackFile ? JSON.parse(readFileSync(stackFile, "utf8")) : null
const sitePassword = process.env.IDENTITY_STACK_SITE_PASSWORD || ""
const out = process.env.IDENTITY_STACK_OUT || "test-results/operator-identity"
const bindingPath = "/api/proxy/admin/accounts/onboarding/access-bindings"

test.skip(!stack || !sitePassword, "IDENTITY_STACK_FILE and IDENTITY_STACK_SITE_PASSWORD are set by run_identity_contract.py")
test.use({ baseURL: stack?.hosted_url, ignoreHTTPSErrors: true, trace: "on", channel: undefined })

const observations: Record<string, unknown> = {}

function record(name: string, value: unknown) {
  observations[name] = value
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, "browser-observations.json"), JSON.stringify(observations, null, 2))
}

async function signInToSite(page: Page) {
  await page.goto("/login")
  await page.getByPlaceholder("Enter password").fill(sitePassword)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith("/login")), page.getByRole("button").click()])
}

async function signInAsOperator(page: Page, persona = "operator") {
  await page.goto("/api/auth/operator/start?returnTo=%2Fsettings%2Faccounts")
  await expect(page).toHaveURL(new RegExp(`^${stack.idp_issuer}/authorize`))
  await page.locator(`input[name="persona"][value="${persona}"]`).check()
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/settings/accounts", { timeout: 30_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ])
}

test.describe.serial("hosted operator identity in Chromium", () => {
  test("operator sign-in stays behind the site gate", async ({ page }) => {
    await page.goto("/api/auth/operator/start?returnTo=%2Fsettings%2Faccounts")
    await expect(page).toHaveURL(/\/login$/)
    record("start_without_site_cookie", page.url())
  })

  test("signs in through the identity provider and lands on settings with a sealed session", async ({ page, context }) => {
    await signInToSite(page)
    await signInAsOperator(page)
    expect(new URL(page.url()).pathname).toBe("/settings/accounts")

    const cookies = await context.cookies()
    const session = cookies.find((cookie) => cookie.name === "cyntro_operator_session")
    const transaction = cookies.find((cookie) => cookie.name === "cyntro_operator_oidc_tx")
    expect(session).toBeTruthy()
    expect(session!.httpOnly).toBe(true)
    expect(session!.secure).toBe(true)
    expect(session!.sameSite).toBe("Lax")
    expect(transaction).toBeUndefined()
    expect(await page.evaluate(() => document.cookie)).not.toContain("cyntro_operator_session")

    const state = await page.evaluate(async () => (await fetch("/api/auth/operator/session")).json())
    expect(state).toMatchObject({ mode: "HOSTED_OIDC", configured: true, signed_in: true })
    record("signed_in", { landing: new URL(page.url()).pathname, cookie: { httpOnly: session!.httpOnly, secure: session!.secure, sameSite: session!.sameSite }, session: state })

    const created = await page.evaluate(async ({ bindingPath, tenant, account }) => {
      const response = await fetch(bindingPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract_version: "account-onboarding/v2", customer_id: tenant, account_id: account, purpose: "MEMBER_READ", external_id_source: "GENERATED" }),
      })
      const body = await response.json()
      return { status: response.status, cacheControl: response.headers.get("cache-control"), display: body.external_id_display, hasExternalId: Boolean(body.external_id) }
    }, { bindingPath, tenant: stack.tenant_id, account: stack.account_id })
    expect(created).toMatchObject({ status: 201, cacheControl: "no-store", display: "ONCE", hasExternalId: true })
    record("same_origin_binding", created)

    for (const [label, size] of Object.entries({ mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, laptop: { width: 1280, height: 800 }, desktop: { width: 1920, height: 1080 } })) {
      await page.setViewportSize(size)
      await page.goto("/settings/accounts")
      await expect(page).toHaveURL(/\/settings\/accounts$/)
      await page.screenshot({ path: path.join(out, `signed-in-settings-${label}.png`), fullPage: false })
    }
  })

  test("a form on another site cannot change account settings", async ({ page, context }) => {
    await signInToSite(page)
    await signInAsOperator(page)
    const attacker = await context.newPage()
    const target = new URL(`${stack.cross_site_page}`)
    target.searchParams.set("target", `${stack.hosted_url}${bindingPath}`)
    target.searchParams.set("customer_id", stack.tenant_id)
    target.searchParams.set("account_id", stack.account_id)
    await attacker.goto(target.toString())
    const [response] = await Promise.all([
      attacker.waitForResponse((reply) => reply.url().endsWith(bindingPath)),
      attacker.evaluate(() => (document.getElementById("f") as HTMLFormElement).submit()),
    ])
    const sentHeaders = await response.request().allHeaders()
    const body = await response.json()
    expect(response.status()).toBe(403)
    expect(body.error).toBe("CROSS_SITE_REQUEST_REFUSED")
    expect(sentHeaders.cookie || "").not.toContain("cyntro_operator_session")
    record("cross_site_form", { status: response.status(), error: body.error, origin: sentHeaders.origin, session_cookie_sent: (sentHeaders.cookie || "").includes("cyntro_operator_session") })
  })

  test("sign-out clears the session and hands over the provider end-session URL", async ({ page, context }) => {
    await signInToSite(page)
    await signInAsOperator(page)
    const result = await page.evaluate(async () => (await fetch("/api/auth/operator/logout", { method: "POST" })).json())
    expect(result.signed_in).toBe(false)
    expect(result.end_session_url).toContain(`${stack.idp_issuer}/logout`)
    expect(result.end_session_url).not.toContain("id_token_hint")
    expect((await context.cookies()).some((cookie) => cookie.name === "cyntro_operator_session")).toBe(false)
    const after = await page.evaluate(async () => (await fetch("/api/auth/operator/session")).json())
    expect(after.signed_in).toBe(false)
    const read = await page.evaluate(async (tenant) => {
      const response = await fetch(`/api/proxy/admin/accounts/onboarding/operations?customer_id=${tenant}`)
      return { status: response.status, error: (await response.json())?.detail?.error }
    }, stack.tenant_id)
    expect(read).toEqual({ status: 401, error: "OPERATOR_IDENTITY_REQUIRED" })
    await page.goto(result.end_session_url)
    await expect(page.getByText("Signed out of the QA identity provider.")).toBeVisible()
    record("sign_out", { end_session_host: new URL(result.end_session_url).host, after, read })
  })
})
