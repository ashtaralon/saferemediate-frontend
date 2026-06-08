"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { LeftSidebarNav } from "@/components/left-sidebar-nav"
import { HomeDashboardV2 } from "@/components/dashboard/v2/home-dashboard-v2"

export default function HomeV2Page() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const systemFromUrl = searchParams.get("system")

  const handleNav = (item: string) => {
    if (item === "home") return
    router.push(`/?section=${encodeURIComponent(item)}`)
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <LeftSidebarNav activeItem="home" onItemClick={handleNav} />
      <main className="flex-1">
        {/* No system in URL → empty initial; V2's SystemInput prompts.
            Previously defaulted to "alon-prod", silently routing every
            fresh visit into one demo system's data. */}
        <HomeDashboardV2 initialSystem={systemFromUrl ?? ""} />
      </main>
    </div>
  )
}
