import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

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
  getBackendBaseUrl()

// Must match Attack Paths v2 proxy defaults (lib/server/iap-proxy-query.ts)
// so the sweep warms the exact cache/snapshot key the tab reads.
import {
  IAP_PROXY_DEFAULT_MAX_JEWELS,
  IAP_PROXY_DEFAULT_MAX_PATHS_PER_JEWEL,
} from "@/lib/server/iap-proxy-query"

const IAP_PREWARM_MAX_JEWELS = IAP_PROXY_DEFAULT_MAX_JEWELS
const IAP_PREWARM_MAX_PATHS_PER_JEWEL = IAP_PROXY_DEFAULT_MAX_PATHS_PER_JEWEL
// Under maxDuration=60 with headroom; an aborted fetch still completes
// and snapshots server-side.
const IAP_PREWARM_FETCH_TIMEOUT_MS = 50_000
// Topology-risk snapshot backs the estate map (and the Business System Blast
// Radius map). Its snapshot has a 10-min freshness window (matching this cron),
// and the blast-radius prewarm below CANNOT be relied on to refresh it: once
// blast-radius's own 900s response cache is warm it returns cached and never
// re-calls get_topology_risk. So warm topology explicitly, serially + first
// (heaviest, and it keeps the worker genuinely busy rather than just pinged).
// A cold recompute (45-91s) finishes server-side + snapshots even after we give
// up at the abort, so the next request lands on a warm snapshot.
// Budgets are tight so the whole run (cold ping + iap + topology + blast) stays
// under the 60s Lambda cap. Each budget ≤ its per-call timeout so at most ONE
// slow (cold) call runs per kind — a warm call serves from snapshot in ~5s, a
// cold one aborts and finishes + snapshots server-side, and either way the next
// cron converges. Worst case ≈ ping(25) + iap(2) + topology(14) + blast(10) ≈ 51s.
const TOPOLOGY_PREWARM_FETCH_TIMEOUT_MS = 14_000
const BLAST_PREWARM_FETCH_TIMEOUT_MS = 10_000
// One global wall-clock deadline for the whole sweep (topology then blast) so
// the function stays well under the 60s Lambda cap. A call starts only if its
// full timeout fits before this — warm calls (~5s from snapshot) let many
// systems through, a cold one (aborts + snapshots server-side) is bounded.
const SWEEP_DEADLINE_MS = 50_000

type SweepResult = {
  system: string
  kind: "iap" | "blast_radius" | "topology_risk"
  status: number | "timeout" | "error" | "skipped_missing_scope"
  elapsed_ms: number
  from_snapshot?: boolean
  stale?: boolean
}

/**
 * A prewarm target carrying the scope the serving-graph endpoints demand.
 * The blast-radius composer refuses to infer scope (returns 503) so the
 * sweep must call it with the same customer/account/region an operator
 * would send — an unscoped ping just wastes the cold-start budget and
 * leaves the real per-scope cache key cold.
 */
type SystemTarget = {
  name: string
  customerId: string | null
  accountId: string | null
  region: string | null
}

async function prewarmIdentityAttackPaths(target: SystemTarget): Promise<SweepResult> {
  const system = target.name
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
      kind: "iap",
      status: res.status,
      elapsed_ms: Date.now() - t0,
      from_snapshot: fromSnapshot,
      stale,
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError"
    return {
      system,
      kind: "iap",
      status: isTimeout ? "timeout" : "error",
      elapsed_ms: Date.now() - t0,
    }
  }
}

/**
 * Prewarm the Business System Blast Radius compose (BE PR #386 / FE PR #305).
 * GET /business-systems reads /api/business-system/{system}/blast-radius, which
 * composes the topology-risk snapshot + several :AttackPath / observed-edge
 * Cypher passes — a heavy first-hit that overflows the FE proxy's 55s abort on
 * a cold Render worker (customer-visible "Couldn't load the blast radius" /
 * timeout, 2026-07-06). Sweeping it here wakes the worker AND refreshes the
 * topology-risk snapshot the compose depends on; an aborted fetch still
 * finishes server-side, so the next operator click lands warm. Symmetric with
 * the IAP prewarm above — same cold-cycle, same fix.
 */
