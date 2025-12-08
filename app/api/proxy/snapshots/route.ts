import { type NextRequest, NextResponse } from "next/server"
import {
  getSnapshots,
  createSnapshot,
  seedInitialSnapshots,
  type Snapshot,
} from "@/lib/snapshot-store"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

const FETCH_TIMEOUT = 5000 // 5 second timeout for backend calls

// Helper function to fetch with timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout}ms`)
    }
    throw error
  }
}

// Fetch resource details from backend graph
async function fetchResourceDetails(): Promise<any> {
  try {
    const response = await fetchWithTimeout(`${BACKEND_URL}/api/graph/nodes`)
    if (!response.ok) return {}

    const graphData = await response.json()
    const nodes = graphData.nodes || graphData || []

    return {
      iamRoles: nodes.filter(
        (n: any) => n.labels?.includes("IAMRole") || n.type === "IAMRole"
      ),
      securityGroups: nodes.filter(
        (n: any) =>
          n.labels?.includes("SecurityGroup") || n.type === "SecurityGroup"
      ),
      vpcs: nodes.filter(
        (n: any) => n.labels?.includes("VPC") || n.type === "VPC"
      ),
      subnets: nodes.filter(
        (n: any) => n.labels?.includes("Subnet") || n.type === "Subnet"
      ),
      s3Buckets: nodes.filter(
        (n: any) => n.labels?.includes("S3Bucket") || n.type === "S3Bucket"
      ),
      ec2Instances: nodes.filter(
        (n: any) =>
          n.labels?.includes("EC2Instance") || n.type === "EC2Instance"
      ),
      lambdas: nodes.filter(
        (n: any) => n.labels?.includes("Lambda") || n.type === "Lambda"
      ),
    }
  } catch (e) {
    console.log("[snapshots] Could not fetch graph data for resources")
    return {}
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const systemName = searchParams.get("systemName") || "alon-prod"

    // Try to fetch from backend first
    try {
      const response = await fetchWithTimeout(
        `${BACKEND_URL}/api/snapshots?systemName=${encodeURIComponent(systemName)}`
      )

      if (response.ok) {
        const data = await response.json()
        if (data.snapshots && data.snapshots.length > 0) {
          return NextResponse.json(data)
        }
      }
    } catch (e) {
      console.log("[snapshots] Backend unavailable, using local store")
    }

    // Get from local store
    let snapshots = await getSnapshots(systemName)

    // If no snapshots, seed initial data
    if (snapshots.length === 0) {
      const resourceDetails = await fetchResourceDetails()
      await seedInitialSnapshots(systemName, resourceDetails)
      snapshots = await getSnapshots(systemName)
    }

    return NextResponse.json({ snapshots })
  } catch (error) {
    console.error("[snapshots] Error:", error)
    return NextResponse.json(
      { snapshots: [], error: "Failed to fetch snapshots" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { systemName, type, description, name } = body

    // Try to create snapshot on backend first
    try {
      const response = await fetchWithTimeout(
        `${BACKEND_URL}/api/snapshots`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )

      if (response.ok) {
        const data = await response.json()
        // Also save to local store for redundancy
        if (data.snapshot) {
          await createSnapshot({
            name: data.snapshot.name,
            systemName: data.snapshot.systemName,
            type: data.snapshot.type,
            createdBy: data.snapshot.createdBy,
            resourceDetails: data.snapshot.resourceDetails,
          })
        }
        return NextResponse.json(data)
      }
    } catch (e) {
      console.log("[snapshots] Backend unavailable, saving locally")
    }

    // Create snapshot locally
    const resourceDetails = await fetchResourceDetails()

    const newSnapshot = await createSnapshot({
      name: name || description || `Snapshot ${new Date().toLocaleDateString()}`,
      systemName: systemName || "alon-prod",
      type: type || "manual",
      createdBy: "current-user@saferemediate.io",
      resourceDetails,
      metadata: {
        description: description,
      },
    })

    return NextResponse.json({
      success: true,
      snapshot: newSnapshot,
    })
  } catch (error) {
    console.error("[snapshots] Create error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create snapshot" },
      { status: 500 }
    )
  }
}
