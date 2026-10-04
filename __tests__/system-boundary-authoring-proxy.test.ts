/**
 * System Boundary authoring proxy (lib/server/authoring-proxy.ts), through the mounted route handlers.
 *
 * Exactly seven backend routes; the console's own origin for a write (the imported account-admin predicate, both of
 * its branches); only the load balancer's two headers on a customer-resident install; a JSON body bounded in bytes
 * before it is materialized; no cache, no redirect, no retry; the backend's answer relayed byte for byte.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const backend = vi.hoisted(() => ({ fail: false }))
vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => {
    if (backend.fail) throw new Error("[backend-url] FATAL: not configured")
    return "https://customer-backend.example"
  },
}))

import { GET, POST } from "@/app/api/proxy/system-boundary/[...path]/route"
import { AUTHORING_MAX_BODY_BYTES, AUTHORING_MAX_CURSOR } from "@/lib/server/authoring-proxy"

const APP = "https://app.example"
const PROXY = `${APP}/api/proxy/system-boundary`
const UPSTREAM = "https://customer-backend.example/api/system-boundary"
const RID = "0f8fad5b-d9cb-469f-a165-70867728950e"
const ALB_DATA = "signed.alb.claims"
const ALB_TOKEN = "alb-obtained-access-token"
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" }
const JSON_TYPE = { "content-type": "application/json" }

type Init = { method?: string; headers?: Record<string, string>; body?: BodyInit }

/** happy-dom's Request drops forbidden headers (Origin, Sec-Fetch-Site, Cookie) given to the constructor; setting
 * them afterwards keeps them, as a browser's request has. */
function browserRequest(url: string, { headers = {}, ...init }: Init = {}) {
  const options = { ...init, ...(init.body instanceof ReadableStream ? { duplex: "half" } : {}) }
  const request = new NextRequest(url, options as ConstructorParameters<typeof NextRequest>[1])
  for (const [name, value] of Object.entries(headers)) request.headers.set(name, value)
  return request
}

function send(method: "GET" | "POST", path: string, init: Omit<Init, "method"> = {}) {
  return (method === "GET" ? GET : POST)(browserRequest(`${PROXY}/${path}`, { method, ...init }))
}

function upstreamCall(upstream: { mock: { calls: unknown[][] } }, call = 0) {
  const [url, init] = upstream.mock.calls[call] as [URL | string, RequestInit]
  return { url: String(url), init, headers: init.headers as Record<string, string> }
}

function backendAnswers(response: Response = Response.json({ ok: true })) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response)
}

afterEach(() => {
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  delete process.env.CYNTRO_ALLOWED_ORIGINS
  backend.fail = false
  vi.restoreAllMocks()
})

function resident() {
  process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
  process.env.CYNTRO_ALLOWED_ORIGINS = APP
}

