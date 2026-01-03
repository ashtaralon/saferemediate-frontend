import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  try {
    const { systemName } = await params
    const { searchParams } = new URL(request.url)
    const resourceType = searchParams.get('resource_type')
    const taggedOnly = searchParams.get('tagged_only')
    
    let url = `${BACKEND_URL}/api/system-resources/${systemName}`
    const queryParams = new URLSearchParams()
    if (resourceType) queryParams.append('resource_type', resourceType)
    if (taggedOnly) queryParams.append('tagged_only', taggedOnly)
    if (queryParams.toString()) url += `?${queryParams.toString()}`
    
    console.log(`[proxy] Fetching system resources from: ${url}`)
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      next: { revalidate: 30 }  // Cache for 30 seconds
    })
    
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
    return NextResponse.json(
      { error: error.message, resources: [] },
      { status: 500 }
    )
  }
}


