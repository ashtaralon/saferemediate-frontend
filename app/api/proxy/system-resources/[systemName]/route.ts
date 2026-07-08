import { NextRequest, NextResponse } from 'next/server'

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  try {
    const { systemName } = await params
    const { searchParams } = new URL(request.url)
    const resourceType = searchParams.get('resource_type')
    const taggedOnly = searchParams.get('tagged_only')
    
    let url = `${BACKEND_URL}/api/system-resources/${systemName}?lite=true`
    const queryParams = new URLSearchParams()
    if (resourceType) queryParams.append('resource_type', resourceType)
    if (taggedOnly) queryParams.append('tagged_only', taggedOnly)
    if (queryParams.toString()) url += `&${queryParams.toString()}`
    
    console.log(`[proxy] Fetching system resources from: ${url}`)
    
    // Backend can take 10–15s on large graphs; avoid stale/empty proxy responses.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
    
    if (!response.ok) {
      console.error(`[proxy] Backend error: ${response.status}`)
      return NextResponse.json(
        { error: `Backend error: ${response.status}`, resources: [] },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    console.log(`[proxy] Got ${data.resources?.length || 0} resources for ${systemName}`)
    
    return NextResponse.json(data)
    
  } catch (error: any) {
    console.error('[proxy] System resources error:', error)
    const message =
      error?.name === 'AbortError'
        ? 'Backend timed out — Render worker may be cold. Wait 30s and refresh.'
        : error?.message || 'Proxy error'
    return NextResponse.json(
      { error: message, resources: [] },
      { status: 504 }
    )
  }
}


