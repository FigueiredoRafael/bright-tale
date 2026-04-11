import 'server-only';

export type ApiError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<ApiResult<T>> {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) throw new Error('INTERNAL_API_KEY is not set');

  const res = await fetch(`http://localhost:${process.env.API_PORT ?? 3001}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': internalKey,
      ...init.headers,
    },
  });

  const json = await res.json();
  if (!res.ok) return { data: null, error: json.error };
  return { data: json.data as T, error: null };
}

export const api = {
  projects: {
    list: () => request<unknown[]>('/api/projects'),
    get: (id: string) => request<unknown>(`/api/projects/${id}`),
    create: (body: unknown) => request<unknown>('/api/projects', {
      method: 'POST', body: JSON.stringify(body),
    }),
    update: (id: string, body: unknown) => request<unknown>(`/api/projects/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
  },
};
