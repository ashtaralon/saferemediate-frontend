import { NextRequest, NextResponse } from 'next/server'

// Neo4j configuration - should be moved to environment variables
const NEO4J_CONFIG = {
  uri: process.env.NEO4J_URI || 'https://4e9962b7.databases.neo4j.io',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  password: process.env.NEO4J_PASSWORD || 'zxr4y5USTynIAh9VD7wej1Zq6UkQenJSOKunANe3aew'
}

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const { cypher } = await request.json()

    if (!cypher) {
      return NextResponse.json({ error: 'Missing cypher query' }, { status: 400 })
    }

    const auth = Buffer.from(`${NEO4J_CONFIG.username}:${NEO4J_CONFIG.password}`).toString('base64')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000) // 25 second timeout

    try {
      const response = await fetch(`${NEO4J_CONFIG.uri}/db/neo4j/tx/commit`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statements: [{ statement: cypher }]
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Neo4j API] Neo4j error:', response.status, errorText)
        return NextResponse.json(
          { error: `Neo4j error: ${response.status}`, details: errorText }, 
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json(data)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout - Query took longer than 25 seconds' },
          { status: 504 }
        )
      }
      
      throw fetchError
    }
  } catch (error: any) {
    console.error('[Neo4j API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' }, 
      { status: 500 }
    )
  }
}
