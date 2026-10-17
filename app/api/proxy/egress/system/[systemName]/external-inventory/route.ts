import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { systemChoiceDetail } from "@/lib/server/proxy-error"
import { upstreamCachePolicy } from "@/lib/server/proxy-cache-hygiene"

// Proxy for the External Egress Inventory endpoint — chunk #1 of the
// alert-only egress inventory MVP. Forwards filter/pagination params
// through verbatim; the backend does the classification + sort + slice.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const { searchParams } = new URL(req.url)
  const days = searchParams.get("days") || "30"
  const limit = searchParams.get("limit") || "50"
  const offset = searchParams.get("offset") || "0"
  const destinationClass = searchParams.get("destination_class")
  const recommendation = searchParams.get("recommendation")
  const strength = searchParams.get("strength")
  // chunk #1.5 + #2a forwarding: workload_id, summary, direction,
  // include_internal. Without these the backend falls back to chunk #1
  // defaults and the new UI features silently no-op.
  const workloadId = searchParams.get("workload_id")
  const summary = searchParams.get("summary")
  const direction = searchParams.get("direction")
  const includeInternal = searchParams.get("include_internal")

  const qs = new URLSearchParams({ days, limit, offset })
  if (destinationClass) qs.set("destination_class", destinationClass)
  if (recommendation) qs.set("recommendation", recommendation)
  if (strength) qs.set("strength", strength)
  if (workloadId) qs.set("workload_id", workloadId)
  if (summary) qs.set("summary", summary)
  if (direction) qs.set("direction", direction)
  if (includeInternal) qs.set("include_internal", includeInternal)
  // A7 B5: a page opened by key names ONE system (backend ?system_key=, with the account for a tag / source key).
  const systemKey = searchParams.get("system_key")
  const accountId = searchParams.get("account_id")
  if (systemKey) {
    qs.set("system_key", systemKey)
    if (accountId) qs.set("account_id", accountId)
  }

  try {
    const url = `${BACKEND_URL}/api/egress/system/${encodeURIComponent(
      systemName,
    )}/external-inventory?${qs.toString()}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
    })
    if (!res.ok) {
      // A7 B5: the 409 system choice is relayed (typed) so the page can offer it; every other refusal answers as before.
      const choice = systemChoiceDetail(await res.text().catch(() => ""))
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, ...(choice ? { detail: choice } : {}) },
        { status: res.status },
      )
    }
    // B5 review: a published answer is sent no-store by the backend; pass that on (this proxy never caches).
    const noStore = upstreamCachePolicy(res.headers.get("cache-control")) === "no-store"
    return NextResponse.json(await res.json(), noStore ? { headers: { "Cache-Control": "no-store" } } : undefined)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch external egress inventory" },
      { status: 502 },
    )
  }
}
