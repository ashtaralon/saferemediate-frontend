/**
 * Test support for the captured bodies in this directory. They are copied unchanged from
 * agent-coordinator/interfaces/semantic-r274-identity-data-access-fixtures-fe16eb0b (SOURCES.md says how
 * they were produced; SHA256SUMS pins them). Semantic re-captured all ten at the sealed backend candidate
 * b9a796531f3ca2cea822510f2fbfefe4151aba81 and they are byte-identical. Each file is
 * `{"http_status", "body"}` as the backend's mounted `GET /api/identity-data-access` answered it.
 *
 * Only the external transport is replaced. `startServer` runs the REAL Node startup hook
 * (instrumentation.register: the deployment-config check and the installed service-token writer) with
 * BACKEND_URL_OVERRIDE naming the fake backend; `backendSocket` answers that origin with the captured body
 * the test chooses; `callRoute` drives the REAL `/api/proxy/identities/data-access/[name]` route, whose
 * proof selection is the real `selectBackendProof`. Install the socket BEFORE `startServer`, so the
 * writer wraps it exactly as it wraps the platform fetch in production.
 */
import fs from "node:fs"
import path from "node:path"
import { NextRequest } from "next/server"

import { GET } from "@/app/api/proxy/identities/data-access/[name]/route"
import { register } from "@/instrumentation"

export const BACKEND = "https://customer-backend.example"
export const ROLE_NAME = "fixture-web-role"
export const ROLE_ARN = "arn:aws:iam::111122223333:role/fixture-web-role"
export const RESIDENT_HEADERS = { "x-amzn-oidc-identity": "operator-1", "x-amzn-oidc-data": "signed-claims" }
// Synthetic values that exist only inside the test process; distinctive so any leak is detectable.
export const SERVICE_TOKEN = "idatest-service-token-VALUE-0123456789"
export const SITE_PASSWORD = "idatest-site-password-VALUE"

export const CAPTURED = [
  "01-ready-populated",
  "02-ready-genuine-empty",
  "03-ready-table-not-computed",
  "04-identity-unknown",
  "05-out-of-scope",
  "06-lifecycle-refusal",
  "07-unauthenticated-401",
  "08-partial-with-rows",
  "09-partial-empty",
  "10-inferred-table-access",
] as const
export type CapturedName = (typeof CAPTURED)[number]

export const FIXTURE_DIR = __dirname
const MARKER = Symbol.for("cyntro.customerBackendAuthFetch")
const STARTUP_ENV = ["NEXT_RUNTIME", "BACKEND_URL_OVERRIDE", "CYNTRO_SERVICE_TOKEN", "CYNTRO_DEPLOYMENT_MODE",
  "SITE_PASSWORD", "CYNTRO_SITE_SESSION_SECRET"]

export function captured(name: CapturedName): { http: number; body: any } {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`), "utf8"))
  return { http: raw.http_status, body: raw.body }
}

/**
 * A captured body with one deliberate change: a negative control for this reader, never producer output.
 * Throws if the change changed nothing, so a mistyped path cannot pass as a caught mutation.
 */
export function mutatedCapture(name: CapturedName, change: (body: any) => void): { http: number; body: any } {
  const { http, body } = captured(name)
  const copy = structuredClone(body)
  change(copy)
  if (JSON.stringify(copy) === JSON.stringify(body)) throw new Error(`mutation of ${name} changed nothing`)
  return { http, body: copy }
}

export interface Sent {
  url: URL
  headers: Headers
}

export type Reply = { http: number; body: unknown } | { raw: string; http: number } | { throws: true }

/**
 * A fetch that answers the backend origin with `reply()`, recording what was sent. `sameOrigin` answers a
 * page's relative calls (a UI test routes them to the real proxy); anything else fails loudly.
 */
export function backendSocket(
  reply: () => Reply,
  sent: Sent[],
  sameOrigin?: (url: URL) => Promise<Response>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (raw.startsWith("/") && sameOrigin) return sameOrigin(new URL(raw, "https://app.example"))
    if (!raw.startsWith(`${BACKEND}/`)) throw new TypeError(`unexpected fetch ${raw}`)
    sent.push({ url: new URL(raw), headers: new Headers(init?.headers) })
    const chosen = reply()
    if ("throws" in chosen) throw new TypeError("backend socket closed")
    if ("raw" in chosen) return new Response(chosen.raw, { status: chosen.http })
    return Response.json(chosen.body, { status: chosen.http })
  }) as typeof fetch
}

/** Run the real Node startup hook for one deployment shape. */
export async function startServer(
  mode: "customer_resident" | "hosted",
  { serviceToken = SERVICE_TOKEN as string | null } = {},
): Promise<void> {
  process.env.NEXT_RUNTIME = "nodejs"
  process.env.BACKEND_URL_OVERRIDE = BACKEND
  if (serviceToken) process.env.CYNTRO_SERVICE_TOKEN = serviceToken
  else delete process.env.CYNTRO_SERVICE_TOKEN
  if (mode === "customer_resident") {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    delete process.env.SITE_PASSWORD
  } else {
    delete process.env.CYNTRO_DEPLOYMENT_MODE
    process.env.SITE_PASSWORD = SITE_PASSWORD
  }
  await register()
}

/** Undo `startServer`: the writer's marker and the startup environment. The caller unstubs fetch. */
export function stopServer(saved: Record<string, string | undefined>): void {
  delete (globalThis as Record<symbol, unknown>)[MARKER]
  for (const name of STARTUP_ENV) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
}

export async function routeResponse(
  { name = ROLE_NAME, arn = ROLE_ARN as string | null, headers = RESIDENT_HEADERS as Record<string, string> } = {},
): Promise<Response> {
  const url = new URL(`https://app.example/api/proxy/identities/data-access/${encodeURIComponent(name)}`)
  if (arn !== null) url.searchParams.set("arn", arn)
  return GET(new NextRequest(url, { headers }), { params: Promise.resolve({ name }) })
}

export async function callRoute(
  options: Parameters<typeof routeResponse>[0] = {},
): Promise<{ status: number; body: any; text: string; headers: Headers }> {
  const res = await routeResponse(options)
  const text = await res.text()
  return { status: res.status, body: JSON.parse(text), text, headers: res.headers }
}
