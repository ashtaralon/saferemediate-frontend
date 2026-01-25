// app/api/neo4j/graph/route.ts
// Direct Neo4j graph data endpoint for FlowStripView

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Neo4j Aura configuration
const NEO4J_URI = process.env.NEO4J_URI || 'https://4e9962b7.databases.neo4j.io'
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'zxr4y5USTynIAh9VD7wej1Zq6UkQenJSOKunANe3aew'

async function queryNeo4j(cypher: string): Promise<any> {
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${NEO4J_USERNAME}:${NEO4J_PASSWORD}`).toString('base64'),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ statements: [{ statement: cypher }] }),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Neo4j returned ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()
  if (data.errors && data.errors.length > 0) {
    throw new Error(data.errors[0].message || 'Neo4j query error')
  }

  return data
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const maxNodes = parseInt(url.searchParams.get("maxNodes") ?? "500")

  console.log(`[Neo4j Graph] Fetching graph data for ${systemName}`)

  try {
    // Query for all nodes (AWS resources)
    const nodesQuery = `
      MATCH (n)
      WHERE n.system_name = $systemName OR n.system = $systemName OR true
      RETURN
        COALESCE(n.id, n.resource_id, id(n)) as id,
        COALESCE(n.name, n.resource_name, n.id, 'Unknown') as name,
        COALESCE(n.type, n.resource_type, labels(n)[0], 'Unknown') as type,
        COALESCE(n.category, 'Resource') as category,
        n.vpc_id as vpc_id,
        n.subnet_id as subnet_id,
        COALESCE(n.is_internet_exposed, false) as is_internet_exposed,
        n.arn as arn,
        labels(n) as labels
      LIMIT ${maxNodes}
    `

    // Query for all relationships (traffic, connections)
    const edgesQuery = `
      MATCH (source)-[r]->(target)
      RETURN
        COALESCE(source.id, source.resource_id, id(source)) as source,
        COALESCE(target.id, target.resource_id, id(target)) as target,
        type(r) as edge_type,
        COALESCE(r.port, r.destination_port, '') as port,
        COALESCE(r.protocol, 'TCP') as protocol,
        COALESCE(r.bytes, r.traffic_bytes, 0) as traffic_bytes,
        COALESCE(r.is_used, true) as is_used
      LIMIT 10000
    `

    console.log('[Neo4j Graph] Executing nodes query...')
    const nodesResult = await queryNeo4j(nodesQuery)

    console.log('[Neo4j Graph] Executing edges query...')
    const edgesResult = await queryNeo4j(edgesQuery)

    // Transform Neo4j results to nodes/edges format
    const nodes = nodesResult.results?.[0]?.data?.map((row: any, idx: number) => {
      const values = row.row || row
      return {
        id: values[0]?.toString() || `node-${idx}`,
        name: values[1] || 'Unknown',
        type: values[2] || 'Unknown',
        category: values[3] || 'Resource',
        vpc_id: values[4],
        subnet_id: values[5],
        is_internet_exposed: values[6] || false,
        arn: values[7],
        labels: values[8] || [],
      }
    }) || []

    const edges = edgesResult.results?.[0]?.data?.map((row: any, idx: number) => {
      const values = row.row || row
      return {
        id: `edge-${idx}`,
        source: values[0]?.toString() || '',
        target: values[1]?.toString() || '',
        edge_type: values[2] || 'CONNECTS_TO',
        port: values[3]?.toString() || '',
        protocol: values[4] || 'TCP',
        traffic_bytes: values[5] || 0,
        is_used: values[6] !== false,
      }
    }) || []

    console.log(`[Neo4j Graph] Success: ${nodes.length} nodes, ${edges.length} edges`)

    return NextResponse.json({
      nodes,
      edges,
      source: 'neo4j-direct',
      system_name: systemName,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    })

  } catch (error: any) {
    console.error('[Neo4j Graph] Error:', error.message)

    // Check for common Neo4j Aura issues
    let errorMessage = error.message
    if (error.message?.includes('403')) {
      errorMessage = 'Neo4j Aura IP allowlist is blocking this request. Add 0.0.0.0/0 to your Neo4j Aura IP allowlist to allow Vercel serverless functions.'
      console.error('[Neo4j Graph] TIP: Go to Neo4j Aura Console → Security → IP Allowlist → Add 0.0.0.0/0')
    }

    return NextResponse.json({
      nodes: [],
      edges: [],
      error: errorMessage,
      source: 'neo4j-direct',
    }, {
      status: 200, // Return 200 to prevent UI crashes
      headers: {
        "Cache-Control": "no-store",
      },
    })
  }
}
