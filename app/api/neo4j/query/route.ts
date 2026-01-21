// app/api/neo4j/query/route.ts
// Fixed version - explicitly uses Node.js runtime (not Edge)

import { NextRequest, NextResponse } from 'next/server'

// IMPORTANT: Force Node.js runtime (Edge runtime has fetch issues with some hosts)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Neo4j configuration
const NEO4J_CONFIG = {
  uri: process.env.NEO4J_URI || 'https://4e9962b7.databases.neo4j.io',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  password: process.env.NEO4J_PASSWORD || 'zxr4y5USTynIAh9VD7wej1Zq6UkQenJSOKunANe3aew'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cypher } = body

    if (!cypher || typeof cypher !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid cypher query' }, { status: 400 })
    }

    // Ensure URI starts with https://
    let neo4jUri = NEO4J_CONFIG.uri
    if (!neo4jUri.startsWith('http://') && !neo4jUri.startsWith('https://')) {
      // Convert bolt/neo4j schemes to https
      if (neo4jUri.startsWith('neo4j+s://') || neo4jUri.startsWith('bolt+s://')) {
        neo4jUri = neo4jUri.replace(/^(neo4j\+s|bolt\+s):\/\//, 'https://')
      } else if (neo4jUri.startsWith('neo4j://') || neo4jUri.startsWith('bolt://')) {
        neo4jUri = neo4jUri.replace(/^(neo4j|bolt):\/\//, 'https://')
      } else {
        neo4jUri = `https://${neo4jUri}`
      }
    }

    // Build the endpoint URL
    const endpoint = `${neo4jUri.replace(/\/$/, '')}/db/neo4j/tx/commit`
    
    console.log('[Neo4j API] Connecting to:', endpoint.split('@').pop())
    console.log('[Neo4j API] Query preview:', cypher.substring(0, 80) + '...')

    // Create Basic auth header using Buffer (Node.js)
    const auth = Buffer.from(`${NEO4J_CONFIG.username}:${NEO4J_CONFIG.password}`).toString('base64')

    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          statements: [{ statement: cypher }]
        }),
        signal: controller.signal,
        // @ts-ignore - Next.js specific option
        cache: 'no-store',
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Neo4j API] Error response:', response.status, errorText.substring(0, 200))
        return NextResponse.json(
          { error: `Neo4j error: ${response.status}`, details: errorText },
          { status: response.status }
        )
      }

      const data = await response.json()
      
      // Check for Neo4j-level errors
      if (data.errors && data.errors.length > 0) {
        console.error('[Neo4j API] Query errors:', data.errors)
        return NextResponse.json(
          { error: 'Neo4j query error', details: data.errors },
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
        console.error('[Neo4j API] Request timeout')
        return NextResponse.json(
          { error: 'Request timeout - Neo4j did not respond within 25 seconds' },
          { status: 504 }
        )
      }

      throw fetchError
    }
  } catch (error: any) {
    console.error('[Neo4j API] Connection error:', {
      message: error.message,
      cause: error.cause?.message || error.cause,
    })

    // Provide helpful error messages
    let errorMessage = 'Failed to connect to Neo4j'
    
    if (error.message?.includes('fetch failed')) {
      errorMessage = 'Network error connecting to Neo4j - check URI and network access'
    } else if (error.message?.includes('unknown scheme')) {
      errorMessage = 'Invalid URI scheme - ensure NEO4J_URI uses https://'
    } else if (error.message?.includes('ECONNREFUSED')) {
      errorMessage = 'Connection refused - Neo4j server may be down'
    } else if (error.message?.includes('certificate')) {
      errorMessage = 'SSL certificate error'
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error.message,
        hint: 'Ensure NEO4J_URI is set to https://YOUR_INSTANCE.databases.neo4j.io in Vercel environment variables'
      },
      { status: 500 }
    )
  }
}
