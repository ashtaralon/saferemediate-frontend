import { forwardLpOutstanding } from "@/lib/server/lp-mutation-proxy"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(request: Request) {
  return forwardLpOutstanding(request)
}
