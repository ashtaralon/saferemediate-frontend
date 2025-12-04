"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import Link from "next/link"
import type { Checkpoint } from "./configuration-history"
import PaymentProdDashboard from "./payment-prod-dashboard"

interface SystemDashboardProps {
  systemId: string
}

export function SystemDashboard({ systemId }: SystemDashboardProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "compliance">("overview")
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null)
  const [selectedResourceType, setSelectedResourceType] = useState<string | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([
    {
      id: "1",
      date: "Nov 10, 14:23",
      changes: 8,
      status: "success",
      user: "by Alex Kim",
      description: "Security group update",
      checkpointId: "checkpoint-20251110-1423",
    },
    {
      id: "2",
      date: "Nov 09, 09:30",
      changes: 12,
      status: "success",
      user: "by System",
      description: "IAM policy modification",
      checkpointId: "checkpoint-20251109-0930",
    },
    {
      id: "3",
      date: "Nov 08, 16:45",
      changes: 5,
      status: "warning",
      user: "by Sarah Chen",
      description: "Network ACL changes",
      checkpointId: "checkpoint-20251108-1645",
    },
    {
      id: "4",
      date: "Nov 07, 11:20",
      changes: 3,
      status: "success",
      user: "by Mike Johnson",
      description: "S3 bucket policy update",
      checkpointId: "checkpoint-20251107-1120",
    },
  ])

  const handleFixApplied = (findingTitle: string) => {
    const now = new Date()
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    const checkpointId = `checkpoint-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`

    const newCheckpoint: Checkpoint = {
      id: Date.now().toString(),
      date: `${dateStr}, ${timeStr}`,
      changes: 1,
      status: "success",
      user: "by System (Auto-remediation)",
      description: findingTitle,
      checkpointId: checkpointId,
      isNew: true,
      badge: "NEW",
    }

    setCheckpoints((prev) => [newCheckpoint, ...prev])
  }

  const handleRollback = (checkpoint: Checkpoint) => {
    console.log("[v0] Rollback to checkpoint:", checkpoint.checkpointId)
  }

  const handleCheckpointsUpdate = (updatedCheckpoints: Checkpoint[]) => {
    setCheckpoints(updatedCheckpoints)
  }

  const handleComplianceCheckpointCreated = (checkpoint: Checkpoint) => {
    setCheckpoints((prev) => [checkpoint, ...prev])
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm mb-4 text-gray-600">
            <Link href="/" className="hover:text-blue-600 transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="w-4 h-4" />
            <Link href="/?tab=systems" className="hover:text-blue-600 transition-colors">
              Systems
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-900 font-medium">Payment-Prod</span>
          </div>
        </div>
      </div>

      {/* Main Content - Using New Dashboard Design */}
      <PaymentProdDashboard />
    </div>
  )
}
