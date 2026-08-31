import { lookup } from "node:dns/promises"
import https from "node:https"
import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl, getBackendUrlDiagnostics } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const PROBE_TIMEOUT_MS = 6_000

type ProbeResult = {
  ok: boolean
  status?: number
  totalMs: number
  timedOut?: boolean
  error?: string
  socket?: {
    lookupMs?: number
    connectMs?: number
    tlsMs?: number
    firstByteMs?: number
  }
}

function elapsed(started: number): number {
  return Date.now() - started
}

function safeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function fetchProbe(url: string): Promise<ProbeResult> {
  const started = Date.now()
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    })
    await response.arrayBuffer().catch(() => undefined)
    return { ok: response.ok, status: response.status, totalMs: elapsed(started) }
  } catch (error) {
    const message = safeError(error)
    return {
      ok: false,
      totalMs: elapsed(started),
      timedOut: /TimeoutError|AbortError|timeout/i.test(message),
      error: message,
    }
  }
}

async function socketProbe(url: string): Promise<ProbeResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    let settled = false
    const socket: NonNullable<ProbeResult["socket"]> = {}
    const finish = (result: ProbeResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const request = https.get(url, { headers: { Accept: "application/json" } }, (response) => {
      socket.firstByteMs = elapsed(started)
      response.resume()
      response.once("end", () => finish({
        ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
        status: response.statusCode,
        totalMs: elapsed(started),
        socket,
      }))
    })
    request.once("socket", (connection) => {
      connection.once("lookup", () => { socket.lookupMs = elapsed(started) })
      connection.once("connect", () => { socket.connectMs = elapsed(started) })
      connection.once("secureConnect", () => { socket.tlsMs = elapsed(started) })
    })
    request.setTimeout(PROBE_TIMEOUT_MS, () => {
      request.destroy(new Error("socket probe timed out"))
    })
    request.once("error", (error) => finish({
      ok: false,
      totalMs: elapsed(started),
      timedOut: /timed out|timeout/i.test(error.message),
      error: safeError(error),
      socket,
    }))
  })
}

function optionalPaths(request: NextRequest): Array<{ name: string; url: string }> {
  const resourceId = request.nextUrl.searchParams.get("resource_id")
  const systemName = request.nextUrl.searchParams.get("system_name")
  const resourceType = request.nextUrl.searchParams.get("resource_type")
  const neo4jLabel = request.nextUrl.searchParams.get("neo4j_label")
  if (!resourceId) return []
  if (
    resourceId.length > 512 ||
    !/^[A-Za-z0-9:/_.@+=,-]+$/.test(resourceId) ||
    (systemName && !/^[A-Za-z0-9_.-]{1,128}$/.test(systemName)) ||
    (resourceType && !/^[A-Za-z0-9_.-]{1,64}$/.test(resourceType)) ||
    (neo4jLabel && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(neo4jLabel))
  ) {
    return []
  }

  const backend = getBackendBaseUrl()
  const inspectorQuery = new URLSearchParams({ window: "30d" })
  if (systemName) inspectorQuery.set("system_name", systemName)
  if (resourceType) inspectorQuery.set("resource_type", resourceType)
  const paths = [{
    name: "inspector",
    url: `${backend}/api/inspector/${encodeURIComponent(resourceId)}?${inspectorQuery.toString()}`,
  }]
  if (neo4jLabel) {
    paths.push({
      name: "readiness",
      url: `${backend}/api/decision-coverage/resource/${encodeURIComponent(neo4jLabel)}/${encodeURIComponent(resourceId)}`,
    })
  }
  return paths
}

export async function GET(request: NextRequest) {
  // Defence in depth: middleware already protects this route, but diagnostics
  // must remain inaccessible if middleware matching changes later. Customer-
  // resident deployments use ALB OIDC rather than this cookie, so the probe is
  // deliberately unavailable there.
  if (
    process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT" ||
    request.cookies.get("cyntro_auth")?.value !== "authenticated"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const backend = getBackendBaseUrl()
  const hostname = new URL(backend).hostname
  const dnsStarted = Date.now()
  const dns = await lookup(hostname, { all: true }).then(
    (records) => ({
      ok: true,
      ms: elapsed(dnsStarted),
      addressCount: records.length,
      families: [...new Set(records.map((record) => record.family))],
    }),
    (error) => ({ ok: false, ms: elapsed(dnsStarted), error: safeError(error) }),
  )

  const healthUrl = `${backend}/healthz`
  const [healthFetch, healthSocket, ...resourceProbes] = await Promise.all([
    fetchProbe(healthUrl),
    socketProbe(healthUrl),
    ...optionalPaths(request).map(async ({ name, url }) => ({ name, result: await fetchProbe(url) })),
  ])

  const payload = {
    checkedAt: new Date().toISOString(),
    routing: getBackendUrlDiagnostics(),
    dns,
    health: { fetch: healthFetch, socket: healthSocket },
    resources: resourceProbes,
  }

  if (request.headers.get("accept")?.includes("text/html")) {
    const escaped = JSON.stringify(payload, null, 2)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    return new NextResponse(
      `<!doctype html><html><head><meta charset="utf-8"><title>Cyntro transport diagnostics</title>` +
      `<style>body{font:14px ui-monospace,SFMono-Regular,monospace;padding:24px;background:#0f172a;color:#e2e8f0}` +
      `pre{white-space:pre-wrap}</style></head><body><h1>Cyntro transport diagnostics</h1><pre>${escaped}</pre></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } })
}
