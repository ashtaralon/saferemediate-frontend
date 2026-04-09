import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const { roleName } = await params

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(
      `${BACKEND_URL}/api/iam-roles/${encodeURIComponent(roleName)}/reserved-permissions`,
      {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Failed to get reserved permissions: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    return NextResponse.json(await response.json())
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to get reserved permissions', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const { roleName } = await params

  try {
    const body = await request.json()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(
      `${BACKEND_URL}/api/iam-roles/${encodeURIComponent(roleName)}/reserved-permissions`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: controller.signal
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Failed to update reserved permissions: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    return NextResponse.json(await response.json())
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update reserved permissions', details: error.message },
      { status: 500 }
    )
  }
}
