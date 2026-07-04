import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Render keep-warm ping + identity-attack-paths snapshot prewarm.
 *
 * Render's hosted Python backend cold-cycles after ~15 min of idle (the
 * service tier sleeps the worker when nothing is hitting it). Every
 * cold-cycle costs operators a 100s+ first-fetch on whichever endpoint
 * happened to be theirs — observed 2026-06-22 with the `by-crown-jewel`
 * stall (104s cold → 8.8s → 0.7s warm probe curve). A response cache
 * doesn't help because the first click on the slow path IS the cache
 * miss and cold workers can't serve cached responses anyway.
 *
 * Part 1 — keep the worker awake: ping a cheap authoritative backend
 * endpoint (`/api/systems`) every 10 minutes (see vercel.json `crons`).
 * We read the response body for part 2, but the wake side-effect is the
 * point: elapsed > 5000ms = we caught a cold worker.
 *
 * Part 2 — prewarm identity-attack-paths durable snapshots: the Risk →
 * Attack Paths tab reads GET /api/identity-attack-paths/{system} (8×8),
 * a 45-91s compute on alon-prod-scale systems that overflowed the FE
 * proxy's 55s abort on every cold cache → customer-visible 502 /
 * "Attack paths not computed yet" (2026-07-04). The backend now serves
 * a DynamoDB-backed snapshot (cross-worker, survives restarts) and
 * recomputes behind a single-flight lease — this sweep guarantees the
 * snapshot exists and stays fresh even when the backend's own 4-min
 * leader prewarm is down (its APScheduler has silently disabled itself
 * before — see requirements.txt apscheduler note). System names come
 * from the ping response — never hardcoded. Fetches that outlive our
 * abort still finish server-side and write the snapshot, so the NEXT
 * sweep (and any operator click) lands warm.
 *
 * Companion memory: `feedback_render_backend_cold_start_curve`.
 */
const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

// Must match the Attack Paths v2 proxy defaults (lib/server/iap-proxy-query.ts)
// so the sweep warms the exact cache/snapshot key the tab reads.
const IAP_PREWARM_MAX_JEWELS = 8
const IAP_PREWARM_MAX_PATHS_PER_JEWEL = 8
// Under maxDuration=60 with headroom; an aborted fetch still completes
// and snapshots server-side.
const IAP_PREWARM_FETCH_TIMEOUT_MS = 50_000

type SweepResult = {
  system: string
  status: number | "timeout" | "error"
  elapsed_ms: number
  from_snapshot?: boolean
  stale?: boolean
}

async function prewarmIdentityAttackPaths(system: string): Promise<SweepResult> {
  const t0 = Date.now()
  const url =
    `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(system)}` +
    `?max_jewels=${IAP_PREWARM_MAX_JEWELS}` +
    `&max_paths_per_jewel=${IAP_PREWARM_MAX_PATHS_PER_JEWEL}`
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(IAP_PREWARM_FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "cyntro-keep-warm/1.0" },
    })
    let fromSnapshot: boolean | undefined
    let stale: boolean | undefined
    try {
      const body = await res.json()
      fromSnapshot = body?.from_snapshot === true
      stale = body?.fromStaleCache === true
    } catch {
      // body unused beyond telemetry — a parse failure is not a sweep failure
    }
    return {
      system,
      status: res.status,
      elapsed_ms: Date.now() - t0,
      from_snapshot: fromSnapshot,
      stale,
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError"
    return {
      system,
      status: isTimeout ? "timeout" : "error",
      elapsed_ms: Date.now() - t0,
    }
  }
}

export async function GET() {
  const start = Date.now()
  let pingStatus = 0
  let systems: string[] = []
  try {
    const res = await fetch(`${BACKEND_URL}/api/systems`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
      headers: {
        "User-Agent": "cyntro-keep-warm/1.0",
      },
    })
    pingStatus = res.status
    const elapsed = Date.now() - start
    const cold = elapsed > 5000
    if (cold) {
      console.warn(
        `[keep-warm] backend was cold — woke in ${elapsed}ms (status=${res.status})`,
      )
    } else {
      console.log(
        `[keep-warm] backend warm — pong in ${elapsed}ms (status=${res.status})`,
      )
    }
    try {
      const body = await res.json()
      systems = (body?.systems ?? [])
        .map((s: { name?: string }) => s?.name)
        .filter((n: unknown): n is string => typeof n === "string" && n.length > 0)
    } catch {
      // Non-JSON ping response — skip the sweep this run; the next cron
      // (10 min) hits a woken backend and gets the list.
    }

    const sweep = await Promise.all(systems.map(prewarmIdentityAttackPaths))
    const failures = sweep.filter(
      (r) => r.status !== 200 && r.status !== 503, // 503 = compute_in_progress: single-flight working, not a failure
    )
    if (failures.length > 0) {
      console.warn(
        `[keep-warm] iap sweep failures: ${JSON.stringify(failures)}`,
      )
    } else if (sweep.length > 0) {
      console.log(
        `[keep-warm] iap sweep ok — ${sweep.length} systems in ${Date.now() - start}ms`,
      )
    }

    return NextResponse.json({
      ok: true,
      backend_status: pingStatus,
      elapsed_ms: Date.now() - start,
      cold,
      iap_sweep: sweep,
    })
  } catch (err) {
    const elapsed = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[keep-warm] backend ping failed after ${elapsed}ms: ${msg}`)
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        elapsed_ms: elapsed,
      },
      { status: 200 },
    )
  }
}
