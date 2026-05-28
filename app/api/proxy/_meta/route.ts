import { NextResponse } from "next/server"
import { getBackendUrlDiagnostics } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(getBackendUrlDiagnostics(), {
    headers: { "Cache-Control": "no-store" },
  })
}
