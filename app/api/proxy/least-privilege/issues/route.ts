import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache
let cachedData: any = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes in ms

const EMPTY_RESPONSE = {
  summary: {
    totalResources: 0,
    totalExcessPermissions: 0,
    avgLPScore: 100,
    iamIssuesCount: 0,
    networkIssuesCount: 0,
    s3IssuesCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    confidenceLevel: 0,
    observationDays: 365,
    attackSurfaceReduction: 0
  },
  resources: [],
  timestamp: new Date().toISOString()
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const observationDays = url.searchParams.get("observationDays") ?? "365"
  const forceRefresh = url.searchParams.get("refresh") === "true"
  
  const cacheKey = `${systemName}-${observationDays}`
  const now = Date.now()
  
  // Return cached data if valid and not forcing refresh
  if (!forceRefresh && cachedData && cachedData.cacheKey === cacheKey && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('[LP Proxy] Returning cached data')
    const cacheAge = Math.round((now - cacheTimestamp) / 1000)
    return NextResponse.json({
      ...cachedData.data,
      fromCache: true,
      cacheAge
    }, {
      headers: {
        'X-Cache': 'HIT',
        'X-Cache-Age': String(cacheAge),
      }
    })
  }
  
  console.log(`[LP Proxy] Fetching fresh data from backend... (refresh=${forceRefresh})`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000) // 55 second timeout

    // Build backend URL with parameters
    let backendUrl = `${BACKEND_URL}/api/least-privilege/issues?observationDays=${observationDays}`
    if (systemName) {
      backendUrl += `&systemName=${encodeURIComponent(systemName)}`
    }

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[LP Proxy] Backend returned ${res.status}: ${errorText}`)
      
      // Return stale cache if available
      if (cachedData && cachedData.cacheKey === cacheKey) {
        console.log('[LP Proxy] Returning stale cache due to backend error')
        return NextResponse.json({
          ...cachedData.data,
          fromCache: true,
          stale: true,
          cacheAge: Math.round((now - cacheTimestamp) / 1000)
        }, {
          headers: { 'X-Cache': 'STALE' }
        })
      }
      
      // Return empty structure to avoid breaking UI
      return NextResponse.json({
        ...EMPTY_RESPONSE,
        observationDays: parseInt(observationDays)
      }, { status: 200 })
    }

    const data = await res.json()

    // Check if we got any Security Groups from the backend
    const sgCount = (data.resources || []).filter((r: any) => r.resourceType === 'SecurityGroup').length
    console.log(`[LP Proxy] Backend returned ${sgCount} SecurityGroups`)

    // If no SGs from backend, fetch from infrastructure endpoint and merge
    if (sgCount === 0) {
      try {
        console.log('[LP Proxy] Fetching SGs from infrastructure endpoint...')
        const sgRes = await fetch(`${BACKEND_URL}/api/infrastructure/security-groups`, {
          cache: "no-store",
          headers: { "Accept": "application/json" },
        })

        if (sgRes.ok) {
          const sgData = await sgRes.json()
          const sgs = Array.isArray(sgData) ? sgData : []
          console.log(`[LP Proxy] Got ${sgs.length} SGs from infrastructure`)

          // Transform SGs to LP resource format
          const sgResources = sgs.map((sg: any) => ({
            id: sg.id,
            resourceType: 'SecurityGroup',
            resourceName: sg.name || sg.id,
            resourceId: sg.id,
            resourceArn: `arn:aws:ec2:eu-west-1:745783559495:security-group/${sg.id}`,
            systemName: sg.tags?.SystemName || systemName,
            vpcId: sg.vpc_id,
            hasPublicIngress: sg.ingress_rules > 0,
            lpScore: 50, // Default score - click to analyze
            allowedCount: sg.ingress_rules || 0,
            usedCount: 0,
            gapCount: sg.ingress_rules || 0,
            gapPercent: 100,
            severity: 'MEDIUM',
            confidence: 'LOW',
            gapCategory: 'network',
            observationDays: parseInt(observationDays),
            title: `Security Group: ${sg.name || sg.id}`,
            description: `${sg.ingress_rules || 0} inbound rules, ${sg.egress_rules || 0} outbound rules`,
            remediation: 'Click to run LP analysis',
            sgDescription: sg.description,
            evidence: {
              dataSources: ['AWS EC2'],
              observationDays: parseInt(observationDays),
              confidence: 'LOW',
              needsAnalysis: true
            }
          }))

          // Merge SGs into resources
          data.resources = [...(data.resources || []), ...sgResources]

          // Update summary counts
          if (data.summary) {
            data.summary.totalResources = (data.summary.totalResources || 0) + sgResources.length
            data.summary.networkIssuesCount = (data.summary.networkIssuesCount || 0) + sgResources.length
          }

          console.log(`[LP Proxy] Merged ${sgResources.length} SGs, total resources: ${data.resources.length}`)
        }
      } catch (sgError) {
        console.error('[LP Proxy] Failed to fetch SGs from infrastructure:', sgError)
      }
    }

    // Update cache
    cachedData = { cacheKey, data }
    cacheTimestamp = now

    console.log(`[LP Proxy] Cached ${data.resources?.length || 0} resources`)

    return NextResponse.json({
      ...data,
      fromCache: false
    }, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      }
    })
  } catch (error: any) {
    console.error("[LP Proxy] Error:", error.message)

    // Return stale cache if available
    if (cachedData && cachedData.cacheKey === cacheKey) {
      console.log('[LP Proxy] Returning stale cache due to error')
      return NextResponse.json({
        ...cachedData.data,
        fromCache: true,
        stale: true,
        cacheAge: Math.round((now - cacheTimestamp) / 1000)
      }, {
        headers: { 'X-Cache': 'STALE' }
      })
    }

    // Return empty structure on any error
    return NextResponse.json({
      ...EMPTY_RESPONSE,
      observationDays: parseInt(observationDays)
    }, { status: 200 })
  }
}