async function prewarmBlastRadius(target: SystemTarget): Promise<SweepResult> {
  const system = target.name
  const t0 = Date.now()
  // The compose is per-tenant + per-account/region; the backend fails closed
  // when scope is absent. A prewarm without scope would 503 and leave the
  // real per-scope cache cold. If we don't know the scope, skip cleanly
  // rather than pretend to warm the cache the operator will actually hit.
  if (!target.customerId || !target.accountId || !target.region) {
    return {
      system,
      kind: "blast_radius",
      status: "skipped_missing_scope",
      elapsed_ms: 0,
    }
  }
  const params = new URLSearchParams({
    customer_id: target.customerId,
    account_id: target.accountId,
    region: target.region,
  })
  const url =
    `${BACKEND_URL}/api/business-system/${encodeURIComponent(system)}/blast-radius` +
    `?${params.toString()}`
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(BLAST_PREWARM_FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "cyntro-keep-warm/1.0" },
    })
    let fromSnapshot: boolean | undefined
    try {
      const body = await res.json()
      fromSnapshot = body?.from_snapshot === true
    } catch {
      // body unused beyond telemetry — a parse failure is not a sweep failure
    }
    return {
      system,
      kind: "blast_radius",
      status: res.status,
      elapsed_ms: Date.now() - t0,
      from_snapshot: fromSnapshot,
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError"
    return {
      system,
      kind: "blast_radius",
      status: isTimeout ? "timeout" : "error",
      elapsed_ms: Date.now() - t0,
    }
  }
}

/**
 * Prewarm the estate-map topology snapshot (GET /api/topology-risk/{system},
 * unscoped = the all-VPCs key the map fetches). This is the fetch that was
 * cold-502ing the map on first load: the topology recompute (~22 queries)
 * overflows the FE proxy's 55s abort on a cold snapshot. The backend keeps a
 * 7-day DynamoDB snapshot with a 10-min freshness window and stale-serves once
 * ANY snapshot exists — so this sweep's job is to make sure the snapshot always
 * exists and stays inside the freshness window. Hitting the real topology
 * endpoint (not the cheap /api/systems ping) also keeps the worker warm with
 * genuine work. Aborted recomputes still finish + put_snapshot server-side.
 */
async function prewarmTopologyRisk(target: SystemTarget): Promise<SweepResult> {
  const system = target.name
  const t0 = Date.now()
  const url = `${BACKEND_URL}/api/topology-risk/${encodeURIComponent(system)}`
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TOPOLOGY_PREWARM_FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "cyntro-keep-warm/1.0" },
    })
    let fromSnapshot: boolean | undefined
    try {
      const body = await res.json()
      fromSnapshot = body?.from_snapshot === true
    } catch {
      // body unused beyond telemetry — a parse failure is not a sweep failure
    }
    return {
      system,
      kind: "topology_risk",
      status: res.status,
      elapsed_ms: Date.now() - t0,
      from_snapshot: fromSnapshot,
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError"
    return {
      system,
      kind: "topology_risk",
      status: isTimeout ? "timeout" : "error",
      elapsed_ms: Date.now() - t0,
    }
  }
}

const ACCOUNT_ID_RE = /^\d{12}$/
const REGION_RE = /^[a-z]{2}(-gov)?-[a-z]+-\d+$/

