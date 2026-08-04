import { type NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { approvalBackendHeaders } from "@/lib/server/approval-backend-auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = getBackendBaseUrl()

type ProxyError = {
  error: string
  detail?: string
}

function extractProxyError(payload: unknown, fallback: string): ProxyError | null {
  if (typeof payload === "string" && payload.trim()) {
    return { error: payload, detail: undefined as string | undefined }
  }

  if (payload && typeof payload === "object") {
    const record = payload as {
      error?: unknown
      message?: unknown
      detail?: unknown
      reason_code?: unknown
    }

    const nested: ProxyError | null =
      extractProxyError(record.detail, "") ||
      extractProxyError(record.error, "") ||
      extractProxyError(record.message, "")

    if (nested?.error) {
      const reasonCode =
        typeof record.reason_code === "string" && record.reason_code.trim().length > 0
          ? record.reason_code.trim()
          : undefined
      return {
        error: nested.error,
        detail: reasonCode ? `${nested.error} (${reasonCode})` : nested.detail,
      }
    }
  }

  return fallback ? { error: fallback, detail: undefined as string | undefined } : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await params
    const body = await request.json()
    const response = await fetch(
      `${BACKEND_URL}/api/iam-roles/approval-requests/${encodeURIComponent(requestId)}/execute`,
      {
        method: "POST",
        headers: approvalBackendHeaders(),
        body: JSON.stringify(body),
      },
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const normalized = extractProxyError(data, "Failed to execute approved IAM request")
      return NextResponse.json(
        {
          success: false,
          error: normalized?.error || "Failed to execute approved IAM request",
          detail: normalized?.detail,
          raw: data,
        },
        { status: response.status },
      )
    }
    return NextResponse.json(data, { status: response.status })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to execute approved IAM request",
      },
      { status: 500 },
    )
  }
}
