"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { LeftSidebarNav } from "@/components/left-sidebar-nav"
import { HomeDashboardV2 } from "@/components/dashboard/v2/home-dashboard-v2"
import { SystemPickerCard } from "@/components/system-picker-card"

export default function HomeV2Page() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const systemFromUrl = searchParams.get("system")

  const handleNav = (item: string) => {
    if (item === "home") return
    router.push(`/?section=${encodeURIComponent(item)}`)
  }

  const handleSystemSelect = (system: string) => {
    router.push(`/home-v2?system=${encodeURIComponent(system)}`)
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <LeftSidebarNav activeItem="home" onItemClick={handleNav} />
      <main className="flex-1">
        {systemFromUrl ? (
          <HomeDashboardV2 initialSystem={systemFromUrl} />
        ) : (
          <SystemPickerCard onSelect={handleSystemSelect} />
        )}
      </main>
    </div>
  )
}
