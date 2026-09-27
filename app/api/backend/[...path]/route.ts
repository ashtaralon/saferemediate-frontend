import {NextResponse} from "next/server"

export const dynamic = "force-dynamic"

const RELAY_DISABLED = "BACKEND_RELAY_DISABLED"
const RELAY_DISABLED_MESSAGE =
  "The generic backend relay is disabled. It forwarded any method to any backend " +
  "path, and instrumentation's fetch patch attaches the deployment service token to " +
  "every backend call, so a site session would have reached every backend route as " +
  "the deployment's own identity. Use a named proxy route that carries its own authority."

// Refuse every request without contacting the backend. The relay has no
// rendered caller: lib/api-client.ts apiPost's only importer,
// components/issues/remediate-button.tsx, is not imported anywhere. A caller
// that needs a backend route gets a named proxy under /api/proxy/, whose
// method, path and authority (operator Bearer for mutations, the deployment
// proof for scoped reads) are reviewed on their own.
async function refuse(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error_code: RELAY_DISABLED,
      code: RELAY_DISABLED,
      error: RELAY_DISABLED_MESSAGE,
      detail: RELAY_DISABLED_MESSAGE,
      origin: "proxy",
    },
    {status: 403, headers: {"Cache-Control": "no-store"}},
  )
}

export const GET = refuse
export const POST = refuse
export const PUT = refuse
export const PATCH = refuse
export const DELETE = refuse
