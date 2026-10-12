import { NextRequest, NextResponse } from 'next/server'
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  ERROR_ORIGIN_HEADER,
  allowlistedBackendDetail,
  fromCaughtError,
  reviewProxyStatus,
} from "@/lib/server/proxy-error"

const BACKEND_URL = getBackendBaseUrl()

// Errors carry NO action counts. A backend 404 used to become a 200 with
// allowed/used/unused = 0, which the S3 policy card rendered as a bucket with
// nothing to remediate. Every failure, the 404 included, is now the house
// error shape (lib/server/proxy-error, as the LP issues and metrics proxies
// answer it): a non-2xx status, allowlisted typed detail only, no values.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bucketName: string }> }
) {
  const { bucketName } = await params
  const searchParams = request.nextUrl.searchParams
  const days = searchParams.get('days') || '90'
  const envelope = searchParams.get('envelope') === 'true'

  console.log('[Proxy] GET /api/proxy/s3-buckets/' + bucketName + '/gap-analysis')

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/s3-buckets/${encodeURIComponent(bucketName)}/gap-analysis?days=${days}${envelope ? '&envelope=true' : ''}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      }
    )
    
    if (!response.ok) {
      const raw = await response.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`[Proxy] S3 gap-analysis backend ${response.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `S3 gap-analysis backend returned ${response.status}`,
          ...(detail ? { detail } : {}),
          backendStatus: response.status,
          origin: "backend",
        },
        {
          status: reviewProxyStatus(response.status),
          headers: { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "backend" },
        },
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('[Proxy] S3 gap-analysis fetch error:', error instanceof Error ? error.message : error)
    // An unreachable backend is a 503 proxy error; no values.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
