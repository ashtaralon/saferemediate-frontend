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
  const backend = getBackendBaseUrl()
  const hostname = new URL(backend).hostname
  const dnsStarted = Date.now()
  const dns = await lookup(hostname, { all: true }).then(
    (records) => ({ ok: true, ms: elapsed(dnsStarted), addresses: records.map((record) => record.address) }),
    (error) => ({ ok: false, ms: elapsed(dnsStarted), error: safeError(error) }),
  )

  const healthUrl = `${backend}/healthz`
  const [healthFetch, healthSocket, ...resourceProbes] = await Promise.all([
    fetchProbe(healthUrl),
    socketProbe(healthUrl),
    ...optionalPaths(request).map(async ({ name, url }) => ({ name, result: await fetchProbe(url) })),
  ])

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    routing: getBackendUrlDiagnostics(),
    dns,
    health: { fetch: healthFetch, socket: healthSocket },
    resources: resourceProbes,
  }, { headers: { "Cache-Control": "no-store" } })
}
