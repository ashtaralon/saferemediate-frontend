import { NextRequest, NextResponse } from "next/server"

/**
 * GET proxy for /api/exposure/findings/sg/{sgId} — the Risk Potential
 * card data for one SecurityGroup. Backend route is feature-flag gated
 * by CYNTRO_EXPOSURE_FINDINGS_ENABLED on Render; when off it returns
 * 404 and the frontend falls back to the legacy DamagePanel (handled
 * by PotentialDamageSection in path-analysis-panel.tsx).
 *
 * Forward-through pattern, same as the egress/posture and attack-chain
 * canvas proxies. 55s timeout to clear the Render cold-start window.
 * Pass `?refresh=true` after a remediation lands to bust upstream
 * proxy caches (backend honors this with Cache-Control: no-store).
 */

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

interface RouteContext {
  params: Promise<{ sgId: string }>
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { sgId } = await ctx.params
  if (!sgId) {
    return NextResponse.json({ error: "missing_sg_id" }, { status: 400 })
  }
  const url = new URL(req.url)
  const includeLow = url.searchParams.get("include_low") === "true"
  const refresh = url.searchParams.get("refresh") === "true"
  const qs = new URLSearchParams()
  if (includeLow) qs.set("include_low", "true")
  if (refresh) qs.set("refresh", "true")
  const suffix = qs.toString() ? `?${qs.toString()}` : ""

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 55_000)
  try {
    const upstreamRes = await fetch(
      `${BACKEND_URL}/api/exposure/findings/sg/${encodeURIComponent(sgId)}${suffix}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    )
    clearTimeout(timeout)
    if (upstreamRes.status === 404) {
      // Flag off — surface as 404 so the panel cleanly falls back to legacy
      return NextResponse.json(
        { error: "not_found", detail: "exposure findings not enabled" },
        { status: 404 },
      )
    }
    if (!upstreamRes.ok) {
      const text = await upstreamRes.text()
      return NextResponse.json(
        { error: `backend ${upstreamRes.status}`, detail: text.slice(0, 500) },
        { status: upstreamRes.status },
      )
    }
    const data = await upstreamRes.json()
    const cacheControl = refresh
      ? "no-store, no-cache, must-revalidate, max-age=0"
      : "public, s-maxage=300, stale-while-revalidate=60"
    return NextResponse.json(data, {
      headers: { "Cache-Control": cacheControl },
    })
  } catch (err: unknown) {
    clearTimeout(timeout)
    const e = err as { name?: string; message?: string }
    const msg =
      e?.name === "AbortError" ? "upstream timeout" : String(e?.message ?? err)
    return NextResponse.json(
      { error: "proxy_error", detail: msg },
      { status: 502 },
    )
  }
}
