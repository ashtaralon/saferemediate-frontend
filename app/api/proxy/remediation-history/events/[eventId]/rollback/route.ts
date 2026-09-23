import { NextRequest, NextResponse } from 'next/server'
import { getBackendBaseUrl } from '@/lib/server/backend-url'
import { isSameOriginMutation, serverDerivedOperatorHeaders } from '@/lib/server/operator-session'

const BACKEND_URL = getBackendBaseUrl()

function refusal(status: number, code: string) {
  return NextResponse.json({ success: false, detail: { code } }, { status })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  if (!isSameOriginMutation(req)) return refusal(403, 'EVENT_RESTORE_ORIGIN_REFUSED')
  const { eventId } = await params
  if (!eventId || eventId.includes('/')) return refusal(422, 'EVENT_ID_INVALID')
  const path = `${BACKEND_URL}/api/remediation-history/events/${encodeURIComponent(eventId)}`
  try {
    // This endpoint serves IAM, SG and S3. Classify from the backend's
    // recorded event; a browser-supplied resource_type cannot grant a bypass.
    const headers = { Accept: 'application/json', ...(await serverDerivedOperatorHeaders(req)) }
    const detailsResponse = await fetch(path, { headers, cache: 'no-store' })
    const details = await detailsResponse.json().catch(() => null)
    if (!detailsResponse.ok) return NextResponse.json(details ?? { detail: { code: 'EVENT_LOOKUP_UNAVAILABLE' } }, { status: detailsResponse.status })
    const resourceType = details?.resource_type
    if (resourceType === 'IAMRole') return refusal(422, 'IAM_EXACT_OPERATION_REQUIRED')
    if (resourceType !== 'SecurityGroup' && resourceType !== 'S3Bucket') {
      return refusal(422, 'EVENT_RESOURCE_TYPE_UNVERIFIED')
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return refusal(422, 'EVENT_RESTORE_BODY_INVALID')
    const response = await fetch(`${path}/rollback`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const result = await response.json().catch(() => null)
    return NextResponse.json(result ?? { detail: { code: 'EVENT_RESTORE_RESPONSE_INVALID' } }, { status: response.status })
  } catch {
    return refusal(503, 'EVENT_RESTORE_UNAVAILABLE')
  }
}
