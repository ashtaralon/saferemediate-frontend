// app/api/neo4j/query/route.ts
// Routes Neo4j queries through the Python backend (which already has Neo4j access)
// This avoids the 403 Forbidden error from Neo4j Aura

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cypher } = body

    if (!cypher || typeof cypher !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid cypher query' }, { status: 400 })
    }

    console.log('[Neo4j Proxy] Routing through backend:', BACKEND_URL)
    console.log('[Neo4j Proxy] Query preview:', cypher.substring(0, 100) + '...')

    // Route through your Python backend's graph query endpoint
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    try {
      const response = await fetch(`${BACKEND_URL}/api/graph/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ cypher }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Neo4j Proxy] Backend error:', response.status, errorText.substring(0, 200))
        
        let errorData: any = { detail: `Backend returned ${response.status}` }
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { detail: errorText || `Backend returned ${response.status}` }
        }
        
        return NextResponse.json(
          { error: errorData.detail || errorData.message || `Backend error: ${response.status}`, details: errorText },
          { status: response.status }
        )
      }

      const data = await response.json()
      console.log('[Neo4j Proxy] Success via backend:', {
        results: data.results?.length || 0,
        rows: data.results?.[0]?.data?.length || 0
      })
      
      return NextResponse.json(data)
      
    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      if (fetchError.name === 'AbortError') {
        console.error('[Neo4j Proxy] Request timeout')
        return NextResponse.json(
          { error: 'Request timeout - backend did not respond within 25 seconds' },
          { status: 504 }
        )
      }

      throw fetchError
    }
  } catch (error: any) {
    console.error('[Neo4j Proxy] Error:', error.message)
    return NextResponse.json(
      { error: 'Failed to execute query', details: error.message },
      { status: 500 }
    )
  }
}
