import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  try {
    const { systemName } = await params
    const { searchParams } = new URL(request.url)
    const severity = searchParams.get('severity')
    const resourceType = searchParams.get('resource_type')
    const hasIssuesOnly = searchParams.get('has_issues_only')
    
    let url = `${BACKEND_URL}/api/system-least-privilege/${systemName}/issues`
    const queryParams = new URLSearchParams()
    if (severity) queryParams.append('severity', severity)
    if (resourceType) queryParams.append('resource_type', resourceType)
    if (hasIssuesOnly) queryParams.append('has_issues_only', hasIssuesOnly)
    if (queryParams.toString()) url += `?${queryParams.toString()}`
    
    console.log(`[proxy] Fetching system LP issues from: ${url}`)
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      next: { revalidate: 30 }  // Cache for 30 seconds
    })
    
    if (!response.ok) {
      console.error(`[proxy] Backend error: ${response.status}`)
      return NextResponse.json(
        { error: `Backend error: ${response.status}`, resources: [], summary: {} },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    console.log(`[proxy] Got ${data.resources?.length || 0} LP issues for ${systemName}`)
    
    return NextResponse.json(data)
    
  } catch (error: any) {
    console.error('[proxy] System LP issues error:', error)
    return NextResponse.json(
      { error: error.message, resources: [], summary: {} },
      { status: 500 }
    )
  }
}


