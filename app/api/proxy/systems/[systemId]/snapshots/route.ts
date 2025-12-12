import { NextRequest, NextResponse } from "next/server"
import { getSnapshots, seedInitialSnapshots } from "@/lib/snapshot-store"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

const FETCH_TIMEOUT = 5000 // 5 second timeout

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemId: string }> }
) {
  // In Next.js 14+, params is a Promise that must be awaited
  const { systemId } = await params

  // Seed initial snapshots if needed
  seedInitialSnapshots(systemId)

  // ✅ Try backend first (reads from S3 where snapshots are actually stored)
  try {
    const res = await fetchWithTimeout(
      `${BACKEND_URL}/api/systems/${encodeURIComponent(systemId)}/snapshots`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    )

    if (res.ok) {
      const data = await res.json()
      // Backend returns array directly, or wrapped in snapshots key
      const snapshotsArray = Array.isArray(data) ? data : (data.snapshots || [])
      console.log(`[proxy] ✅ Loaded ${snapshotsArray.length} snapshots from backend for system ${systemId}`)
      return NextResponse.json(snapshotsArray)
    } else {
      console.warn(`[proxy] Backend returned ${res.status} for snapshots`)
    }
  } catch (error: any) {
    console.warn("[proxy] Backend snapshots unavailable, using local storage:", error.message)
  }

  // Fallback to local storage (for development/testing)
  try {
    const snapshots = getSnapshots(systemId)
    console.log(`[proxy] Using ${snapshots.length} snapshots from local storage (fallback)`)
    return NextResponse.json(Array.isArray(snapshots) ? snapshots : (snapshots.snapshots || []))
  } catch (error: any) {
    console.error("[proxy] Error getting snapshots from local storage:", error)
    return NextResponse.json([])
  }
}
