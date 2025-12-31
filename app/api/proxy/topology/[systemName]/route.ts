import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  try {
    const { systemName } = await params
    const { searchParams } = new URL(request.url)
    const includeEdges = searchParams.get('include_edges') ?? 'true'
    const limit = searchParams.get('limit') ?? '100'
    
    const url = `${BACKEND_URL}/api/topology/${systemName}?include_edges=${includeEdges}&limit=${limit}`
    
    console.log(`[proxy] Fetching topology from: ${url}`)
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      next: { revalidate: 30 }  // Cache for 30 seconds
    })
    
    if (!response.ok) {
      console.error(`[proxy] Topology backend error: ${response.status}`)
      return NextResponse.json(
        { error: `Backend error: ${response.status}`, nodes: [], edges: [] },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    console.log(`[proxy] Got ${data.nodes?.length || 0} nodes, ${data.edges?.length || 0} edges for ${systemName}`)
    
    return NextResponse.json(data)
    
  } catch (error: any) {
    console.error('[proxy] Topology error:', error)
    return NextResponse.json(
      { error: error.message, nodes: [], edges: [] },
      { status: 500 }
    )
  }
}

