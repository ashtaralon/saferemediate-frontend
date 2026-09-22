// @vitest-environment node
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { sealJson } from "@/lib/server/operator-session"
import { SITE_SESSION_COOKIE, issueSiteSession, siteSessionValid } from "@/lib/server/site-session"

const ORIGIN = "https://console.example.test"

beforeEach(() => {
  process.env.SITE_PASSWORD = "correct horse battery staple"
  delete process.env.CYNTRO_SITE_SESSION_SECRET
  delete process.env.CYNTRO_DEPLOYMENT_MODE
})
afterEach(() => {
  delete process.env.SITE_PASSWORD
  delete process.env.CYNTRO_SITE_SESSION_SECRET
  delete process.env.CYNTRO_DEPLOYMENT_MODE
})

async function gate(path: string, cookie?: string) {
  const { middleware } = await import("@/middleware")
  return middleware(new NextRequest(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : undefined }))
}

const passed = (response: Response) => response.headers.get("x-middleware-next") === "1"
const redirectedToLogin = (response: Response) => [302, 307].includes(response.status) && new URL(response.headers.get("location") || "").pathname === "/login"

describe("sealed site session", () => {
  it("accepts only a session this server issued, within its lifetime", async () => {
    const issued = await issueSiteSession()
    expect(issued.startsWith("v1.")).toBe(true)
    expect(await siteSessionValid(issued)).toBe(true)
    expect(await siteSessionValid("authenticated")).toBe(false)
    expect(await siteSessionValid(`${issued.slice(0, -4)}AAAA`)).toBe(false)
    expect(await siteSessionValid(undefined)).toBe(false)
    expect(await siteSessionValid(issued, process.env, Math.floor(Date.now() / 1000) + 31 * 24 * 3600)).toBe(false)
  })

  it("does not accept a value sealed for another purpose, and rotating the password ends sessions", async () => {
    const issued = await issueSiteSession()
    const otherPurpose = await sealJson({ v: 1, kind: "site", iat: 1, exp: 9_999_999_999 }, "correct horse battery staple", "cyntro_operator_session")
    expect(await siteSessionValid(otherPurpose)).toBe(false)
    process.env.SITE_PASSWORD = "a rotated password"
    expect(await siteSessionValid(issued)).toBe(false)
  })

  it("prefers an explicit secret and refuses everything when the gate is not configured", async () => {
    process.env.CYNTRO_SITE_SESSION_SECRET = "s".repeat(40)
    const issued = await issueSiteSession()
    delete process.env.CYNTRO_SITE_SESSION_SECRET
    expect(await siteSessionValid(issued)).toBe(false)
    delete process.env.SITE_PASSWORD
    await expect(issueSiteSession()).rejects.toThrow()
    expect(await siteSessionValid(issued)).toBe(false)
  })
})

describe("login route", () => {
  it("issues a sealed Strict HttpOnly session for the right password only", async () => {
    const { POST } = await import("@/app/api/auth/login/route")
    const wrong = await POST(new Request(`${ORIGIN}/api/auth/login`, { method: "POST", body: JSON.stringify({ password: "nope" }) }))
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get("set-cookie")).toBeNull()
    const malformed = await POST(new Request(`${ORIGIN}/api/auth/login`, { method: "POST", body: "not json" }))
    expect(malformed.status).toBe(401)
    const right = await POST(new Request(`${ORIGIN}/api/auth/login`, { method: "POST", body: JSON.stringify({ password: "correct horse battery staple" }) }))
    const cookie = right.headers.get("set-cookie") || ""
    expect(right.status).toBe(200)
    expect(cookie).toMatch(/^cyntro_auth=v1\./)
    expect(cookie).not.toContain("cyntro_auth=authenticated")
    expect(cookie.toLowerCase()).toContain("httponly")
    expect(cookie.toLowerCase()).toContain("samesite=strict")
  })
})

describe("middleware site gate", () => {
  it("refuses and clears the former constant cookie and any hand-set value", async () => {
    for (const value of ["authenticated", "v1.forged", ""]) {
      const response = await gate("/settings/accounts", `${SITE_SESSION_COOKIE}=${value}`)
      expect(redirectedToLogin(response)).toBe(true)
    }
    const constant = await gate("/api/proxy/admin/accounts", `${SITE_SESSION_COOKIE}=authenticated`)
    expect(redirectedToLogin(constant)).toBe(true)
    expect(constant.headers.get("set-cookie") || "").toContain(`${SITE_SESSION_COOKIE}=;`)
  })

  it("admits an issued session to pages and proxies", async () => {
    const issued = await issueSiteSession()
    for (const path of ["/settings/accounts", "/api/proxy/admin/accounts", "/api/backend/health", "/api/auth/operator/start"]) {
      expect(passed(await gate(path, `${SITE_SESSION_COOKIE}=${issued}`)), path).toBe(true)
    }
  })

  it("never lets an image-like suffix skip the gate for API routes, dynamic pages or non-read methods", async () => {
    const { middleware, isPublicStaticRead } = await import("@/middleware")
    const probe = async (method: string, path: string, cookie?: string) =>
      middleware(new NextRequest(`${ORIGIN}${path}`, { method, headers: cookie ? { cookie } : undefined }))
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]) {
      for (const path of ["/api/proxy/s3-buckets/example.png", "/api/proxy/s3-buckets/example.svg", "/api/proxy/s3-buckets/example.ico", "/api/backend/probe.png", "/api/icon.png", "/inspector/sg-1.png", "/nhi-profile/x.svg"]) {
        for (const cookie of [undefined, `${SITE_SESSION_COOKIE}=authenticated`]) {
          expect(redirectedToLogin(await probe(method, path, cookie)), `${method} ${path} ${cookie ?? "anonymous"}`).toBe(true)
        }
      }
    }
    for (const path of ["/cyntro-logo.png", "/icon.svg", "/apple-icon.png", "/placeholder.jpg", "/favicon.ico", "/_next/webpack-hmr-probe.js"]) {
      expect(passed(await probe("GET", path)), path).toBe(true)
      expect(redirectedToLogin(await probe("POST", path)), `POST ${path}`).toBe(true)
    }
    expect(isPublicStaticRead("HEAD", "/icon-light-32x32.png")).toBe(true)
    expect(isPublicStaticRead("GET", "/design/topology-v0.2.html")).toBe(false)
  })

  it("keeps the deployed public paths reachable and unmounted operator routes gated", async () => {
    for (const path of ["/login", "/api/auth/login", "/api/healthz", "/api/build-version", "/api/proxy/meta", "/api/cron/warm"]) {
      expect(passed(await gate(path)), path).toBe(true)
    }
    expect(redirectedToLogin(await gate("/api/auth/operator/start"))).toBe(true)
    expect(redirectedToLogin(await gate("/api/auth/operator/callback"))).toBe(true)
  })

  it("leaves the customer-resident ALB mode unchanged", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    expect(passed(await gate("/settings/accounts"))).toBe(true)
  })
})