describe("authoring proxy -- exactly the seven routes", () => {
  it.each([
    ["GET", "declarations/view", "declarations/view"],
    ["GET", "declarations/head", "declarations/head"],
    ["POST", "declarations", "declarations"],
    ["POST", "declarations/corrections", "declarations/corrections"],
    ["GET", "declarations/requests?limit=2&cursor=abc%2Bdef", "declarations/requests?limit=2&cursor=abc%2Bdef"],
    ["GET", "declarations/requests", "declarations/requests"],
    ["GET", `declarations/requests/${RID}`, `declarations/requests/${RID}`],
    ["GET", "authoring-grants/self", "authoring-grants/self"],
  ] as const)("%s %s reaches exactly its backend route, uncached, never following a redirect", async (method, path, target) => {
    resident()
    const upstream = backendAnswers()
    const response = await send(method, path, method === "POST" ? { headers: { ...SAME_ORIGIN, ...JSON_TYPE }, body: "{}" } : {})

    expect(upstream).toHaveBeenCalledTimes(1)
    const { url, init } = upstreamCall(upstream)
    expect(url).toBe(`${UPSTREAM}/${target}`)
    expect([init.method, init.cache, init.redirect]).toEqual([method, "no-store", "error"])
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it.each([
    ["GET", "systems"],
    ["POST", "systems"],
    ["GET", "seeds"],
    ["POST", "authoring-grants"],
    ["POST", "authoring-grants/self/revoke"],
    ["GET", "authoring-grants/subject"],
    ["GET", "declarations"],
    ["POST", "declarations/view"],
    ["GET", "declarations/view/"],
    ["GET", "declarations%2Fview"],
    ["GET", "declarations/../systems"],
    ["GET", "declarations/%2e%2e/systems"],
    ["GET", "declarations/requests/NOT-A-UUID"],
    ["GET", `declarations/requests/${RID.toUpperCase()}`],
    ["GET", `declarations/requests/${RID}/more`],
  ] as const)("refuses %s %s by name and forwards nothing", async (method, path) => {
    resident()
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await send(method, path, method === "POST" ? { headers: { ...SAME_ORIGIN, ...JSON_TYPE }, body: "{}" } : {})

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ detail: { code: "AUTHORING_ROUTE_UNKNOWN" } })
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each([
    "declarations/requests?limit=2&extra=1",
    "declarations/requests?limit=2&limit=3",
    "declarations/requests?limit=abc",
    "declarations/requests?limit=123",
    "declarations/requests?cursor=",
    `declarations/requests?cursor=${"c".repeat(AUTHORING_MAX_CURSOR + 1)}`,
    "declarations/view?x=1",
    "declarations/head?limit=1",
    "authoring-grants/self?subject=someone",
  ])("refuses a query the route does not take (%s) and forwards nothing", async (path) => {
    resident()
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await send("GET", path)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ detail: { code: "AUTHORING_QUERY_INVALID" } })
    expect(upstream).not.toHaveBeenCalled()
  })

  it("forwards a cursor of exactly the bound", async () => {
    resident()
    const upstream = backendAnswers()
    await send("GET", `declarations/requests?cursor=${"c".repeat(AUTHORING_MAX_CURSOR)}`)
    expect(upstreamCall(upstream).url).toBe(`${UPSTREAM}/declarations/requests?cursor=${"c".repeat(AUTHORING_MAX_CURSOR)}`)
  })
})

