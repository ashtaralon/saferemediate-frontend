// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import { POST as login } from "@/app/api/auth/login/route"
import { middleware } from "@/middleware"
import {
  SITE_SESSION_COOKIE,
  issueSiteSession,
  siteSessionConfigProblems,
  siteSessionSecret,
  siteSessionValid,
} from "@/lib/server/site-session"

// Synthetic values: each exists only inside this test process.
const PASSWORD = "test-site-password-not-a-credential"
const EXPLICIT = "test-explicit-sealing-key-0123456789abcdef"
const FORGED = "authenticated"

const saved = { ...process.env }
beforeEach(() => {
  delete process.env.SITE_PASSWORD
  delete process.env.CYNTRO_SITE_SESSION_SECRET
  delete process.env.CYNTRO_DEPLOYMENT_MODE
})
afterEach(() => {
  process.env = { ...saved }
})

/**
 * Flip one DECODED byte of a sealed `v1.<base64url(iv ‖ ciphertext ‖ tag)>` value and re-encode.
 * Editing an encoded character is not enough: the last base64url character can carry only padding
 * bits and decode to identical bytes, so a "tamper" there may change nothing at all.
 */
function flipByte(value: string, region: "iv" | "ciphertext" | "tag"): string {
  const raw = Buffer.from(value.slice(3), "base64url")
  const index = region === "iv" ? 0 : region === "tag" ? raw.length - 1 : 12
  const flipped = Buffer.from(raw)
  flipped[index] ^= 0x01
  expect(flipped.equals(raw)).toBe(false)
  return `v1.${flipped.toString("base64url")}`
}
const tamper = (value: string) => flipByte(value, "tag")

function loginRequest(body: unknown): Request {
  return new Request("https://app.example/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function sessionSetCookie(res: Response): string | undefined {
  return res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${SITE_SESSION_COOKIE}=`))
}

function pageRequest(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://app.example${path}`, cookie ? { headers: { cookie } } : undefined)
}

