import { NextRequest, NextResponse } from "next/server"
import { getSnapshots, seedInitialSnapshots } from "@/lib/snapshot-store"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

const FETCH_TIMEOUT = 25000 // 25 second timeout (matches Vercel function limit)

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

  // Try backend first, fallback to local storage
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
      return NextResponse.json(data)
    }
  } catch (error: any) {
    console.warn("[proxy] Backend snapshots unavailable, using local storage:", error.message)
  }

  // Fallback to local storage
  const snapshots = getSnapshots(systemId)
  return NextResponse.json({ snapshots })
}
