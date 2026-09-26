import { ApiError, type ApiErrorBody } from '../types/api'

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

async function parseErrorBody(res: Response): Promise<ApiErrorBody['error']> {
  try {
    const body = (await res.json()) as ApiErrorBody
    if (body?.error?.code && body?.error?.message) return body.error
  } catch {
    // fall through to generic error below
  }
  return { code: 'unknown_error', message: `Request failed with status ${res.status}` }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const { code, message } = await parseErrorBody(res)
    throw new ApiError(res.status, code, message)
  }
  // 204 No Content etc.
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
  })
  return handle<T>(res)
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return handle<T>(res)
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return handle<T>(res)
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: formData,
  })
  return handle<T>(res)
}
