import { NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function POST() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/inject-cve/preset/attack-scenario`, {
      method: 'POST',
      headers: {
        "ngrok-skip-browser-warning": "true",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: errorText }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[inject-cve/preset] Fetch error:", error)
    return NextResponse.json({ error: "Failed to inject attack scenario" }, { status: 500 })
  }
}
