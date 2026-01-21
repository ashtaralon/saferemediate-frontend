// app/api/neo4j/query/route.ts
// Direct Neo4j HTTP API calls (bypassing Python backend which has driver issues)

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Neo4j Aura configuration
const NEO4J_URI = process.env.NEO4J_URI || 'https://4e9962b7.databases.neo4j.io'
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'zxr4y5USTynIAh9VD7wej1Zq6UkQenJSOKunANe3aew'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cypher } = body

    if (!cypher || typeof cypher !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid cypher query' }, { status: 400 })
    }

    // Build Neo4j HTTP endpoint URL
    let neo4jUrl = NEO4J_URI
    if (!neo4jUrl.startsWith('http://') && !neo4jUrl.startsWith('https://')) {
      if (neo4jUrl.startsWith('neo4j+s://') || neo4jUrl.startsWith('bolt+s://')) {
        neo4jUrl = neo4jUrl.replace(/^(neo4j\+s|bolt\+s):\/\//, 'https://')
      } else if (neo4jUrl.startsWith('neo4j://') || neo4jUrl.startsWith('bolt://')) {
        neo4jUrl = neo4jUrl.replace(/^(neo4j|bolt):\/\//, 'https://')
      } else {
        neo4jUrl = `https://${neo4jUrl}`
      }
    }

    const endpoint = neo4jUrl.endsWith('/')
      ? `${neo4jUrl}db/neo4j/tx/commit`
      : `${neo4jUrl}/db/neo4j/tx/commit`

    console.log('[Neo4j API] Direct HTTP query to:', endpoint.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'))
    console.log('[Neo4j API] Query preview:', cypher.substring(0, 80) + '...')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${NEO4J_USERNAME}:${NEO4J_PASSWORD}`),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ statements: [{ statement: cypher }] }),
        cache: 'no-store',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Neo4j API] HTTP error:', response.status, errorText.substring(0, 200))
        return NextResponse.json(
          { error: `Neo4j returned ${response.status}: ${response.statusText}`, details: errorText },
          { status: response.status }
        )
      }

      const data = await response.json()

      // Check for Neo4j errors in response
      if (data.errors && data.errors.length > 0) {
        console.error('[Neo4j API] Query errors:', data.errors)
        return NextResponse.json(
          { error: data.errors[0].message || 'Neo4j query error', details: JSON.stringify(data.errors) },
          { status: 400 }
        )
      }

      console.log('[Neo4j API] Success:', {
        results: data.results?.length || 0,
        rows: data.results?.[0]?.data?.length || 0
      })

      return NextResponse.json(data)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      if (fetchError.name === 'AbortError') {
        console.error('[Neo4j API] Request timeout after 25 seconds')
        return NextResponse.json(
          { error: 'Request timeout - Neo4j did not respond within 25 seconds' },
          { status: 504 }
        )
      }

      throw fetchError
    }
  } catch (error: any) {
    console.error('[Neo4j API] Error:', error.message, error.cause?.message)

    let errorMessage = 'Failed to connect to Neo4j'
    if (error.message?.includes('ECONNREFUSED')) {
      errorMessage = 'Connection refused - Neo4j server may be down'
    } else if (error.message?.includes('ENOTFOUND')) {
      errorMessage = 'DNS resolution failed - Check Neo4j URI'
    } else if (error.message?.includes('fetch failed')) {
      errorMessage = 'Network error - Cannot reach Neo4j server'
    }

    return NextResponse.json(
      { error: errorMessage, details: error.message },
      { status: 500 }
    )
  }
}
