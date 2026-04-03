const STORAGE_KEY = 'golf-league-admin-session-token'

export function getAdminAuthBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_ADMIN_AUTH_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return ''
}

export function isAdminAuthConfigured(): boolean {
  return getAdminAuthBaseUrl().length > 0
}

export function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredSessionToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token)
  } catch {
    /* ignore */
  }
}

export function clearStoredSessionToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export async function adminLogin(
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = getAdminAuthBaseUrl()
  if (!base) {
    return { ok: false, message: 'Admin sign-in is not configured for this environment.' }
  }
  let res: Response
  try {
    res = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
  } catch {
    return {
      ok: false,
      message:
        'Network error (request never reached the server). Check the Function URL, CORS, and auth type NONE.',
    }
  }
  if (!res.ok) {
    if (res.status === 401) {
      return { ok: false, message: 'Incorrect password.' }
    }
    let detail = ''
    try {
      const text = await res.text()
      if (text) {
        const parsed = JSON.parse(text) as { error?: string }
        if (typeof parsed.error === 'string') detail = `: ${parsed.error}`
      }
    } catch {
      /* ignore */
    }
    return { ok: false, message: `Could not sign in (HTTP ${res.status}${detail}).` }
  }
  let data: { token?: string }
  try {
    data = (await res.json()) as { token?: string }
  } catch {
    return { ok: false, message: 'Unexpected response from server (not JSON).' }
  }
  if (!data.token) {
    return { ok: false, message: 'Unexpected response from server.' }
  }
  setStoredSessionToken(data.token)
  return { ok: true }
}

export async function adminVerifySession(token: string): Promise<boolean> {
  const base = getAdminAuthBaseUrl()
  if (!base) return false
  try {
    const res = await fetch(`${base}/verify`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}
