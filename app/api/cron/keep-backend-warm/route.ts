import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Render keep-warm ping.
 *
 * Render's hosted Python backend cold-cycles after ~15 min of idle (the
 * service tier sleeps the worker when nothing is hitting it). Every
 * cold-cycle costs operators a 100s+ first-fetch on whichever endpoint
 * happened to be theirs — observed 2026-06-22 with the `by-crown-jewel`
 * stall (104s cold → 8.8s → 0.7s warm probe curve). A response cache
 * doesn't help because the first click on the slow path IS the cache
 * miss and cold workers can't serve cached responses anyway.
 *
 * The fix is to keep the worker awake. This route runs as a Vercel cron
 * (see vercel.json `crons` entry) every 10 minutes and pings a cheap
 * authoritative backend endpoint (`/api/systems`). We don't need the
 * response body — only that the worker handled a request, which resets
 * its idle clock.
 *
 * Outputs status + elapsed so deploy logs / Vercel cron history make
 * it clear when we caught a cold worker (elapsed > 5000ms = cold hit;
 * those first wakes are exactly what we're shortening for real users).
 *
 * Companion memory: `feedback_render_backend_cold_start_curve`.
 */
const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET() {
  const start = Date.now()
  try {
    const res = await fetch(`${BACKEND_URL}/api/systems`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
      headers: {
        "User-Agent": "cyntro-keep-warm/1.0",
      },
    })
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
    return NextResponse.json({
      ok: true,
      backend_status: res.status,
      elapsed_ms: elapsed,
      cold,
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
