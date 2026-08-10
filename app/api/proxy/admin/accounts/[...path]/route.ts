import { NextRequest } from "next/server"
import { proxyAccountAdmin } from "@/lib/server/account-admin-proxy"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ path: string[] }> }

async function run(request: NextRequest, context: Context) {
  const { path } = await context.params
  return proxyAccountAdmin(request, path)
}

export const GET = run
export const POST = run
export const PATCH = run
export const PUT = run
export const DELETE = run
