import { NextRequest } from "next/server"
import { GET as managedGet } from "@/app/api/proxy/sync/status/[jobId]/route"

/** @deprecated Use /api/proxy/sync/status/:jobId. */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  return managedGet(request, context)
}
