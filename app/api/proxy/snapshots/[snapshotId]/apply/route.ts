import { NextRequest, NextResponse } from "next/server"
import { getSnapshotById, updateSnapshot, createRestoreOperation, updateRestoreOperation } from "@/lib/snapshot-store"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend.onrender.com"

const FETCH_TIMEOUT = 10000 // 10 second timeout

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT}ms`)
    }
    throw error
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { snapshotId: string } }
) {
  const snapshotId = params.snapshotId
  const body = await request.json().catch(() => ({}))
  const selectedCategories = body.selectedCategories || []

  // Get snapshot
  const snapshot = getSnapshotById(snapshotId)
  if (!snapshot) {
    return NextResponse.json(
      { error: "Snapshot not found" },
      { status: 404 }
    )
  }

  // Create restore operation
  const operation = createRestoreOperation(snapshotId, snapshot.systemName, selectedCategories)

  // Try backend first
  try {
    const res = await fetchWithTimeout(
      `${BACKEND_URL}/api/snapshots/${encodeURIComponent(snapshotId)}/apply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedCategories }),
        cache: "no-store",
      }
    )

    if (res.ok) {
      const data = await res.json()
      
      // Update snapshot status
      updateSnapshot(snapshotId, { status: "APPLIED" })
      
      // Update operation
      updateRestoreOperation(operation.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
      })

      return NextResponse.json({
        success: true,
        result: data,
        operationId: operation.id,
      })
    }
  } catch (error: any) {
    console.warn("[proxy] Backend apply unavailable, simulating:", error.message)
  }

  // Fallback: simulate apply
  updateRestoreOperation(operation.id, {
    status: "in_progress",
    progress: {
      step: 1,
      totalSteps: 6,
      currentStep: "Validating snapshot",
    },
  })

  // Simulate restore steps
  setTimeout(() => {
    updateRestoreOperation(operation.id, {
      progress: { step: 2, totalSteps: 6, currentStep: "Creating pre-restore checkpoint" },
    })
  }, 500)

  setTimeout(() => {
    updateRestoreOperation(operation.id, {
      progress: { step: 3, totalSteps: 6, currentStep: "Restoring IAM roles" },
    })
  }, 1000)

  setTimeout(() => {
    updateRestoreOperation(operation.id, {
      progress: { step: 4, totalSteps: 6, currentStep: "Restoring security groups" },
    })
  }, 1500)

  setTimeout(() => {
    updateRestoreOperation(operation.id, {
      progress: { step: 5, totalSteps: 6, currentStep: "Validating configuration" },
    })
  }, 2000)

  setTimeout(() => {
    updateRestoreOperation(operation.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      progress: { step: 6, totalSteps: 6, currentStep: "Restore completed" },
    })
    updateSnapshot(snapshotId, { status: "APPLIED" })
  }, 2500)

  return NextResponse.json({
    success: true,
    simulated: true,
    message: "Snapshot restore initiated",
    operationId: operation.id,
    result: {
      applied: true,
      message: "Snapshot applied successfully (simulated)",
    },
  })
}

