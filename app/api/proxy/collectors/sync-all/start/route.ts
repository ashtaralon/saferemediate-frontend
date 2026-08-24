import { POST as managedPost } from "@/app/api/proxy/sync/start/route"

/** @deprecated Use /api/proxy/sync/start. Kept as a safe compatibility alias. */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST() {
  return managedPost()
}
