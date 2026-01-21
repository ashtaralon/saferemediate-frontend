import { NextRequest, NextResponse } from 'next/server'

// Neo4j configuration from environment variables
const NEO4J_URI = process.env.NEO4J_URI || 'https://4e9962b7.databases.neo4j.io'
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'zxr4y5USTynIAh9VD7wej1Zq6UkQenJSOKunANe3aew'

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

    console.log('[Neo4j Proxy] Executing query:', cypher.substring(0, 100) + '...')

    // Forward request to Neo4j
    const response = await fetch(`${NEO4J_URI}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${NEO4J_USERNAME}:${NEO4J_PASSWORD}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ statements: [{ statement: cypher }] }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Neo4j Proxy] Neo4j error:', response.status, errorText)
      return NextResponse.json(
        { error: `Neo4j returned ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[Neo4j Proxy] Error:', error.message)
    return NextResponse.json(
      { error: 'Failed to connect to Neo4j', details: error.message },
      { status: 500 }
    )
  }
}
