/**
 * The one answer contract for every proxy that forwards to backend POST /api/simulate.
 *
 * That backend path never ran a simulation: it answered a hard-coded confidence, blast radius and EXECUTE
 * recommendation (and the proxies reshaped those into rows, percentages and verdicts). The backend now refuses with
 * 501 SIMULATION_NOT_AVAILABLE_ON_THIS_PATH. Three proxies reach it -- /api/proxy/cyntro/simulate (per-resource
 * "Simulate Split"), /api/proxy/simulate, and /api/proxy/systems/[systemId]/issues/[issueId]/simulate -- and all of
 * them answer through `relayLegacySimulate`, so no caller can be handed a number from it.
 *
 * - A non-2xx keeps its status. Only the allowlisted typed fields of the backend's refusal are forwarded
 *   (`allowlistedBackendDetail`), with `error` set to its message so callers that read `.error` show prose, not
 *   `[object Object]` or a bare status.
 * - A 2xx comes only from a backend that still serves the old handler, and it carries no simulation either. It is
 *   never relayed or reshaped: the proxy answers the same typed refusal itself.
 */
import { NextResponse } from "next/server"
import { allowlistedBackendDetail } from "@/lib/server/proxy-error"

export const SIMULATION_NOT_AVAILABLE_CODE = "SIMULATION_NOT_AVAILABLE_ON_THIS_PATH"
export const SIMULATION_NOT_AVAILABLE_MESSAGE =
  "This path does not run a simulation. Use the resource-specific simulate path instead."

const NO_STORE = { "Cache-Control": "no-store" }

export async function relayLegacySimulate(res: Response): Promise<NextResponse> {
  if (res.ok) {
    return NextResponse.json(
      {
        code: SIMULATION_NOT_AVAILABLE_CODE,
        error: SIMULATION_NOT_AVAILABLE_MESSAGE,
        message: SIMULATION_NOT_AVAILABLE_MESSAGE,
        origin: "proxy",
      },
      { status: 501, headers: NO_STORE },
    )
  }
  const detail = allowlistedBackendDetail(await res.text().catch(() => ""))
  const message = detail?.message ?? detail?.error ?? detail?.code
  if (detail && message) {
    return NextResponse.json(
      { code: detail.code, error: message, message, detail, origin: "backend" },
      { status: res.status, headers: NO_STORE },
    )
  }
  return NextResponse.json(
    { code: "UNREADABLE", error: "The simulation backend answered without a typed detail", origin: "proxy" },
    { status: res.status, headers: NO_STORE },
  )
}
