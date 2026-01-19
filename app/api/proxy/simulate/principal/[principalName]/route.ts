import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ principalName: string }> }
) {
  try {
    const { principalName } = await params

    console.log('[Simulate] Deleting principal:', principalName)

    const response = await fetch(
      `${BACKEND_URL}/api/simulate/principal/${encodeURIComponent(principalName)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Simulate] Delete error:', response.status, errorText)
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[Simulate] Delete error:', error)
    return NextResponse.json(
      { error: error.message || 'Delete failed' },
      { status: 500 }
    )
  }
}