describe("authoring proxy -- a customer-resident write comes from this console's own origin", () => {
  it.each([
    ["Sec-Fetch-Site cross-site, even with this console's Origin", { "sec-fetch-site": "cross-site", origin: APP }],
    ["Sec-Fetch-Site same-site", { "sec-fetch-site": "same-site" }],
    ["Sec-Fetch-Site none, even with this console's Origin", { "sec-fetch-site": "none", origin: APP }],
    ["no Sec-Fetch-Site and a foreign Origin", { origin: "https://attacker.example" }],
    ["no Sec-Fetch-Site and Origin null", { origin: "null" }],
    ["neither header", {}],
  ])("refuses a save with %s, before reading or forwarding anything", async (_label, provenance) => {
    resident()
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await send("POST", "declarations", { headers: { ...provenance, ...JSON_TYPE }, body: "{}" })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ detail: { code: "AUTHORING_ORIGIN_REFUSED" } })
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each([
    ["Sec-Fetch-Site same-origin and no Origin at all", SAME_ORIGIN],
    ["no Sec-Fetch-Site and exactly this console's Origin", { origin: APP }],
  ])("forwards a correction with %s", async (_label, provenance) => {
    resident()
    const upstream = backendAnswers()
    const response = await send("POST", "declarations/corrections", { headers: { ...provenance, ...JSON_TYPE }, body: "{}" })
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
  })

  it("refuses the Origin fallback when no console origin is configured", async () => {
    resident()
    delete process.env.CYNTRO_ALLOWED_ORIGINS
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await send("POST", "declarations", { headers: { origin: APP, ...JSON_TYPE }, body: "{}" })
    expect(response.status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it("does not gate reads: a cross-site GET of the view is relayed", async () => {
    resident()
    const upstream = backendAnswers()
    const response = await send("GET", "declarations/view", { headers: { "sec-fetch-site": "cross-site" } })
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
  })
})

describe("authoring proxy -- the person's identity", () => {
  it("customer-resident: exactly the ALB's two headers -- never the browser's Authorization or cookies", async () => {
    resident()
    const upstream = backendAnswers()
    await send("POST", "declarations", {
      headers: {
        ...SAME_ORIGIN, ...JSON_TYPE, "x-amzn-oidc-data": ALB_DATA, "x-amzn-oidc-accesstoken": ALB_TOKEN,
        authorization: "Bearer browser-supplied", cookie: "cyntro_operator_session=abc",
      },
      body: "{}",
    })
    expect(upstreamCall(upstream).headers).toEqual({
      Accept: "application/json", "Content-Type": "application/json", "X-Amzn-Oidc-Data": ALB_DATA,
      Authorization: `Bearer ${ALB_TOKEN}`,
    })
  })

  it("customer-resident: no ALB token means no bearer at all -- a browser one is not substituted", async () => {
    resident()
    const upstream = backendAnswers(Response.json({ detail: { code: "PERSON_TOKEN_REQUIRED" } }, { status: 401 }))
    const response = await send("GET", "declarations/view", { headers: { authorization: "Bearer browser-supplied" } })
    expect(upstreamCall(upstream).headers).toEqual({ Accept: "application/json" })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ detail: { code: "PERSON_TOKEN_REQUIRED" } })
  })

  it("hosted plane: the browser's own bearer, and no ALB header, as account administration does", async () => {
    const upstream = backendAnswers()
    await send("GET", "declarations/head", { headers: { authorization: "Bearer hosted-session", "x-amzn-oidc-data": ALB_DATA } })
    expect(upstreamCall(upstream).headers).toEqual({ Accept: "application/json", Authorization: "Bearer hosted-session" })
  })
})

describe("authoring proxy -- the body: JSON, bounded in bytes before it is materialized", () => {
  it.each([["text/plain"], [""]])("refuses content-type %j and forwards nothing", async (type) => {
    resident()
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await send("POST", "declarations", { headers: { ...SAME_ORIGIN, ...(type ? { "content-type": type } : {}) }, body: "{}" })
    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({ detail: { code: "AUTHORING_CONTENT_TYPE_INVALID" } })
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each([
    ["a declared length one over the cap", { "content-length": String(AUTHORING_MAX_BODY_BYTES + 1) }, 413, "REQUEST_BODY_TOO_LARGE"],
    ["a declared length that is not a number", { "content-length": "12abc" }, 400, "CONTENT_LENGTH_INVALID"],
  ])("refuses %s unread", async (_label, length, status, code) => {
    resident()
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await send("POST", "declarations", { headers: { ...SAME_ORIGIN, ...JSON_TYPE, ...length }, body: "{}" })
    expect(response.status).toBe(status)
    expect((await response.json()).detail.code).toBe(code)
    expect(upstream).not.toHaveBeenCalled()
  })

  it("counts a chunked body with no declared length and drops it at cap + 1", async () => {
    resident()
    const upstream = vi.spyOn(globalThis, "fetch")
    const chunk = new Uint8Array(65_536).fill(0x20)
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > AUTHORING_MAX_BODY_BYTES) return controller.close()
        sent += chunk.byteLength
        controller.enqueue(chunk)
      },
    })
    const response = await send("POST", "declarations", { headers: { ...SAME_ORIGIN, ...JSON_TYPE }, body: stream })
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ detail: { code: "REQUEST_BODY_TOO_LARGE", limit: AUTHORING_MAX_BODY_BYTES } })
    expect(upstream).not.toHaveBeenCalled()
    expect(sent).toBeLessThanOrEqual(AUTHORING_MAX_BODY_BYTES + 2 * chunk.byteLength)   // stopped, not drained
  })

  it("counts BYTES: a multibyte body under the cap in characters but over it in bytes is refused", async () => {
    resident()
    const upstream = vi.spyOn(globalThis, "fetch")
    const body = "é".repeat(AUTHORING_MAX_BODY_BYTES / 2 + 1)            // 524,289 characters, 1,048,578 bytes
    const response = await send("POST", "declarations", { headers: { ...SAME_ORIGIN, ...JSON_TYPE }, body })
    expect(response.status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it("forwards exactly the cap, byte for byte", async () => {
    resident()
    const upstream = backendAnswers()
    const body = new TextEncoder().encode(`"${"é".repeat((AUTHORING_MAX_BODY_BYTES - 2) / 2)}"`)
    expect(body.byteLength).toBe(AUTHORING_MAX_BODY_BYTES)
    await send("POST", "declarations", { headers: { ...SAME_ORIGIN, ...JSON_TYPE }, body })
    const forwarded = upstreamCall(upstream).init.body as Uint8Array
    expect(forwarded.byteLength).toBe(AUTHORING_MAX_BODY_BYTES)
    expect(Buffer.from(forwarded).equals(Buffer.from(body))).toBe(true)
  })
})

describe("authoring proxy -- the backend's answer, and no answer", () => {
  it.each([
    [201, { outcome: "SAVED", request_id: RID }],
    [409, { detail: { code: "REQUEST_ID_REUSED" } }],
    [403, { detail: { code: "RECEIPT_WITHHELD", request_id: RID, revision: 3 } }],
    [503, { detail: { code: "OUTCOME_UNKNOWN", request_id: RID, reason: "NOT_PROVEN", retry: "resend the same request_id and body" } }],
  ])("relays a %s and its body byte for byte, uncached, without the backend's cookies", async (status, payload) => {
    resident()
    const raw = JSON.stringify(payload)
    backendAnswers(new Response(raw, { status, headers: { "content-type": "application/json", "set-cookie": "backend=1" } }))
    const response = await send("POST", "declarations", { headers: { ...SAME_ORIGIN, ...JSON_TYPE }, body: "{}" })
    expect(response.status).toBe(status)
    expect(await response.text()).toBe(raw)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("relays a non-JSON 200 verbatim: judging it is the client's job, never the proxy's", async () => {
    resident()
    backendAnswers(new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } }))
    const response = await send("GET", "declarations/view")
    expect([response.status, response.headers.get("content-type"), await response.text()]).toEqual([200, "text/html", "<html>gateway</html>"])
  })

  it.each([
    ["the network fails", new TypeError("fetch failed")],
    ["the backend answers with a redirect (redirect: error)", new TypeError("unexpected redirect")],
  ])("answers a named 502 when %s, and does not retry", async (_label, failure) => {
    resident()
    const upstream = vi.spyOn(globalThis, "fetch").mockRejectedValue(failure)
    const response = await send("POST", "declarations", { headers: { ...SAME_ORIGIN, ...JSON_TYPE }, body: "{}" })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ detail: { code: "AUTHORING_BACKEND_UNAVAILABLE" } })
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(upstreamCall(upstream).init.redirect).toBe("error")
  })

  it("answers the same named 502 when the backend's answer is cut off mid-body", async () => {
    resident()
    const cut = new ReadableStream({ start: (controller) => controller.error(new Error("connection reset")) })
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(cut, { status: 201, headers: { "content-type": "application/json" } }))
    const response = await send("POST", "declarations", { headers: { ...SAME_ORIGIN, ...JSON_TYPE }, body: "{}" })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ detail: { code: "AUTHORING_BACKEND_UNAVAILABLE" } })
  })

  it("relays a 204 with no body", async () => {
    resident()
    backendAnswers(new Response(null, { status: 204 }))
    const response = await send("GET", "declarations/view")
    expect([response.status, await response.text(), response.headers.get("cache-control")]).toEqual([204, "", "no-store"])
  })

  it("refuses by name, forwarding nothing, when this install names no backend", async () => {
    resident()
    backend.fail = true
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await send("GET", "declarations/view")
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ detail: { code: "AUTHORING_BACKEND_NOT_CONFIGURED" } })
    expect(upstream).not.toHaveBeenCalled()
  })
})
