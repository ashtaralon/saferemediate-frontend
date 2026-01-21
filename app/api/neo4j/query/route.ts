// app/api/neo4j/query/route.ts
// Routes Neo4j queries through the Python backend with retry logic for resilience

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

async function queryWithRetry(cypher: string, maxRetries = 3): Promise<Response> {
  let lastError: any = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)

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

      // If successful or non-retryable error, return immediately
      if (response.ok || response.status === 400) {
        return response
      }

      // For 500 errors, retry (could be session expiration)
      if (response.status === 500 && attempt < maxRetries) {
        const errorText = await response.text()
        console.log(`[Neo4j Proxy] Attempt ${attempt}/${maxRetries} failed (500), retrying...`, errorText.substring(0, 100))
        
        // Exponential backoff: wait 200ms, 400ms, 800ms
        await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, attempt - 1)))
        continue
      }

      return response
    } catch (error: any) {
      lastError = error

      if (error.name === 'AbortError') {
        throw error // Don't retry timeouts
      }

      // Retry on network errors
      if (attempt < maxRetries) {
        console.log(`[Neo4j Proxy] Attempt ${attempt}/${maxRetries} failed (network), retrying...`, error.message)
        await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, attempt - 1)))
        continue
      }

      throw error
    }
  }

  throw lastError || new Error('Max retries exceeded')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cypher } = body

    if (!cypher || typeof cypher !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid cypher query' }, { status: 400 })
    }

    console.log('[Neo4j Proxy] Routing through backend:', BACKEND_URL)
    console.log('[Neo4j Proxy] Query preview:', cypher.substring(0, 100) + '...')

    try {
      const response = await queryWithRetry(cypher)

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
