import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 60

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await context.params

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/posture-score/${encodeURIComponent(systemName)}`,
      {
        headers: {
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        cache: "no-store",
      }
    )

    if (!res.ok) {
      console.error(`Posture score backend error: ${res.status}`)
      return NextResponse.json({
        system_name: systemName,
        overall_score: 0,
        grade: 'F',
        dimensions: {},
        top_issues: [],
        error: "Backend error"
      })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("Posture score proxy error:", error.message)
    return NextResponse.json({
      system_name: systemName,
      overall_score: 0,
      grade: 'F',
      dimensions: {},
      top_issues: [],
      error: error.message
    })
  }
}
