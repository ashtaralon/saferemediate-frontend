import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  'https://saferemediate-backend-f.onrender.com'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cypher } = body

    if (!cypher || typeof cypher !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid cypher query' },
        { status: 400 }
      )
    }

    console.log('[Graph Query Proxy] Executing query:', cypher.substring(0, 100) + '...')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000) // 25 second timeout

    try {
      const response = await fetch(`${BACKEND_URL}/api/graph/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ cypher }),
        cache: 'no-store',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Graph Query Proxy] Backend error:', response.status, errorText)
        
        let errorData: any = { detail: `Backend returned ${response.status}` }
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { detail: errorText || `Backend returned ${response.status}` }
        }

        return NextResponse.json(
          { error: errorData.detail || errorData.message || `Query failed: ${response.status}` },
          { status: response.status }
        )
      }

      const data = await response.json()
      console.log('[Graph Query Proxy] Success:', {
        results: data.results?.length || 0,
        errors: data.errors?.length || 0
      })

      return NextResponse.json(data)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        console.error('[Graph Query Proxy] Request timeout after 25 seconds')
        return NextResponse.json(
          { error: 'Request timeout - Query took longer than 25 seconds', details: 'Timeout' },
          { status: 504 }
        )
      }
      
      throw fetchError
    }
  } catch (error: any) {
    console.error('[Graph Query Proxy] Error:', error.message)
    return NextResponse.json(
      { 
        error: 'Failed to execute query', 
        details: error.message 
      },
      { status: 500 }
    )
  }
}
