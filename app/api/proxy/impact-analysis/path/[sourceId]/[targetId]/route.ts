import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sourceId: string; targetId: string }> }
) {
  const { sourceId, targetId } = await context.params
  
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/impact-analysis/path/${sourceId}/${targetId}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store"
      }
    )
    
    if (!res.ok) {
      return NextResponse.json({ 
        status: "NO_PATH", 
        message: "Path not found",
        nodes: [],
        edges: []
      })
    }
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("Path analysis error:", error.message)
    return NextResponse.json({ 
      status: "ERROR", 
      message: error.message,
      nodes: [],
      edges: []
    })
  }
}
