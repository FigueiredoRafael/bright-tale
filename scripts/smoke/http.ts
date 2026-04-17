export interface SmokeRequestInput {
  apiUrl: string
  internalKey: string
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  userId: string | null
  forwardedFor?: string
  body?: unknown
  rawBody?: string
  extraHeaders?: Record<string, string>
}

export interface SmokeResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

export async function smokeRequest(input: SmokeRequestInput): Promise<SmokeResponse> {
  const url = new URL(input.path, input.apiUrl).toString()
  const hasRawBody = input.rawBody !== undefined
  const hasJsonBody = input.body !== undefined && !hasRawBody
  const headers: Record<string, string> = {
    'X-Internal-Key': input.internalKey,
    ...(input.userId ? { 'x-user-id': input.userId } : {}),
    ...(input.forwardedFor ? { 'x-forwarded-for': input.forwardedFor } : {}),
    ...(hasJsonBody ? { 'content-type': 'application/json' } : {}),
    ...(input.extraHeaders ?? {}),
  }
  const requestBody = hasRawBody
    ? input.rawBody
    : hasJsonBody ? JSON.stringify(input.body) : undefined
  const res = await fetch(url, {
    method: input.method,
    headers,
    body: requestBody,
    redirect: 'manual',
  })
  const outHeaders: Record<string, string> = {}
  res.headers.forEach((v, k) => { outHeaders[k] = v })
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  let body: unknown = text
  if (contentType.includes('application/json') && text.length > 0) {
    try { body = JSON.parse(text) }
    catch { /* keep raw text */ }
  }
  return { status: res.status, headers: outHeaders, body }
}
