/**
 * Test support for the captured bodies in this directory (see SOURCES.md): the page's same-origin Decision list calls
 * go through the REAL `/api/proxy/resource-inventory/decision-list` route in its customer-resident shape (both ALB
 * OIDC headers present), and only the backend socket is replaced, by the captured body the test chooses.
 *
 * The importing test file must mock `@/lib/server/backend-url` to return BACKEND and set
 * `CYNTRO_DEPLOYMENT_MODE=CUSTOMER_RESIDENT`.
 */
import fs from "node:fs"
import path from "node:path"
import { NextRequest } from "next/server"

import { GET as decisionListRoute } from "@/app/api/proxy/resource-inventory/decision-list/route"

export const BACKEND = "https://customer-backend.example"

export function capturedFile(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`), "utf8"))
}

export function captured(name: string): { http: number; body: unknown } {
  const { http, body } = capturedFile(name)
  return { http: http as number, body }
}

/** What the backend socket saw: the alias and the full forwarded query of every call. */
export interface UpstreamCall {
  alias: string
  query: Record<string, string>
}

export type Reply = string | { deferred: Promise<string> } | { throws: true }

/**
 * Install a page `fetch` that routes Decision list calls through the real proxy route and answers the backend socket
 * with `reply(alias, query)`. `other` answers any other same-origin call (return undefined to fail the test loudly).
 */
export function routeThroughProxy(
  reply: (alias: string, query: Record<string, string>) => Reply,
  upstream: UpstreamCall[],
  other: (raw: string) => Response | undefined = () => undefined,
): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (raw.startsWith("/api/proxy/resource-inventory/decision-list")) {
      return decisionListRoute(new NextRequest(new URL(raw, "https://app.example"), {
        headers: { "x-amzn-oidc-identity": "user-1", "x-amzn-oidc-data": "signed-claims" },
      }))
    }
    if (raw.startsWith(BACKEND)) {
      const url = new URL(raw)
      const query = Object.fromEntries(url.searchParams)
      const alias = query.resource_type ?? ""
      upstream.push({ alias, query })
      const chosen = reply(alias, query)
      if (typeof chosen === "object" && "throws" in chosen) throw new TypeError("backend socket closed")
      const name = typeof chosen === "string" ? chosen : await chosen.deferred
      const { http, body } = captured(name)
      return Response.json(body, { status: http })
    }
    const answered = other(raw)
    if (answered) return answered
    throw new TypeError(`unexpected fetch ${raw}`)
  }) as typeof fetch
}
