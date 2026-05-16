import { PostureDashboard } from "@/components/posture/posture-dashboard"

export const dynamic = "force-dynamic"

export default function PosturePage() {
  return (
    <main className="min-h-screen bg-zinc-950">
      <PostureDashboard />
    </main>
  )
}
