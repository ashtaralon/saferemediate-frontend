import { NextResponse } from "next/server"

import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"
import { getNeptuneRefreshBackendBaseUrl } from "@/lib/server/neptune-refresh-backend-url"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Read-only lane capability map, so a control can be correctly disabled BEFORE
 * anyone clicks it.
 *
 * Without this the only way to learn that IAM refresh is not connected was to
 * press the button, start a real Inspector collection round, wait for it, and
 * read the deferred list — spending a job to deliver the word "no", and
 * reading like a failed sync rather than an unbuilt lane.
 *
 * Uses the isolated Neptune-refresh binding, matching /sync/start and
 * /sync/status; the general backend binding is a different service.
 */
export async function GET() {
  try {
    const response = await fetch(
      `${getNeptuneRefreshBackendBaseUrl()}/api/v2/sync/capabilities`,
      { headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000) },
    )

    if (!response.ok) {
      const text = await response.text()
      let body: unknown = null
      try {
        body = JSON.parse(text)
      } catch {
        body = null
      }
      return NextResponse.json(
        {
          success: false,
          error: coerceProxyErrorMessage(body, text || `Backend returned ${response.status}`),
          // No lanes rather than a guess: an empty map reads as UNKNOWN
          // downstream, which leaves controls neither falsely enabled nor
          // falsely disabled.
          lanes: [],
        },
        { status: response.status },
      )
    }

    return NextResponse.json(await response.json())
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to read sync capabilities",
        lanes: [],
      },
      { status: 502 },
    )
  }
}
