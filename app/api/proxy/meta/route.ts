import { NextResponse } from "next/server"
import { getBackendBaseUrl, getBackendUrlDiagnostics } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"

// Deploy verification must never hang on a cold Render worker — bound the
// identity probe and fail soft. /healthz is the backend's zero-I/O liveness
// endpoint, so a warm worker answers in milliseconds.
const BACKEND_IDENTITY_TIMEOUT_MS = 8_000

// Which backend build is actually live. Secretless by construction: /healthz
// returns only a status string and Render's injected build identity, which is
// exactly what this diagnostic exists to expose ("verify which backend a
// deploy is pointing at" — and now, which commit that backend is running).
async function backendIdentity() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BACKEND_IDENTITY_TIMEOUT_MS)
  try {
    const response = await fetch(`${getBackendBaseUrl()}/healthz`, {
      cache: "no-store",
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => null)) as {
      status?: string
      build_sha?: string
      build_branch?: string
      features?: Record<string, boolean> | null
    } | null
    return {
      reachable: response.ok,
      status: body?.status ?? null,
      // Absent on backend deploys predating the healthz build-identity
      // commit — the absence itself identifies an older build.
      build_sha: body?.build_sha ?? null,
      build_branch: body?.build_branch ?? null,
      // Effective mutation availability, as the backend gates compute it.
      // The Fixes tab reads this to present enforcement as Preview-only
      // while execution is disabled. Null on older backend builds.
      features: body?.features ?? null,
    }
  } catch (err) {
    return {
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  return NextResponse.json(
    { ...getBackendUrlDiagnostics(), backend: await backendIdentity() },
    { headers: { "Cache-Control": "no-store" } },
  )
}
