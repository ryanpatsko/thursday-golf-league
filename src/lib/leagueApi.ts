import type { LeagueData } from '../data/leagueTypes'
import { cloneDefaultLeagueData, ensureLakevueNorthHandicapsAndLabels } from '../data/defaultLeagueData'
import { getAdminAuthBaseUrl } from './adminAuth'
import { getLeagueDataUrl } from './leagueDataUrl'
import { migrateLeagueData } from './migrateLeagueData'

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text()
    if (text) {
      const parsed = JSON.parse(text) as { error?: string }
      if (typeof parsed.error === 'string') return `: ${parsed.error}`
    }
  } catch {
    /* ignore */
  }
  return ''
}

export async function fetchLeagueDataFromS3(): Promise<
  { ok: true; data: LeagueData } | { ok: false; message: string }
> {
  const url = getLeagueDataUrl()
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      return { ok: false, message: `Could not load league data (HTTP ${res.status}).` }
    }
    const raw = (await res.json()) as LeagueData
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.players)) {
      return { ok: false, message: 'League JSON is missing expected fields.' }
    }
    return { ok: true, data: migrateLeagueData(raw) }
  } catch {
    return {
      ok: false,
      message: `Failed to fetch ${url}. Upload seed JSON or check bucket CORS and public read.`,
    }
  }
}

/** Public home: S3 JSON when available, else local default seed (same as admin fallback). */
export async function loadLeagueDataForPublic(): Promise<LeagueData> {
  const result = await fetchLeagueDataFromS3()
  if (result.ok) return result.data
  const d = cloneDefaultLeagueData()
  return { ...d, course: ensureLakevueNorthHandicapsAndLabels(d.course) }
}

/** Loads remote data when available; otherwise seeds defaults for local-first admin. */
export async function loadLeagueDataForAdmin(): Promise<{
  data: LeagueData
  fromRemote: boolean
}> {
  const result = await fetchLeagueDataFromS3()
  if (result.ok) return { data: result.data, fromRemote: true }
  const d = cloneDefaultLeagueData()
  return {
    data: { ...d, course: ensureLakevueNorthHandicapsAndLabels(d.course) },
    fromRemote: false,
  }
}

/**
 * Fetches only the version number from S3 without downloading the full document.
 * Used for stale-data detection before a save.
 */
export async function fetchCurrentS3Version(): Promise<number | null> {
  const url = getLeagueDataUrl()
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const raw = (await res.json()) as { version?: unknown }
    return typeof raw?.version === 'number' ? raw.version : null
  } catch {
    return null
  }
}

export async function saveLeagueData(
  token: string,
  doc: LeagueData,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = getAdminAuthBaseUrl()
  if (!base) {
    return { ok: false, message: 'Admin API is not configured.' }
  }
  let res: Response
  try {
    res = await fetch(`${base}/league-data`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(doc),
    })
  } catch {
    return {
      ok: false,
      message: 'Network error saving to server. Check CORS and the Function URL.',
    }
  }
  if (!res.ok) {
    const detail = await readErrorDetail(res)
    return { ok: false, message: `Save failed (HTTP ${res.status}${detail}).` }
  }
  return { ok: true }
}