export async function GET() {
  const start = Date.now()
  let pingStatus = 0
  let systems: SystemTarget[] = []
  try {
    const res = await fetch(`${BACKEND_URL}/api/systems`, {
      cache: "no-store",
      // Short wake-ping: on a cold worker this aborts (still wakes it
      // server-side) and we skip the sweep this cycle — the next cron lands on
      // a warm worker. A long ping would eat the whole 60s Lambda budget and
      // FUNCTION_INVOCATION_TIMEOUT before any sweep runs.
      signal: AbortSignal.timeout(25_000),
      headers: {
        "User-Agent": "cyntro-keep-warm/1.0",
      },
    })
    pingStatus = res.status
    const elapsed = Date.now() - start
    const cold = elapsed > 5000
    // A fast non-2xx is NOT a warm backend. Before this guard a 401 parsed
    // cleanly (`res.json()` succeeds on the error envelope, `body?.systems` is
    // undefined), the sweep silently no-opped over zero targets, and the route
    // reported ok:true with backend_status:401 — so a rejected caller presented
    // as a healthy cron while every operator click kept paying the full ~100s
    // cold start. Fail closed here, and name the auth case so the log says WHY
    // the sweep stopped instead of leaving it to be read as a latency problem.
    // Status and elapsed only — never log request headers or credentials.
    if (!res.ok) {
      const isAuth = res.status === 401 || res.status === 403
      const reason = isAuth
        ? `backend rejected the keep-warm caller (HTTP ${res.status} — authentication/authorization failure)`
        : `backend ping returned HTTP ${res.status}`
      console.error(
        `[keep-warm] ${reason} after ${elapsed}ms — prewarm sweep skipped`,
      )
      return NextResponse.json(
        {
          ok: false,
          error: reason,
          failure_kind: isAuth ? "auth" : "http_error",
          backend_status: pingStatus,
          elapsed_ms: Date.now() - start,
          cold,
        },
        { status: 200 },
      )
    }
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
      // The /api/systems envelope stamps the authoritative tenant scope at
      // body.scope.customer_id (the request scope resolved server-side);
      // individual rows carry per-system account_id / region. Reading
      // customer_id from each row instead would come back undefined and
      // silently skip every blast-radius prewarm — see the P0.3 follow-up
      // review 2026-09-15.
      const customerId =
        typeof body?.scope?.customer_id === "string" && body.scope.customer_id
          ? body.scope.customer_id
          : null
      systems = (body?.systems ?? [])
        .map((s: {
          name?: string
          account_id?: string
          region?: string
        }): SystemTarget | null => {
          const name = typeof s?.name === "string" ? s.name : ""
          if (!name) return null
          const accountId =
            typeof s.account_id === "string" && ACCOUNT_ID_RE.test(s.account_id) ? s.account_id : null
          const region = typeof s.region === "string" && REGION_RE.test(s.region) ? s.region : null
          return { name, customerId, accountId, region }
        })
        .filter((t: SystemTarget | null): t is SystemTarget => t !== null)
    } catch {
      // Non-JSON ping response — skip the sweep this run; the next cron
      // (10 min) hits a woken backend and gets the list.
    }

    // IAP snapshots are cheap (DynamoDB reads, ~1s) — warm all concurrently.
    const iapSweep = await Promise.all(systems.map(prewarmIdentityAttackPaths))
    const sweepDeadline = start + SWEEP_DEADLINE_MS
    // Topology-risk backs the estate map — warm it FIRST (heaviest, must refresh
    // each cycle to stay inside the 10-min freshness window), serially so
    // composes never pile up on the one worker. Start a call only if its timeout
    // fits before the global deadline.
    const topoSweep: SweepResult[] = []
    for (const system of systems) {
      if (Date.now() + TOPOLOGY_PREWARM_FETCH_TIMEOUT_MS > sweepDeadline) break
      topoSweep.push(await prewarmTopologyRisk(system))
    }
    // Blast Radius — mostly cache-fast (900s); runs after topology so its
    // get_topology_risk call lands warm.
    const blastSweep: SweepResult[] = []
    for (const system of systems) {
      if (Date.now() + BLAST_PREWARM_FETCH_TIMEOUT_MS > sweepDeadline) break
      blastSweep.push(await prewarmBlastRadius(system))
    }
    const sweep = [...iapSweep, ...topoSweep, ...blastSweep]
    const failures = sweep.filter(
      (r) => {
        // 200 = success (incl. Wave B computing / compute_failed envelopes).
        // Legacy 503 compute_in_progress may linger until backends roll.
        // "skipped_missing_scope" = the /api/systems response didn't include
        //   enough scope to prewarm honestly; not a failure to alert on.
        if (r.status === 200) return false
        // A scoped blast-radius 503 is now a real failure. The only expected
        // missing-scope state is the explicit skip below; accepting 503 here
        // would recreate the production bug as a green prewarm log.
        if (r.status === 503 && r.kind !== "blast_radius") return false
        if (r.status === "skipped_missing_scope") return false
        return true
      },
    )
    if (failures.length > 0) {
      console.warn(
        `[keep-warm] prewarm sweep failures: ${JSON.stringify(failures)}`,
      )
    } else if (sweep.some((r) => r.status === "skipped_missing_scope")) {
      const skipped = sweep.filter((r) => r.status === "skipped_missing_scope").length
      console.warn(
        `[keep-warm] prewarm sweep partial — ${skipped}/${sweep.length} probes skipped for missing scope`,
      )
    } else if (sweep.length > 0) {
      console.log(
        `[keep-warm] prewarm sweep ok — ${sweep.length} probes (${systems.length} systems × iap+topology+blast) in ${Date.now() - start}ms`,
      )
    }

    return NextResponse.json({
      // Non-2xx already returned above; this also refuses to call a 2xx that
      // is not a 200 (e.g. a bodyless 204) a success, since those parse to an
      // empty `systems` list and would report a green run over an empty sweep.
      ok: pingStatus === 200,
      backend_status: pingStatus,
      elapsed_ms: Date.now() - start,
      cold,
      sweep,
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
