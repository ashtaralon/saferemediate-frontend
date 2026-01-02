import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ systemName: string }> }
) {
  try {
    const { systemName } = await context.params
    
    const response = await fetch(
      `${BACKEND_URL}/api/system-least-privilege/${systemName}/summary`,
      {
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        next: { revalidate: 60 }, // Cache for 60 seconds
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: "Backend error", status: response.status },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("LP Summary proxy error:", error)
    return NextResponse.json(
      { error: "Proxy error", message: error.message },
      { status: 500 }
    )
  }
}
