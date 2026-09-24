import { NextResponse } from "next/server"

const NOT_CONFIGURED = "DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED"
const LIFECYCLE_REQUIRED = "LIFECYCLE_PROCESS_NOT_DEPLOYED"

function serverToken(): string | null {
  const token = process.env.CYNTRO_SERVICE_TOKEN?.trim()
  return token || null
}

export async function forwardLpMutation(request: Request, path: "/api/least-privilege/apply" | "/api/least-privilege/restore") {
  const token = serverToken()
  if (!token) {
    return NextResponse.json(
      {
        error_code: NOT_CONFIGURED,
        code: NOT_CONFIGURED,
        cloud_writes: 0,
        attempted_writes: 0,
        confirmed_writes: 0,
        unknown_writes: 0,
        origin: "proxy",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  await request.json().catch(() => null)
  return NextResponse.json(
    {
      code: LIFECYCLE_REQUIRED,
      cloud_writes: 0,
      attempted_writes: 0,
      confirmed_writes: 0,
      unknown_writes: 0,
      origin: "proxy",
      path,
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}
