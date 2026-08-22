"use client"

import { useEffect, useState } from "react"
import { ChangeQueueView } from "@/components/change-queue-view"

export default function ChangeQueuePage() {
  const [querySystemName, setQuerySystemName] = useState<string | null>(null)

  useEffect(() => {
    setQuerySystemName(
      new URLSearchParams(window.location.search).get("system_name")?.trim() || "",
    )
  }, [])

  if (querySystemName === null) return null
  return <ChangeQueueView systemName={querySystemName || undefined} showBack />
}
