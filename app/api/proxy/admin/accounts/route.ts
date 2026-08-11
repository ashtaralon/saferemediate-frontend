import { NextRequest } from "next/server"
import { proxyAccountAdmin } from "@/lib/server/account-admin-proxy"

export const dynamic = "force-dynamic"
export const GET = (request: NextRequest) => proxyAccountAdmin(request)
export const POST = (request: NextRequest) => proxyAccountAdmin(request)
