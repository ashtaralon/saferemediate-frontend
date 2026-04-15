import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

// Ephemeral port threshold — ports >= this are temporary client-side return
// ports from VPC Flow Logs, not real service ports the SG protects.
const EPHEMERAL_PORT_THRESHOLD = 32768

const PORT_ROLE_MAP: Record<number, string> = {
  22: 'admin', 80: 'web', 443: 'web', 3000: 'web', 3306: 'database',
  3389: 'admin', 5432: 'database', 6379: 'cache', 8080: 'web', 8443: 'web',
  9090: 'monitoring', 9200: 'logging', 27017: 'database', 53: 'dns',
  2049: 'nfs', 5672: 'messaging', 9092: 'kafka',
}

function filterEphemeralPorts(ports: any[]): {
  servicePorts: any[]; ephemeralCount: number; ephemeralConnections: number
} {
  const servicePorts: any[] = []
  let ephemeralCount = 0
  let ephemeralConnections = 0

  for (const p of ports) {
    const portNum = typeof p.port === 'string' ? parseInt(p.port, 10) : (p.port || 0)
    if (portNum >= EPHEMERAL_PORT_THRESHOLD) {
      ephemeralCount++
      ephemeralConnections += (p.connection_count || 0)
    } else {
      servicePorts.push(p)
    }
  }

  return { servicePorts, ephemeralCount, ephemeralConnections }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  try {
    const { sgId } = await params
    const days = req.nextUrl.searchParams.get("days") || "90"

    const backendUrl = `${BACKEND_URL}/api/sg-restructure/${sgId}/per-eni-analysis?days=${days}`
    console.log(`[proxy] sg-restructure/${sgId}/per-eni-analysis -> ${backendUrl}`)

    const res = await fetch(backendUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    })

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()

    // ── Ephemeral port filtering ──
    // VPC Flow Logs capture ALL ports including ephemeral (32768-65535).
    // Filter them out at the proxy so the UI only shows service ports.
    let totalEphemeralFiltered = 0
    const allServicePorts = new Set<number>()

    if (data.eni_analysis && Array.isArray(data.eni_analysis)) {
      for (const eni of data.eni_analysis) {
        const rawPorts = eni.observed_ports || []
        // Only filter if backend hasn't already done it
        // (check: if backend filtered, ephemeral_filtered will be set)
        if (eni.ephemeral_filtered != null) {
          // Backend already filtered — just collect service ports
          for (const p of rawPorts) allServicePorts.add(p.port)
          totalEphemeralFiltered += eni.ephemeral_filtered
        } else {
          const { servicePorts, ephemeralCount, ephemeralConnections } = filterEphemeralPorts(rawPorts)
          eni.observed_ports = servicePorts
          eni.ephemeral_filtered = ephemeralCount
          eni.ephemeral_connections = ephemeralConnections
          totalEphemeralFiltered += ephemeralCount
          for (const p of servicePorts) allServicePorts.add(p.port)
        }
      }
    }

    // Add summary if not already present
    if (!data.service_port_summary) {
      data.service_port_summary = Array.from(allServicePorts).sort((a, b) => a - b).map(p => ({
        port: p,
        role: PORT_ROLE_MAP[p] || 'service',
      }))
    }
    if (!data.ephemeral_ports_filtered) {
      data.ephemeral_ports_filtered = totalEphemeralFiltered
    }

    console.log(`[proxy] sg-restructure per-eni-analysis: ${allServicePorts.size} service ports, ${totalEphemeralFiltered} ephemeral filtered`)

    return NextResponse.json(data)
  } catch (e: any) {
    console.error("[proxy] sg-restructure per-eni-analysis error:", e.message)
    return NextResponse.json(
      { error: "Failed to fetch per-ENI analysis", detail: e.message },
      { status: 500 }
    )
  }
}
