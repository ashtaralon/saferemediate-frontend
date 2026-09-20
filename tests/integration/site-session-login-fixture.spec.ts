import { expect, test, type BrowserContext } from "@playwright/test"
import { SITE_SESSION_COOKIE, liveBaseUrl, seedAuthCookie, signInThroughLogin } from "./live-auth"

// The site gate accepts only a sealed session the server issued at /api/auth/login.
// These run against the real `next start` app in fixture-e2e.yml, with that job's
// ephemeral SITE_PASSWORD; no value here is a credential anywhere else.
//
// This file sends the real password, so it is never traced. The application specs keep
// the suite's trace setting: they load the session the untraced bootstrap stored.
test.use({ trace: "off" })

const FORGED = "authenticated"

function sessionCookies(context: BrowserContext) {
  return context.cookies().then((all) => all.filter((c) => c.name === SITE_SESSION_COOKIE))
}

async function landedOn(context: BrowserContext): Promise<string> {
  const page = await context.newPage()
  await page.goto(`${liveBaseUrl()}/`)
  return new URL(page.url()).pathname
}

test.describe("site gate: sealed sessions only", () => {
  test("a wrong password is refused and issues no session", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { password: `wrong-${Date.now()}` },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(401)
    const issued = res
      .headersArray()
      .some((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith(`${SITE_SESSION_COOKIE}=`))
    expect(issued).toBe(false)
  })

  test("a missing password is refused", async ({ request }) => {
    const res = await request.post("/api/auth/login", { data: {}, failOnStatusCode: false })
    expect(res.status()).toBe(401)
  })

  test("the former forged constant cookie is refused and cleared", async ({ browser }) => {
    const context = await browser.newContext()
    await context.addCookies([
      {
        name: SITE_SESSION_COOKIE,
        value: FORGED,
        domain: new URL(liveBaseUrl()).hostname,
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Strict",
      },
    ])
    expect(await landedOn(context)).toBe("/login")
    expect((await sessionCookies(context)).some((c) => c.value === FORGED)).toBe(false)
    await context.close()
  })

  test("a tampered sealed session is refused", async ({ browser }) => {
    const context = await browser.newContext()
    await seedAuthCookie(context)
    const [real] = await sessionCookies(context)
    expect(real?.value.startsWith("v1.")).toBe(true)
    // Flip one DECODED byte of the AES-GCM tag and re-encode. Editing an encoded character is
    // not enough: the last base64url character can carry only padding bits and decode unchanged.
    const raw = Buffer.from(real.value.slice(3), "base64url")
    const flipped = Buffer.from(raw)
    flipped[flipped.length - 1] ^= 0x01
    expect(flipped.equals(raw)).toBe(false)
    const tampered = `v1.${flipped.toString("base64url")}`
    await context.clearCookies()
    await context.addCookies([{ ...real, value: tampered }])
    expect(await landedOn(context)).toBe("/login")
    await context.close()
  })

  test("a real sign-in issues a sealed session that passes the gate", async ({ browser }) => {
    const context = await browser.newContext()
    // A real POST to /api/auth/login, not the stored session: this is the test of sign-in itself.
    const issued = await signInThroughLogin(context)
    expect(issued.startsWith("v1.")).toBe(true)
    const [session] = await sessionCookies(context)
    expect(session?.value).toBeTruthy()
    expect(session.value).not.toBe(FORGED)
    expect(session.value.startsWith("v1.")).toBe(true)
    expect(await landedOn(context)).not.toBe("/login")
    await context.close()
  })
})
