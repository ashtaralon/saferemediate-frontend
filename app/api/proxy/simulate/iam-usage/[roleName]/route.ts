import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  try {
    const { roleName } = await params

    console.log('[Simulate IAM] Clearing simulated data for:', roleName)

    const response = await fetch(
      `${BACKEND_URL}/api/simulate/iam-usage/${encodeURIComponent(roleName)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Simulate IAM] Clear error:', response.status, errorText)
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[Simulate IAM] Clear error:', error)
    return NextResponse.json(
      { error: error.message || 'Clear failed' },
      { status: 500 }
    )
  }
}
