import { POST as managedPost } from "@/app/api/proxy/sync/start/route"

/** @deprecated Legacy synchronous graph mutation is forbidden on Neptune. */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST() {
  return managedPost()
}
