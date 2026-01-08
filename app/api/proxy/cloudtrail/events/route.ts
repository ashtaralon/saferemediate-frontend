import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const BACKEND_URL = 
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get('limit') || '100'
  const days = searchParams.get('days') || searchParams.get('lookbackDays') || '7'
  const roleName = searchParams.get('roleName')
  
  console.log(`[proxy] CloudTrail events: limit=${limit}, days=${days}, roleName=${roleName || 'none'}`)
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 28000)
  
  try {
    // Backend endpoint is /api/traffic/cloudtrail (not /api/cloudtrail/events)
    let backendUrl = `${BACKEND_URL}/api/traffic/cloudtrail?days=${days}`
    if (roleName) {
      backendUrl += `&roleName=${encodeURIComponent(roleName)}`
    }
    console.log(`[proxy] Calling: ${backendUrl}`)
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store'
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[proxy] Backend error ${response.status}: ${errorText}`)
      return NextResponse.json(
        { events: [], error: `Backend error: ${response.status}` },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    console.log(`[proxy] Got ${data.events?.length || 0} CloudTrail events`)
    
    // Backend returns { status: "success", events: [...], total: ... }
    // Transform to match frontend expectations
    return NextResponse.json({
      events: data.events || [],
      total: data.total || 0,
      ...data
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
      }
    })
  } catch (error: any) {
    clearTimeout(timeoutId)
    
    if (error.name === 'AbortError') {
      console.error('[proxy] CloudTrail events timeout')
      return NextResponse.json(
        { events: [], error: 'Request timeout' },
        { status: 504 }
      )
    }
    
    console.error('[proxy] CloudTrail events error:', error.message)
    return NextResponse.json(
      { events: [], error: error.message },
      { status: 500 }
    )
  }
}



