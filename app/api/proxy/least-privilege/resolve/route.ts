import { forwardLpResolve } from "@/lib/server/lp-mutation-proxy"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function POST(request: Request) {
  return forwardLpResolve(request)
}
