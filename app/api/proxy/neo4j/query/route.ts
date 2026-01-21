import { NextRequest, NextResponse } from 'next/server'

// Neo4j configuration from environment variables
const NEO4J_URI = process.env.NEO4J_URI || 'https://4e9962b7.databases.neo4j.io'
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'zxr4y5USTynIAh9VD7wej1Zq6UkQenJSOKunANe3aew'

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

    // Log configuration (without exposing password)
    console.log('[Neo4j Proxy] Config:', {
      uri: NEO4J_URI,
      username: NEO4J_USERNAME,
      passwordSet: !!NEO4J_PASSWORD,
      queryPreview: cypher.substring(0, 100) + '...'
    })

    // Build Neo4j HTTP endpoint URL
    // For Neo4j Aura, the HTTP API is at: https://<instance-id>.databases.neo4j.io/db/neo4j/tx/commit
    let neo4jUrl = NEO4J_URI
    if (!neo4jUrl.startsWith('http://') && !neo4jUrl.startsWith('https://')) {
      // If URI is in bolt format (neo4j+s://), convert to HTTPS
      if (neo4jUrl.startsWith('neo4j+s://') || neo4jUrl.startsWith('bolt+s://')) {
        neo4jUrl = neo4jUrl.replace(/^(neo4j\+s|bolt\+s):\/\//, 'https://')
      } else if (neo4jUrl.startsWith('neo4j://') || neo4jUrl.startsWith('bolt://')) {
        neo4jUrl = neo4jUrl.replace(/^(neo4j|bolt):\/\//, 'https://')
      } else {
        neo4jUrl = `https://${neo4jUrl}`
      }
    }
    
    // Ensure we have the correct path
    const endpoint = neo4jUrl.endsWith('/') 
      ? `${neo4jUrl}db/neo4j/tx/commit`
      : `${neo4jUrl}/db/neo4j/tx/commit`

    console.log('[Neo4j Proxy] Connecting to:', endpoint.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'))

    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000) // 25 second timeout

    try {
      // Forward request to Neo4j with timeout
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
        console.error('[Neo4j Proxy] Neo4j HTTP error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText.substring(0, 200)
        })
        return NextResponse.json(
          { error: `Neo4j returned ${response.status}: ${response.statusText}`, details: errorText },
          { status: response.status }
        )
      }

      const data = await response.json()
      console.log('[Neo4j Proxy] Success:', {
        results: data.results?.length || 0,
        errors: data.errors?.length || 0
      })
      return NextResponse.json(data)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        console.error('[Neo4j Proxy] Request timeout after 25 seconds')
        return NextResponse.json(
          { error: 'Request timeout - Neo4j did not respond within 25 seconds', details: 'Timeout' },
          { status: 504 }
        )
      }
      
      // Re-throw to be caught by outer catch
      throw fetchError
    }
  } catch (error: any) {
    console.error('[Neo4j Proxy] Connection error:', {
      message: error.message,
      name: error.name,
      cause: error.cause?.message,
      stack: error.stack?.substring(0, 200)
    })
    
    // Provide more specific error messages
    let errorMessage = 'Failed to connect to Neo4j'
    let errorDetails = error.message
    
    if (error.message?.includes('ECONNREFUSED')) {
      errorMessage = 'Connection refused - Neo4j server may be down or unreachable'
    } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('getaddrinfo')) {
      errorMessage = 'DNS resolution failed - Check Neo4j URI'
    } else if (error.message?.includes('certificate') || error.message?.includes('SSL')) {
      errorMessage = 'SSL/TLS certificate error - Check Neo4j connection security'
    } else if (error.message?.includes('fetch failed')) {
      errorMessage = 'Network error - Cannot reach Neo4j server'
      errorDetails = 'This usually means the Neo4j URI is incorrect or the server is not accessible from Vercel'
    }
    
    return NextResponse.json(
      { 
        error: errorMessage, 
        details: errorDetails,
        hint: 'Check that NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD are set correctly in Vercel environment variables'
      },
      { status: 500 }
    )
  }
}