describe("sealed site session", () => {
  const env = { SITE_PASSWORD: PASSWORD }

  it("accepts a session this server issued", async () => {
    expect(await siteSessionValid(await issueSiteSession(env), env)).toBe(true)
  })

  it("refuses a flipped byte in the IV, the ciphertext and the authentication tag", async () => {
    const issued = await issueSiteSession(env)
    for (const region of ["iv", "ciphertext", "tag"] as const) {
      expect(await siteSessionValid(flipByte(issued, region), env)).toBe(false)
    }
  })

  it("refuses malformed values without throwing", async () => {
    const issued = await issueSiteSession(env)
    for (const value of ["", "v1.", "v1.!!!not-base64!!!", `v2.${issued.slice(3)}`, issued.slice(3),
                         "v1.AAAA", `${issued}x`.repeat(3), "authenticated; Path=/"]) {
      expect(await siteSessionValid(value, env)).toBe(false)
    }
    expect(await siteSessionValid(undefined, env)).toBe(false)
  })

  it("refuses the former forged constant, a tampered value, an expired one and another key's", async () => {
    const issued = await issueSiteSession(env)
    expect(await siteSessionValid(FORGED, env)).toBe(false)
    expect(await siteSessionValid(tamper(issued), env)).toBe(false)
    const in31Days = Math.floor(Date.now() / 1000) + 31 * 24 * 3600
    expect(await siteSessionValid(issued, env, in31Days)).toBe(false)
    expect(await siteSessionValid(issued, { SITE_PASSWORD: `${PASSWORD}-rotated` })).toBe(false)
  })

  it("admits nothing when no key is configured", async () => {
    expect(await siteSessionSecret({})).toBeNull()
    await expect(issueSiteSession({})).rejects.toThrow("site gate is not configured")
    expect(await siteSessionValid(await issueSiteSession(env), {})).toBe(false)
  })

  it("uses an explicit key of sufficient length, and silently ignores a short one", async () => {
    const explicit = { SITE_PASSWORD: PASSWORD, CYNTRO_SITE_SESSION_SECRET: EXPLICIT }
    const sealedExplicitly = await issueSiteSession(explicit)
    expect(await siteSessionValid(sealedExplicitly, explicit)).toBe(true)
    expect(await siteSessionValid(sealedExplicitly, env)).toBe(false)

    const short = { SITE_PASSWORD: PASSWORD, CYNTRO_SITE_SESSION_SECRET: "too-short" }
    // The short key is ignored without a word: this session validates under the DERIVED key,
    // which is exactly why the configuration check has to name it.
    expect(await siteSessionValid(await issueSiteSession(short), env)).toBe(true)
  })

  it("names configuration problems without ever quoting a value", () => {
    expect(siteSessionConfigProblems({})).toEqual([
      "SITE_PASSWORD is not set: the hosted site gate cannot sign anyone in",
    ])
    expect(siteSessionConfigProblems({ SITE_PASSWORD: PASSWORD })).toEqual([])
    const problems = siteSessionConfigProblems({
      SITE_PASSWORD: PASSWORD,
      CYNTRO_SITE_SESSION_SECRET: "too-short-distinctive-value",
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("CYNTRO_SITE_SESSION_SECRET is shorter than 32 characters")
    expect(problems.join(" ")).not.toContain("too-short-distinctive-value")
    expect(problems.join(" ")).not.toContain(PASSWORD)
  })
})

describe("POST /api/auth/login", () => {
  it("refuses with 500 when the site password is not configured", async () => {
    const res = await login(loginRequest({ password: PASSWORD }))
    expect(res.status).toBe(500)
    expect(sessionSetCookie(res)).toBeUndefined()
  })

  it("refuses a wrong, missing or non-string password and issues no session", async () => {
    process.env.SITE_PASSWORD = PASSWORD
    for (const body of [{ password: `${PASSWORD}-wrong` }, {}, { password: 42 }, "not json"]) {
      const res = await login(loginRequest(body))
      expect(res.status).toBe(401)
      expect(sessionSetCookie(res)).toBeUndefined()
    }
  })

  it("issues a sealed session for the right password, never the forged constant", async () => {
    process.env.SITE_PASSWORD = PASSWORD
    const res = await login(loginRequest({ password: PASSWORD }))
    expect(res.status).toBe(200)
    const cookie = sessionSetCookie(res)
    expect(cookie).toBeDefined()
    const value = cookie!.slice(`${SITE_SESSION_COOKIE}=`.length).split(";")[0]
    expect(value).not.toBe(FORGED)
    expect(value.startsWith("v1.")).toBe(true)
    expect(await siteSessionValid(value)).toBe(true)
    expect(cookie!.toLowerCase()).toContain("httponly")
    expect(cookie!.toLowerCase()).toContain("samesite=strict")
  })
})

describe("middleware site gate", () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD
  })

  it("redirects the former forged constant to /login and clears it", async () => {
    const res = await middleware(pageRequest("/", `${SITE_SESSION_COOKIE}=${FORGED}`))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login")
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith(`${SITE_SESSION_COOKIE}=`))
    expect(cleared).toBeDefined()
    expect(cleared!.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/)
  })

  it("redirects a tampered session and a missing one", async () => {
    const tampered = tamper(await issueSiteSession())
    const a = await middleware(pageRequest("/", `${SITE_SESSION_COOKIE}=${tampered}`))
    const b = await middleware(pageRequest("/"))
    expect(new URL(a.headers.get("location")!).pathname).toBe("/login")
    expect(new URL(b.headers.get("location")!).pathname).toBe("/login")
  })

  it("admits a session the server issued", async () => {
    const res = await middleware(pageRequest("/", `${SITE_SESSION_COOKIE}=${await issueSiteSession()}`))
    expect(res.headers.get("location")).toBeNull()
    expect(res.headers.get("x-middleware-next")).toBe("1")
  })

  it("always admits the sign-in page and route, and skips the gate in customer-resident mode", async () => {
    for (const path of ["/login", "/api/auth/login"]) {
      expect((await middleware(pageRequest(path))).headers.get("location")).toBeNull()
    }
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    expect((await middleware(pageRequest("/"))).headers.get("location")).toBeNull()
  })
})
