import { NextResponse } from "next/server"

/**
 * RETIRED. This alias could start a real collection round with no lane
 * selection, no polling, no run binding and no activation proof.
 *
 * What it did: forwarded to `${backend}/api/v2/sync/start` with **no
 * `sources`**, so the backend ran its default lane — `vulnerability_findings`
 * — whatever the caller believed it was re-ingesting. It accepted `scope` and
 * `target` in the body and ignored both, so a per-system "Re-ingest" ran the
 * same tenant-wide round as the estate-wide one. Its caller
 * (`components/systems-view.tsx`) then reported "Sync from AWS started" off
 * the ENQUEUE response and refetched after two seconds, which is a freshness
 * claim built from a queue acknowledgement.
 *
 * Every one of those is something `lib/sync-surfaces.ts` exists to prevent:
 * a surface declares `requiredLanes`, stays disabled until each is CONNECTED,
 * and is only as fresh as a backend receipt covering all of them.
 *
 * It fails closed rather than being deleted so an un-migrated caller — in
 * this repo or any other — gets a named refusal instead of silently starting
 * an Inspector round. 410 Gone: the endpoint existed and deliberately does
 * not any more.
 */

export const dynamic = "force-dynamic"

const REFUSAL = {
  success: false,
  error: "reingest_alias_retired",
  reason:
    "POST /api/proxy/admin/reingest is retired. It started a refresh with no " +
    "lane selection, no status polling, no run binding and no activation " +
    "receipt, and its scope/target were ignored. Use the per-surface control " +
    "(RefreshEvidenceButton) which declares the lanes the screen needs, or " +
    "POST /api/proxy/sync/start with an explicit `sources` list and follow " +
    "/api/proxy/sync/status/{job_id} to an activation receipt.",
} as const

export async function POST() {
  return NextResponse.json(REFUSAL, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET() {
  return NextResponse.json(REFUSAL, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  })
}
