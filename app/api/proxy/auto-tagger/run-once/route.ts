import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auto-tagger/run-once`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) {
      return NextResponse.json({ error: 'Backend error' }, { status: response.status })
    }
    
    return NextResponse.json(await response.json())
  } catch (error: any) {
    console.error('[proxy] Auto-tagger run-once error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

