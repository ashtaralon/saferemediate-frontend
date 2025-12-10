import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  try {
    console.log("[v0] Testing backend connection:", `${backendUrl}/health`)

    const response = await fetch(`${backendUrl}/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    })

    console.log("[v0] Backend response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] Backend returned error:", response.status, errorText)
      return NextResponse.json(
        {
          success: false,
          error: `Backend returned ${response.status}`,
          details: errorText,
          backendUrl,
        },
        { status: response.status },
      )
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      message: "Backend connection successful",
      proxyStatus: "working",
      backendUrl,
      healthCheck: data,
    })
  } catch (error: any) {
    console.error("[v0] Test connection failed:", error.message)

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        backendUrl,
        hint:
          error.name === "AbortError"
            ? "Backend connection timeout - is your backend running?"
            : "Ensure your backend is running at " + backendUrl,
      },
      { status: 500 },
    )
  }
}
