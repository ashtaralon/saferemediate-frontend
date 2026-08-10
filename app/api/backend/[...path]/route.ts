import {getBackendBaseUrl} from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"

async function forward(request: Request, context: {params: Promise<{path: string[]}>}) {
  const {path} = await context.params
  const incoming = new URL(request.url)
  const target = new URL(path.map(encodeURIComponent).join("/"), `${getBackendBaseUrl()}/`)
  target.search = incoming.search

  const headers = new Headers(request.headers)
  headers.delete("host")
  headers.delete("cookie")
  headers.delete("authorization")
  headers.delete("x-cyntro-service-token")

  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
    redirect: "manual",
  })

  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete("set-cookie")
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

export const GET = forward
export const POST = forward
export const PUT = forward
export const PATCH = forward
export const DELETE = forward
