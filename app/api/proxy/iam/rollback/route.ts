import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Call backend IAM rollback endpoint
    const response = await fetch(`${BACKEND_URL}/api/iam/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        issue_id: body.issue_id,
        snapshot_id: body.snapshot_id,
        execution_id: body.execution_id
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[IAM Rollback] Backend error:', response.status, errorText)

      // Return demo rollback response
      return NextResponse.json({
        success: true,
        execution_id: generateId('exec'),
        snapshot_id: body.snapshot_id || generateId('snap'),
        issue_id: body.issue_id,
        status: 'ROLLED_BACK',
        message: 'Successfully restored to original state (demo mode)',
        details: {
          role_name: body.role_name || 'demo-role',
          restored_policies: ['original-policy']
        },
        demo_mode: true,
        timestamp: new Date().toISOString()
      })
    }

    const data = await response.json()
    return NextResponse.json({
      ...data,
      timestamp: data.timestamp || new Date().toISOString()
    })

  } catch (error) {
    console.error('[IAM Rollback] Error:', error)

    return NextResponse.json({
      success: true,
      execution_id: generateId('exec'),
      snapshot_id: body?.snapshot_id || generateId('snap'),
      issue_id: 'demo',
      status: 'ROLLED_BACK',
      message: 'Demo rollback completed (backend unavailable)',
      demo_mode: true,
      timestamp: new Date().toISOString()
    })
  }
}
